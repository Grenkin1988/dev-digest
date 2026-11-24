import type { GitClient, LLMProvider, Provider } from '@devdigest/shared';
import type { RunBus } from '../../platform/sse.js';
import type { RepoIntel } from '../repo-intel/types.js';
import type { AgentsRepository } from '../agents/repository.js';
import type { ReviewRepository } from './repository.js';
import type { CostEstimator } from './cost.js';

/**
 * Everything the review application layer (ReviewService + ReviewRunExecutor)
 * needs, injected by the composition root (`platform/container.ts`). Services
 * never see the Container itself.
 */
export interface ReviewDeps {
  repo: ReviewRepository;
  /** Agents data access, owned by the agents module and shared via the Container. */
  agents: AgentsRepository;
  runBus: RunBus;
  git: GitClient;
  /** Resolves a provider adapter by id; rejects when its key isn't configured. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  repoIntel: RepoIntel;
  /** Live OpenRouter prices with the static table as fallback; never calls a model. */
  estimate: CostEstimator;
}
