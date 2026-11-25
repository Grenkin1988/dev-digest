/* hooks/keys.ts — the ONE definition of every TanStack Query key.
   Queries, invalidations and prefetches all reference these factories, so a key
   can't drift between the screen that reads it and the screen that invalidates
   it. The VALUES are stable on purpose (other screens and tests depend on them,
   see client/INSIGHTS.md on ["pull", prId] and ["reviews", prId]); change a
   value only together with every consumer.

   Directive-free and React-free: safe to import from anywhere. */

type Id = string | number | null | undefined;

export const settingsKeys = {
  all: ["settings"] as const,
  secretsStatus: ["secrets-status"] as const,
};

export const repoKeys = {
  all: ["repos"] as const,
  context: (repoId: Id) => ["context", repoId] as const,
  intelState: (repoId: Id) => ["repo-intel-state", repoId] as const,
};

export const pullKeys = {
  /** Prefix of every repo's PR list (severity counters live on the list rows). */
  lists: ["pulls"] as const,
  list: (repoId: Id) => ["pulls", repoId] as const,
  detail: (prId: Id) => ["pull", prId] as const,
  /** Prefix of every by-number detail (the PR detail screen reads through this key). */
  byNumberAll: ["pull-by-number"] as const,
  byNumber: (repoId: Id, number: Id) => ["pull-by-number", repoId, number] as const,
  comments: (prId: Id) => ["pr-comments", prId] as const,
};

export const reviewKeys = {
  forPr: (prId: Id) => ["reviews", prId] as const,
  activeRuns: (prId: Id) => ["pr-active-runs", prId] as const,
  runs: (prId: Id) => ["pr-runs", prId] as const,
  trace: (runId: Id) => ["run-trace", runId] as const,
};

export const agentKeys = {
  all: ["agents"] as const,
  detail: (id: Id) => ["agent", id] as const,
  /** Prefix: invalidating it drops every provider's model list. */
  providerModelsAll: ["provider-models"] as const,
  providerModels: (provider: Id) => ["provider-models", provider] as const,
  /** Ordered skill links of one agent (agent editor → Skills tab). */
  skills: (id: Id) => ["agent-skills", id] as const,
};

export const skillKeys = {
  all: ["skills"] as const,
  detail: (id: Id) => ["skill", id] as const,
  /** Card-footer stats for every skill. */
  statsAll: ["skills-stats"] as const,
  stats: (id: Id) => ["skill-stats", id] as const,
  versions: (id: Id) => ["skill-versions", id] as const,
};

export const conventionKeys = {
  /** Saved convention candidates of one repo (Conventions page). */
  list: (repoId: Id) => ["conventions", repoId] as const,
};
