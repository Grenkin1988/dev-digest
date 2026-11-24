import type { CodeIndex, GitClient } from '@devdigest/shared';
import type { DepGraph } from '../../adapters/depgraph/index.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import type { JobQueue } from '../../platform/jobs.js';
import type { RepoIntelRepository } from './repository.js';

/** What the indexer pipelines (`pipeline/full.ts`, `pipeline/incremental.ts`) use. */
export interface IndexerDeps {
  git: GitClient;
  depgraph: DepGraph;
  tokenizer: Tokenizer;
}

/**
 * Everything the repo-intel facade needs, injected by the composition root
 * (`platform/container.ts`). The service never sees the Container.
 */
export interface RepoIntelDeps extends IndexerDeps {
  repo: RepoIntelRepository;
  codeIndex: CodeIndex;
  jobs: JobQueue;
  /**
   * `REPO_INTEL_ENABLED`. Off → the rank/symbol/phantom queries are a Null
   * Object (`disabled.ts`) and blast skips the persistent index; indexing,
   * index state and the ripgrep blast fallback keep working.
   */
  enabled: boolean;
}
