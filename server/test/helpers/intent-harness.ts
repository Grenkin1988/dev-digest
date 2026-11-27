import type { GitHubClient, IssueMeta, PrDetail, PrIntentRecord, RepoRef } from '@devdigest/shared';
import { MockGitHubClient, MockLLMProvider, MockRepoFileAtRef } from '../../src/adapters/mocks.js';

export { MockRepoFileAtRef };
import type { IntentDeps, IntentPullRef } from '../../src/modules/intent/deps.js';
import { RepoFileError, type RepoFileAtRef } from '../../src/modules/intent/ports.js';
import { IntentService } from '../../src/modules/intent/service.js';
import type { DerivedIntent, IntentRepository } from '../../src/modules/intent/repository.js';

/** A github client whose `getIssue` fails for the listed issue numbers. */
export class FlakyGitHubClient extends MockGitHubClient {
  public fetched: number[] = [];
  constructor(private failing: Record<number, unknown> = {}) {
    super();
  }
  override async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    this.fetched.push(n);
    if (n in this.failing) throw this.failing[n];
    return super.getIssue(repo, n);
  }
}

/** In-memory stand-in for IntentRepository (DB is covered by intent.it.test.ts). */
export class InMemoryIntentRepo {
  public rows = new Map<string, PrIntentRecord>();
  public upserts = 0;
  async getForPull(prId: string): Promise<PrIntentRecord | undefined> {
    return this.rows.get(prId);
  }
  async upsertDerived(prId: string, d: DerivedIntent): Promise<PrIntentRecord> {
    this.upserts += 1;
    const rec: PrIntentRecord = {
      pr_id: prId,
      intent: d.intent,
      in_scope: d.inScope,
      out_of_scope: d.outOfScope,
      mode: d.mode,
      confidence: d.confidence,
      sources: d.sources,
      missing_context: d.missingContext,
      provider: d.provider,
      model: d.model,
      head_sha: d.headSha,
      derived_at: '2026-11-27T00:00:00.000Z',
      cost_usd: d.costUsd,
    };
    this.rows.set(prId, rec);
    return rec;
  }
}

export const PR_ID = '11111111-1111-4111-8111-111111111111';
export const HEAD = 'a1b2c3d4e5f6';
export const WS = 'w-test';

export const pullRef: IntentPullRef = {
  id: PR_ID,
  number: 482,
  headSha: HEAD,
  repo: { id: 'r1', owner: 'acme', name: 'widgets' },
};

export const REAL_BODY =
  'Add rate limiting to the public comments endpoint so that spam bursts are rejected with 429.';

export function makeDetail(over: Partial<PrDetail> = {}): PrDetail {
  return {
    number: 482,
    title: 'Add rate limiting',
    author: 'marisa',
    branch: 'feat/rl',
    base: 'main',
    head_sha: HEAD,
    additions: 3,
    deletions: 0,
    files_count: 1,
    status: 'open',
    body: REAL_BODY,
    files: [
      {
        path: 'src/comments.ts',
        additions: 3,
        deletions: 0,
        patch: '@@ -1,2 +1,5 @@ function limit()\n ctx\n+const a = 1;\n+const b = 2;\n+const c = 3;',
      },
    ],
    commits: [{ sha: 'c1', message: 'wip', author: 'marisa', committed_at: null }],
    linked_issue: null,
    ...over,
  };
}

export const CLASSIFIER_OUTPUT = {
  summary: 'Adds rate limiting to the comments endpoint.',
  in_scope: ['comments route rate limit', '429 error body'],
  out_of_scope: ['auth changes'],
};

export interface HarnessOptions {
  detail?: PrDetail;
  github?: GitHubClient;
  repoFiles?: RepoFileAtRef;
  llm?: MockLLMProvider;
  repo?: InMemoryIntentRepo;
  pull?: IntentPullRef | undefined;
  /** Wrap the LLM so tests can hold the classifier call open. */
  gate?: Promise<void>;
}

export function makeHarness(o: HarnessOptions = {}) {
  const llm = o.llm ?? new MockLLMProvider('openai', { structured: CLASSIFIER_OUTPUT });
  const repo = o.repo ?? new InMemoryIntentRepo();
  const detail = o.detail ?? makeDetail();
  const logs: { level: 'info' | 'warn'; obj: unknown; msg?: string }[] = [];
  const gated: MockLLMProvider = o.gate
    ? (Object.assign(Object.create(llm), {
        completeStructured: async (req: never) => {
          await o.gate;
          return llm.completeStructured(req);
        },
      }) as MockLLMProvider)
    : llm;
  const deps: IntentDeps = {
    repo: repo as unknown as IntentRepository,
    getPullRef: async (ws, id) => (ws === WS && id === PR_ID ? (o.pull ?? pullRef) : undefined),
    pullDetail: async () => detail,
    github: async () => o.github ?? new MockGitHubClient(),
    fetchPullHead: async () => {},
    repoFiles: o.repoFiles ?? new MockRepoFileAtRef(),
    model: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
    llm: async () => gated,
    now: () => 1_000,
    log: {
      info: (obj, msg) => logs.push({ level: 'info', obj, msg }),
      warn: (obj, msg) => logs.push({ level: 'warn', obj, msg }),
    },
  };
  return { service: new IntentService(deps), llm, repo, logs, deps };
}

/** The user message the classifier was called with. */
export function classifierPrompt(llm: MockLLMProvider): { system: string; user: string } {
  const call = llm.calls.find((c) => c.method === 'completeStructured');
  if (!call) throw new Error('classifier was not called');
  const messages = (call.req as { messages: { role: string; content: string }[] }).messages;
  return { system: messages[0]!.content, user: messages[1]!.content };
}

export const classifierCalls = (llm: MockLLMProvider) =>
  llm.calls.filter((c) => c.method === 'completeStructured').length;
