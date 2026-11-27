import type { GitClient, LLMProvider, Provider } from '@devdigest/shared';
import type { RunBus } from '../../platform/sse.js';
import type { RepoIntel } from '../repo-intel/types.js';
import type { AgentsRepository } from '../agents/repository.js';
import type { ReviewRepository } from './repository.js';
import type { CostEstimator } from './cost.js';

/** What the intent module hands a review run (structural; the reviews module never imports it). */
export interface ReviewIntentResolution {
  /** Present when an intent exists to inject (`filter`: scope filtering enabled). */
  intent?: { text: string; filter: boolean };
  /** `intent: …` live-log line (kinds, refs and counts only). */
  logLine: string;
  /** Why the scope filter is off, when it is. */
  filterOffReason?: string;
}

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
  /**
   * Resolve the PR's intent (reuse, or derive when absent). Best-effort: it
   * never rejects, and returns undefined only when the PR is unknown.
   */
  intent: (workspaceId: string, prId: string) => Promise<ReviewIntentResolution | undefined>;
}
