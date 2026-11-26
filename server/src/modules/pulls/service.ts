import type { GitHubClient, PrMeta, PrDetail, PrReviewComment, PrCommentInput } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { CostEstimator, RoundUsage } from '../reviews/cost.js';

/** Usage per PR, as the reviews module computes it (structural, no repo import). */
export interface PrUsage {
  total: Map<string, RoundUsage>;
  latestRound: Map<string, RoundUsage>;
}
import type { PullsRepository, PullRow, RepoRow } from './repository.js';
import {
  BACKFILL_LIMIT,
  DETAIL_REFRESH_TTL_MS,
  MISSING_PR_SYNC_INTERVAL_MS,
} from './constants.js';
import { isSyncDue, needsDiffStats, severityCountsByPr, toPrDetail, toPrMeta } from './helpers.js';

/** Minimal pino-compatible logger. */
export interface PullsLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface PullsServiceDeps {
  repo: PullsRepository;
  /** Usage per PR (cost + tokens), owned by the reviews module. */
  usageForPulls: (prIds: string[], estimate: CostEstimator) => Promise<PrUsage>;
  /** Resolves the GitHub client; rejects when no token is configured. */
  github: () => Promise<GitHubClient>;
  estimate: CostEstimator;
  log: PullsLogger;
  now?: () => number;
}

/**
 * Pulls application service. Local-first: reads are served from Postgres, and
 * GitHub is consulted only when a sync is due (list) or the cached detail is
 * stale (detail), so polling clients don't spend GitHub quota on every call.
 */
export class PullsService {
  private readonly now: () => number;
  /** prId → last successful detail refresh (per process). */
  private readonly detailRefreshedAt = new Map<string, number>();

  constructor(private readonly deps: PullsServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  // ---- PR list --------------------------------------------------------------

  async list(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (isSyncDue(repo.lastPolledAt, this.now())) {
      await this.trySync(workspaceId, repo);
    }
    const rows = await this.deps.repo.listForRepo(repo.id);
    const prIds = rows.map((r) => r.id);
    const [scores, usage, findings] = await Promise.all([
      this.deps.repo.latestScores(prIds),
      this.deps.usageForPulls(prIds, this.deps.estimate),
      this.deps.repo.listReviewFindings(prIds),
    ]);
    const severity = severityCountsByPr(findings);
    const now = this.now();
    return rows.map((r) =>
      toPrMeta(r, {
        score: scores.get(r.id),
        usage: usage.total.get(r.id),
        severity: severity.get(r.id),
        now,
      }),
    );
  }

  /**
   * Import GitHub's PR list (one batched upsert) and back-fill missing diff
   * stats for up to BACKFILL_LIMIT PRs. Throws when GitHub is unavailable.
   * The only writer of pull_requests rows from GitHub.
   */
  async syncFromGitHub(workspaceId: string, repoId: string): Promise<{ synced: number }> {
    const repo = await this.requireRepo(workspaceId, repoId);
    return this.sync(workspaceId, repo, await this.deps.github());
  }

  // ---- PR detail ------------------------------------------------------------

  async detail(workspaceId: string, prId: string): Promise<PrDetail> {
    const found = await this.deps.repo.getPrWithRepo(workspaceId, prId);
    if (!found) throw new NotFoundError('Pull request not found');
    return this.detailFor(found.pr, found.repo);
  }

  async detailByNumber(workspaceId: string, repoId: string, number: number): Promise<PrDetail> {
    const repo = await this.requireRepo(workspaceId, repoId);
    let pr = await this.deps.repo.getPrByNumber(workspaceId, repo.id, number);
    if (!pr && isSyncDue(repo.lastPolledAt, this.now(), MISSING_PR_SYNC_INTERVAL_MS)) {
      // A PR opened since the last sync: pull the list once before giving up.
      await this.trySync(workspaceId, repo);
      pr = await this.deps.repo.getPrByNumber(workspaceId, repo.id, number);
    }
    if (!pr) throw new NotFoundError('Pull request not found');
    return this.detailFor(pr, repo);
  }

  // ---- Inline review comments (proxied live to GitHub) ---------------------

  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.requirePr(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
      return [];
    }
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.requirePr(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }

  // ---- internals ------------------------------------------------------------

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.deps.repo.getRepoForWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private async requirePr(workspaceId: string, prId: string) {
    const found = await this.deps.repo.getPrWithRepo(workspaceId, prId);
    if (!found) throw new NotFoundError('Pull request not found');
    return found;
  }

  /** Sync, but never fail a read: offline / no token serves persisted PRs. */
  private async trySync(workspaceId: string, repo: RepoRow): Promise<void> {
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
      return;
    }
    try {
      await this.sync(workspaceId, repo, gh);
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub PR sync skipped (offline / error); serving persisted PRs');
    }
  }

  private async sync(workspaceId: string, repo: RepoRow, gh: GitHubClient): Promise<{ synced: number }> {
    const ref = { owner: repo.owner, name: repo.name };
    const pulls = await gh.listPullRequests(ref);
    await this.deps.repo.upsertMany(workspaceId, repo.id, pulls);
    await this.deps.repo.touchPolled(repo.id, new Date(this.now()));

    const missing = (await this.deps.repo.listForRepo(repo.id))
      .filter(needsDiffStats)
      .slice(0, BACKFILL_LIMIT);
    for (const r of missing) {
      try {
        const d = await gh.getPullRequest(ref, r.number);
        await this.deps.repo.updateDiffStats(r.id, {
          additions: d.additions,
          deletions: d.deletions,
          filesCount: d.files_count,
        });
      } catch (err) {
        this.deps.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
    return { synced: pulls.length };
  }

  private async detailFor(pr: PullRow, repo: RepoRow): Promise<PrDetail> {
    const usage = await this.deps.usageForPulls([pr.id], this.deps.estimate);
    const usageFor = { total: usage.total.get(pr.id), latestRound: usage.latestRound.get(pr.id) };

    const last = this.detailRefreshedAt.get(pr.id);
    if (last === undefined || this.now() - last >= DETAIL_REFRESH_TTL_MS) {
      try {
        const gh = await this.deps.github();
        const fresh = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
        await this.deps.repo.replaceDetail(pr.id, fresh);
        this.detailRefreshedAt.set(pr.id, this.now());
        return {
          ...fresh,
          id: pr.id,
          cost_usd: usageFor.total?.cost_usd ?? null,
          tokens_in: usageFor.total?.tokens_in ?? null,
          tokens_out: usageFor.total?.tokens_out ?? null,
          latest_round_cost_usd: usageFor.latestRound?.cost_usd ?? null,
          latest_round_tokens_in: usageFor.latestRound?.tokens_in ?? null,
          latest_round_tokens_out: usageFor.latestRound?.tokens_out ?? null,
        };
      } catch (err) {
        this.deps.log.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      }
    }

    const [files, commits] = await Promise.all([
      this.deps.repo.listFiles(pr.id),
      this.deps.repo.listCommits(pr.id),
    ]);
    return toPrDetail(pr, files, commits, usageFor);
  }
}
