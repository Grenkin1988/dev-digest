import type { PrMeta, PrDetail, PrSeverityCounts } from '@devdigest/shared';
import type { RoundUsage } from '../reviews/cost.js';
import { deriveReviewStatus } from './status.js';
import { COUNTED_SEVERITIES, PULL_SYNC_MIN_INTERVAL_MS } from './constants.js';

/**
 * Pure pulls-domain helpers: DTO mapping, the PR-list severity rollup and the
 * sync gate. No DB, no GitHub, no clock (callers pass `now`).
 *
 * Row shapes are structural so this file never depends on `db/schema`.
 */

export interface PullRowLike {
  id: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  lastReviewedSha: string | null;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  body: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

export interface PrFileLike {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PrCommitLike {
  sha: string;
  message: string;
  author: string;
  committedAt: Date | null;
}

export interface ReviewFindingLike {
  prId: string;
  reviewId: string;
  agentId: string | null;
  createdAt: Date;
  /** null when the review has no findings (left join). */
  severity: string | null;
  dismissedAt: Date | null;
}

const usageFields = (u: RoundUsage | undefined) => ({
  cost_usd: u?.cost_usd ?? null,
  tokens_in: u?.tokens_in ?? null,
  tokens_out: u?.tokens_out ?? null,
});

/** One PR-list row. `status` is the derived review status for open PRs. */
export function toPrMeta(
  r: PullRowLike,
  extra: {
    score: number | null | undefined;
    usage: RoundUsage | undefined;
    severity: PrSeverityCounts | undefined;
    now: number;
  },
): PrMeta {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    author: r.author,
    branch: r.branch,
    base: r.base,
    head_sha: r.headSha,
    additions: r.additions,
    deletions: r.deletions,
    files_count: r.filesCount,
    status: deriveReviewStatus({
      ghStatus: r.status,
      lastReviewedSha: r.lastReviewedSha,
      headSha: r.headSha,
      updatedAt: r.updatedAt,
      now: extra.now,
    }),
    opened_at: r.openedAt?.toISOString() ?? null,
    updated_at: r.updatedAt?.toISOString() ?? null,
    score: extra.score ?? null,
    ...usageFields(extra.usage),
    severity_counts: extra.severity ?? null,
  };
}

/** PR detail from persisted rows (GitHub merge state, not the derived status). */
export function toPrDetail(
  r: PullRowLike,
  files: PrFileLike[],
  commits: PrCommitLike[],
  usage: { total: RoundUsage | undefined; latestRound: RoundUsage | undefined },
): PrDetail {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    author: r.author,
    branch: r.branch,
    base: r.base,
    head_sha: r.headSha,
    additions: r.additions,
    deletions: r.deletions,
    files_count: r.filesCount,
    status: r.status as PrDetail['status'],
    opened_at: r.openedAt?.toISOString() ?? null,
    updated_at: r.updatedAt?.toISOString() ?? null,
    body: r.body ?? null,
    ...usageFields(usage.total),
    latest_round_cost_usd: usage.latestRound?.cost_usd ?? null,
    latest_round_tokens_in: usage.latestRound?.tokens_in ?? null,
    latest_round_tokens_out: usage.latestRound?.tokens_out ?? null,
    files: files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committed_at: c.committedAt?.toISOString() ?? null,
    })),
  };
}

/**
 * Per-PR severity counters, the same rule the client used to apply per row
 * (`client/src/components/severity-counters/helpers.ts`): keep each agent's
 * NEWEST review, then count its non-dismissed findings by severity. A PR with
 * no review gets no entry.
 */
export function severityCountsByPr(rows: ReviewFindingLike[]): Map<string, PrSeverityCounts> {
  // prId → agentKey → newest reviewId (+ its time)
  const latest = new Map<string, Map<string, { reviewId: string; at: number }>>();
  for (const r of rows) {
    const agentKey = r.agentId ?? r.reviewId;
    let byAgent = latest.get(r.prId);
    if (!byAgent) latest.set(r.prId, (byAgent = new Map()));
    const prev = byAgent.get(agentKey);
    const at = r.createdAt.getTime();
    if (!prev || at > prev.at) byAgent.set(agentKey, { reviewId: r.reviewId, at });
  }

  const out = new Map<string, PrSeverityCounts>();
  for (const [prId, byAgent] of latest) {
    const keep = new Set([...byAgent.values()].map((v) => v.reviewId));
    const counts: PrSeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    for (const r of rows) {
      if (r.prId !== prId || !keep.has(r.reviewId) || r.dismissedAt || !r.severity) continue;
      if ((COUNTED_SEVERITIES as readonly string[]).includes(r.severity)) {
        counts[r.severity as keyof PrSeverityCounts] += 1;
      }
    }
    out.set(prId, counts);
  }
  return out;
}

/** True when the repo's PR list should be re-synced from GitHub. */
export function isSyncDue(
  lastPolledAt: Date | null,
  now: number,
  minIntervalMs = PULL_SYNC_MIN_INTERVAL_MS,
): boolean {
  return !lastPolledAt || now - lastPolledAt.getTime() >= minIntervalMs;
}

/** PRs that still carry the zeroed diff stats of a list-only import. */
export function needsDiffStats(r: Pick<PullRowLike, 'additions' | 'deletions' | 'filesCount'>): boolean {
  return r.additions === 0 && r.deletions === 0 && r.filesCount === 0;
}
