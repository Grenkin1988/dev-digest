/**
 * RepoIntelService — the repo-intel facade (`RepoIntel`, types.ts).
 *
 * A thin composition over four collaborators, each in its own file:
 *   - `RepoIntelIndexer` (indexer.ts)      — full / incremental / resync runs, index state, job handlers
 *   - `BlastRadius` (blast.ts)             — callers + impacted endpoints of a diff
 *   - `RepoIntelReads` (queries.ts)        — rank / symbols / callers / phantoms / critical paths
 *   - `RepoMapReader` (repo-map-reader.ts) — the cached repo-map
 *
 * When REPO_INTEL_ENABLED is off the reads are the `DisabledRepoIntelQueries`
 * Null Object and the repo-map is `DISABLED_REPO_MAP`; indexing, index state and
 * the ripgrep blast fallback keep working. Dependencies arrive through
 * `RepoIntelDeps`, built by the composition root (`platform/container.ts`).
 */
import type { RepoIntelDeps } from './deps.js';
import { RepoIntelIndexer } from './indexer.js';
import { BlastRadius } from './blast.js';
import { RepoIntelQueries, type RepoIntelReads } from './queries.js';
import { RepoMapReader } from './repo-map-reader.js';
import { DisabledRepoIntelQueries, DISABLED_REPO_MAP } from './disabled.js';
import type {
  BlastResult,
  FileRankRow,
  IndexResult,
  IndexState,
  RefRow,
  RepoIntel,
  RepoMapResult,
  SignatureRow,
  SymbolRow,
} from './types.js';

export class RepoIntelService implements RepoIntel {
  readonly indexer: RepoIntelIndexer;
  private readonly blast: BlastRadius;
  private readonly reads: RepoIntelReads;
  private readonly repoMap: RepoMapReader | null;

  constructor(deps: RepoIntelDeps) {
    this.indexer = new RepoIntelIndexer(deps.repo, deps, deps.jobs);
    this.blast = new BlastRadius(deps.repo, deps.codeIndex, deps.enabled);
    this.reads = deps.enabled
      ? new RepoIntelQueries(deps.repo, deps.codeIndex)
      : new DisabledRepoIntelQueries();
    this.repoMap = deps.enabled ? new RepoMapReader(deps.repo) : null;
  }

  // --- Indexing ---------------------------------------------------------------
  indexRepo(repoId: string): Promise<IndexResult> {
    return this.indexer.indexRepo(repoId);
  }
  refreshIndex(repoId: string): Promise<IndexResult> {
    return this.indexer.refreshIndex(repoId);
  }
  resyncRepo(repoId: string): Promise<IndexResult> {
    return this.indexer.resyncRepo(repoId);
  }
  /** Register INDEX / REFRESH / RESYNC handlers. Call once at boot. */
  registerIndexJobHandlers(): void {
    this.indexer.registerJobHandlers();
  }
  getIndexState(repoId: string): Promise<IndexState> {
    return this.indexer.getIndexState(repoId);
  }

  // --- Reads ------------------------------------------------------------------
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult> {
    return this.blast.get(repoId, changedFiles);
  }
  async getRepoMap(repoId: string, tokenBudget?: number): Promise<RepoMapResult> {
    if (!this.repoMap) return { ...DISABLED_REPO_MAP };
    return this.repoMap.get(repoId, tokenBudget);
  }
  getFileRank(repoId: string, paths: string[]): Promise<FileRankRow[]> {
    return this.reads.getFileRank(repoId, paths);
  }
  getSymbolsInFiles(repoId: string, paths: string[]): Promise<SymbolRow[]> {
    return this.reads.getSymbolsInFiles(repoId, paths);
  }
  getCallerSignatures(repoId: string, changedFiles: string[], limit?: number): Promise<SignatureRow[]> {
    return this.reads.getCallerSignatures(repoId, changedFiles, limit);
  }
  getUnresolvedReferences(repoId: string, files: string[]): Promise<RefRow[]> {
    return this.reads.getUnresolvedReferences(repoId, files);
  }
  getConventionSamples(repoId: string, n: number): Promise<string[]> {
    return this.reads.getConventionSamples(repoId, n);
  }
  getTopFilesByRank(repoId: string, n: number, opts?: { exclude?: string[] }): Promise<string[]> {
    return this.reads.getTopFilesByRank(repoId, n, opts);
  }
  getCriticalPaths(repoId: string): Promise<string[][]> {
    return this.reads.getCriticalPaths(repoId);
  }
}
