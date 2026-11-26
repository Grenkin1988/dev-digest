import type { RepoRef } from '@devdigest/shared';
import type { JobQueue } from '../../platform/jobs.js';
import type { RepoIntelRepository } from './repository.js';
import type { IndexerDeps } from './deps.js';
import type { IndexResult, IndexState } from './types.js';
import { INDEX_JOB_KIND, INDEXER_VERSION, REFRESH_JOB_KIND, RESYNC_JOB_KIND } from './constants.js';
import { runFullIndex, type IndexPayload } from './pipeline/full.js';
import { runIncremental } from './pipeline/incremental.js';

/**
 * Indexing half of the repo-intel facade: full / incremental / resync runs and
 * the index-state read. The job handlers are the async entry (registered once
 * at boot); the methods themselves run inline, which is what the CI runner
 * and tests call.
 */
export class RepoIntelIndexer {
  constructor(
    private readonly repo: RepoIntelRepository,
    private readonly deps: IndexerDeps,
    private readonly jobs: JobQueue,
  ) {}

  /** Full index, inline (the INDEX_JOB_KIND handler delegates here). */
  indexRepo(repoId: string): Promise<IndexResult> {
    return runFullIndex(this.deps, this.repo, { repoId });
  }

  /** Incremental refresh, inline. Falls back to a full index on a stale/missing state. */
  refreshIndex(repoId: string): Promise<IndexResult> {
    return runIncremental(this.deps, this.repo, { repoId });
  }

  /**
   * Manual "re-analyze": advance the clone to `origin/<defaultBranch>`, then run
   * an incremental refresh (which itself falls back to a full reindex when the
   * diff base is unreachable). Degrades, never throws, when the repo isn't
   * cloned yet or the fetch fails.
   */
  async resyncRepo(repoId: string): Promise<IndexResult> {
    const startedAt = Date.now();
    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath) {
      return { status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: Date.now() - startedAt, reason: 'no_clone' };
    }
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    try {
      await this.deps.git.sync(ref, repo.defaultBranch);
    } catch (err) {
      return {
        status: 'degraded',
        filesIndexed: 0,
        filesSkipped: 0,
        durationMs: Date.now() - startedAt,
        reason: `sync_failed:${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return runIncremental(this.deps, this.repo, { repoId });
  }

  /**
   * Register the INDEX / REFRESH / RESYNC handlers. Call once at boot (the
   * repo-intel routes plugin does). Handlers drop the IndexResult on purpose:
   * JobRunner expects `Promise<void>`; progress is visible in `repo_index_state`.
   */
  registerJobHandlers(): void {
    this.jobs.register(INDEX_JOB_KIND, async (payload) => {
      await this.indexRepo((payload as IndexPayload).repoId);
    });
    this.jobs.register(REFRESH_JOB_KIND, async (payload) => {
      await this.refreshIndex((payload as IndexPayload).repoId);
    });
    this.jobs.register(RESYNC_JOB_KIND, async (payload) => {
      await this.resyncRepo((payload as IndexPayload).repoId);
    });
  }

  /**
   * Queue a resync ("re-analyze"). Returns the job id, or null when the
   * enqueue fails (no handler / DB hiccup): the caller degrades, never throws.
   */
  async enqueueResync(workspaceId: string, repoId: string): Promise<string | null> {
    try {
      const job = await this.jobs.enqueue(workspaceId, RESYNC_JOB_KIND, { repoId });
      return job.id;
    } catch {
      return null;
    }
  }

  /** ALWAYS works: the persisted row, or a synthesised degraded one. */
  async getIndexState(repoId: string): Promise<IndexState> {
    const persisted = await this.repo.tryGetIndexState(repoId);
    if (persisted) return persisted;
    return {
      repoId,
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
      reason: 'no_data',
      lastIndexedSha: '',
      indexerVersion: INDEXER_VERSION,
      updatedAt: new Date(0),
      degraded: true,
      degradedReason: 'no_data',
    };
  }
}
