import type {
  FeatureModelChoice,
  GitHubClient,
  LLMProvider,
  PrDetail,
  Provider,
  RepoRef,
} from '@devdigest/shared';
import type { IntentRepository } from './repository.js';
import type { RepoFileAtRef } from './ports.js';

/** The slice of a PR the service needs from the pulls/reviews data (structural, no repository import). */
export interface IntentPullRef {
  id: string;
  number: number;
  /** Head SHA as currently persisted. */
  headSha: string;
  repo: { id: string; owner: string; name: string };
}

/** Minimal pino-compatible logger. */
export interface IntentLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

/**
 * Everything the IntentService needs, injected by the composition root
 * (`platform/container.ts`). The service never sees the Container, another
 * module's repository, or an SDK.
 */
export interface IntentDeps {
  repo: IntentRepository;
  /** Workspace-scoped PR lookup; undefined when the PR isn't in the workspace. */
  getPullRef: (workspaceId: string, prId: string) => Promise<IntentPullRef | undefined>;
  /** TTL-gated PR detail (title, body, files, commits, head SHA); serves persisted rows offline. */
  pullDetail: (workspaceId: string, prId: string) => Promise<PrDetail>;
  /** Resolves the GitHub client; rejects when no token is configured. */
  github: () => Promise<GitHubClient>;
  /** Best-effort fetch of the PR head into the local clone. */
  fetchPullHead: (repo: RepoRef, n: number) => Promise<void>;
  repoFiles: RepoFileAtRef;
  /** The workspace's provider+model for the `review_intent` feature. */
  model: (workspaceId: string) => Promise<FeatureModelChoice>;
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** Epoch ms clock (injected so durations are testable). */
  now: () => number;
  log: IntentLogger;
}
