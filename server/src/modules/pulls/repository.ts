import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PrMeta, PrDetail } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';
import { UPSERT_CHUNK_SIZE } from './constants.js';

export type RepoRow = typeof t.repos.$inferSelect;
export type PrFileRow = typeof t.prFiles.$inferSelect;
export type PrCommitRow = typeof t.prCommits.$inferSelect;
export type { PullRow };

/** Diff stats GitHub only returns on the per-PR detail payload. */
export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

/**
 * Pulls data access — the ONLY place the pulls module touches Postgres.
 * Every entry point that takes a user-supplied id is workspace-scoped.
 */
export class PullsRepository {
  constructor(private db: Db) {}

  async getRepoForWorkspace(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [repo] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return repo;
  }

  /** A PR plus its repo, scoped to the workspace. */
  async getPrWithRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: PullRow; repo: RepoRow } | undefined> {
    const [row] = await this.db
      .select({ pr: t.pullRequests, repo: t.repos })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getPrByNumber(
    workspaceId: string,
    repoId: string,
    number: number,
  ): Promise<PullRow | undefined> {
    const [pr] = await this.db
      .select()
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.pullRequests.number, number),
        ),
      );
    return pr;
  }

  listForRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  /** Idempotent import of GitHub's PR list (unique repo_id + number), batched. */
  async upsertMany(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void> {
    const values = pulls.map((pr) => ({
      workspaceId,
      repoId,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      branch: pr.branch,
      base: pr.base,
      headSha: pr.head_sha,
      additions: pr.additions,
      deletions: pr.deletions,
      filesCount: pr.files_count,
      status: pr.status,
      openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
      updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
    }));
    for (let i = 0; i < values.length; i += UPSERT_CHUNK_SIZE) {
      await this.db
        .insert(t.pullRequests)
        .values(values.slice(i, i + UPSERT_CHUNK_SIZE))
        .onConflictDoUpdate({
          target: [t.pullRequests.repoId, t.pullRequests.number],
          set: {
            title: sqlExcluded('title'),
            headSha: sqlExcluded('head_sha'),
            status: sqlExcluded('status'),
            updatedAt: sqlExcluded('updated_at'),
          },
        });
    }
  }

  async updateDiffStats(prId: string, stats: DiffStats): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, prId));
  }

  async touchPolled(repoId: string, at: Date): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: at }).where(eq(t.repos.id, repoId));
  }

  /** Latest review score per PR (newest `kind='review'` row wins). */
  async latestScores(prIds: string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    if (prIds.length === 0) return out;
    const rows = await this.db
      .select({ prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
    for (const r of rows) if (!out.has(r.prId)) out.set(r.prId, r.score);
    return out;
  }

  /**
   * Findings of every `kind='review'` review of the given PRs, with the review's
   * agent + timestamp so the caller can keep the newest review per agent.
   */
  listReviewFindings(prIds: string[]): Promise<
    {
      prId: string;
      reviewId: string;
      agentId: string | null;
      createdAt: Date;
      severity: string | null;
      dismissedAt: Date | null;
    }[]
  > {
    if (prIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        prId: t.reviews.prId,
        reviewId: t.reviews.id,
        agentId: t.reviews.agentId,
        createdAt: t.reviews.createdAt,
        severity: t.findings.severity,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.reviews)
      .leftJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')));
  }

  async listFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async listCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  /**
   * Replace a PR's files + commits and refresh body/diff stats from a GitHub
   * detail payload — atomically, so a failure never leaves a PR without files.
   */
  async replaceDetail(prId: string, detail: PrDetail): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (detail.files.length > 0) {
        await tx.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
      if (detail.commits.length > 0) {
        await tx.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await tx
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, prId));
    });
  }
}

// `excluded.<col>` for ON CONFLICT DO UPDATE in a multi-row insert: each row
// updates from its own proposed values.
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}
