import { describe, it, expect } from 'vitest';
import type { PrIntentRecord } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { ExternalServiceError, NotFoundError } from '../src/platform/errors.js';
import {
  CLASSIFIER_OUTPUT,
  FlakyGitHubClient,
  HEAD,
  MockRepoFileAtRef,
  PR_ID,
  REAL_BODY,
  WS,
  classifierCalls,
  classifierPrompt,
  makeDetail,
  makeHarness,
} from './helpers/intent-harness.js';

const kinds = (r: PrIntentRecord | null) => (r?.sources ?? []).map((s) => s.kind);

describe('IntentService.derive: changes-only mode', () => {
  const emptyish = [
    ['empty body', ''],
    ['null body', null],
    ['whitespace-only body', '  \n\t  \n'],
    ['template-only body', '## Summary\n<!-- explain -->\n- [ ] tests added\n---\n**Why**\nTODO'],
  ] as const;

  it.each(emptyish)('%s → inferred_from_changes, low confidence, no description block', async (_n, body) => {
    const h = makeHarness({ detail: makeDetail({ body }) });
    const res = await h.service.derive(WS, PR_ID);

    expect(res.intent?.mode).toBe('inferred_from_changes');
    expect(res.intent?.confidence).toBe('low');
    expect(kinds(res.intent)).toEqual(['title', 'files', 'hunks', 'commits', 'added_lines']);
    expect(res.intent?.sources?.some((s) => s.kind === 'body')).toBe(false);

    const { system, user } = classifierPrompt(h.llm);
    expect(system).toContain('There is NO author description');
    expect(user).not.toContain('pr-description');
    expect(user).toContain('source="changed-files"');
  });

  it('a body made only of lines from the repo PR template counts as empty', async () => {
    const line = 'Describe your change here please explain thoroughly';
    const h = makeHarness({
      detail: makeDetail({ body: line }),
      repoFiles: new MockRepoFileAtRef({ '.github/pull_request_template.md': `## What\n${line}\n` }),
    });
    const res = await h.service.derive(WS, PR_ID);
    expect(res.intent?.mode).toBe('inferred_from_changes');
  });

  it('small changes-only PR (< 50 changed lines) gets an added-lines block and source', async () => {
    const h = makeHarness({ detail: makeDetail({ body: '' }) });
    const res = await h.service.derive(WS, PR_ID);
    const src = res.intent!.sources!.find((s) => s.kind === 'added_lines');
    expect(src).toMatchObject({ ref: '3 lines', truncated: false });
    const { user } = classifierPrompt(h.llm);
    expect(user).toContain('source="added-lines"');
    expect(user).toContain('const a = 1;');
    // only the + lines: the context line is not in the excerpt block
    const block = user.slice(user.indexOf('source="added-lines"'));
    expect(block).not.toMatch(/^ctx$/m);
  });

  it('a secret-looking added line is redacted before it reaches the classifier', async () => {
    const detail = makeDetail({
      body: '',
      files: [{ path: 'a.ts', additions: 2, deletions: 0, patch: '@@ -0,0 +1,2 @@\n+const apiKey = "sk-live-123"\n+const ok = 1' }],
    });
    const h = makeHarness({ detail });
    await h.service.derive(WS, PR_ID);
    const { user } = classifierPrompt(h.llm);
    expect(user).not.toContain('sk-live-123');
    expect(user).toContain('[redacted]');
  });

  it('a changes-only PR with >= 50 changed lines has neither block nor source', async () => {
    const detail = makeDetail({
      body: '',
      files: [{ path: 'a.ts', additions: 40, deletions: 10, patch: '@@ -1,1 +1,2 @@ fn\n+x' }],
    });
    const h = makeHarness({ detail });
    const res = await h.service.derive(WS, PR_ID);
    expect(kinds(res.intent)).toEqual(['title', 'files', 'hunks', 'commits']);
    expect(classifierPrompt(h.llm).user).not.toContain('added-lines');
  });

  it('an author-description PR never gets an added-lines block, however small', async () => {
    const h = makeHarness();
    const res = await h.service.derive(WS, PR_ID);
    expect(res.intent?.mode).toBe('author_description');
    expect(kinds(res.intent)).not.toContain('added_lines');
    expect(classifierPrompt(h.llm).user).not.toContain('added-lines');
    expect(classifierPrompt(h.llm).user).toContain('source="pr-description"');
  });

  it('a descriptive commit raises changes-only confidence to medium', async () => {
    const h = makeHarness({
      detail: makeDetail({
        body: '',
        commits: [{ sha: 'c', message: 'Add token bucket limiter for comments', author: 'a', committed_at: null }],
      }),
    });
    const res = await h.service.derive(WS, PR_ID);
    expect(res.intent?.confidence).toBe('medium');
  });
});

describe('IntentService.derive: unreachable and external context', () => {
  const body = `${REAL_BODY} Fixes #77. Spec: https://linear.app/acme/issue/ACM-12?token=SECRET and docs/plans/old.md`;

  it('records missing_context, never invents the content, lowers confidence, and still succeeds', async () => {
    const github = new FlakyGitHubClient({ 77: { status: 404 } });
    const h = makeHarness({ detail: makeDetail({ body }), github });
    const res = await h.service.derive(WS, PR_ID);

    expect(res.intent?.mode).toBe('author_description');
    expect(res.intent?.missing_context).toEqual(
      expect.arrayContaining([
        { ref: 'https://linear.app/acme/issue/ACM-12', reason: 'host_not_allowlisted' },
        { ref: '#77', reason: 'not_found' },
        { ref: 'docs/plans/old.md', reason: 'not_present_at_head' },
      ]),
    );
    // never invented: no issue or doc source, no issue block in the prompt
    expect(kinds(res.intent)).not.toContain('issue');
    expect(kinds(res.intent)).not.toContain('doc');
    expect(classifierPrompt(h.llm).user).not.toContain('issue-#77');
    // external URL was never fetched, and its query string is not stored
    expect(github.fetched).toEqual([77]);
    expect(JSON.stringify(res)).not.toContain('SECRET');
    // lowered: reachable context would give high, missing context caps at medium
    expect(res.intent?.confidence).toBe('medium');
  });

  it('the same body with reachable context is high confidence (control)', async () => {
    const h = makeHarness({
      detail: makeDetail({ body: `${REAL_BODY} Fixes #77.` }),
      github: new FlakyGitHubClient(),
    });
    const res = await h.service.derive(WS, PR_ID);
    expect(res.intent?.missing_context).toEqual([]);
    expect(kinds(res.intent)).toContain('issue');
    expect(res.intent?.confidence).toBe('high');
  });

  it('maps a timed-out issue read to reason timeout and other failures to unreachable', async () => {
    const github = new FlakyGitHubClient({ 1: new Error('request timed out'), 2: new Error('ECONNRESET') });
    const h = makeHarness({ detail: makeDetail({ body: `${REAL_BODY} Closes #1, #2` }), github });
    const res = await h.service.derive(WS, PR_ID);
    expect(res.intent?.missing_context).toEqual(
      expect.arrayContaining([
        { ref: '#1', reason: 'timeout' },
        { ref: '#2', reason: 'unreachable' },
      ]),
    );
  });

  it('reads an allowlisted doc at the head sha', async () => {
    const files = new MockRepoFileAtRef({ 'docs/plans/rl.md': 'Plan: token bucket' });
    const h = makeHarness({ detail: makeDetail({ body: `${REAL_BODY} See docs/plans/rl.md` }), repoFiles: files });
    const res = await h.service.derive(WS, PR_ID);
    expect(files.reads).toContainEqual({ sha: HEAD, path: 'docs/plans/rl.md' });
    expect(kinds(res.intent)).toContain('doc');
    expect(res.intent?.confidence).toBe('high');
  });
});

describe('IntentService.forReview: reuse, stale and single-flight', () => {
  const stored = (over: Partial<PrIntentRecord> = {}): PrIntentRecord => ({
    pr_id: PR_ID,
    intent: 'Stored summary',
    in_scope: ['a', 'b', 'c'],
    out_of_scope: ['x', 'y'],
    mode: 'author_description',
    confidence: 'high',
    sources: [],
    missing_context: [],
    head_sha: HEAD,
    derived_at: '2026-11-27T00:00:00.000Z',
    ...over,
  });

  it('a fresh intent is reused with no LLM call and the filter on', async () => {
    const h = makeHarness();
    h.repo.rows.set(PR_ID, stored());
    const r = await h.service.forReview(WS, PR_ID);
    expect(r?.outcome).toBe('reused');
    expect(r?.intent?.filter).toBe(true);
    expect(r?.logLine).toBe('intent: reused (derived at a1b2c3d, confidence=high) — 3 in / 2 out of scope');
    expect(classifierCalls(h.llm)).toBe(0);
  });

  it('a stale intent is context only: filter off, no LLM call, still injected', async () => {
    const h = makeHarness();
    h.repo.rows.set(PR_ID, stored({ head_sha: 'f00ba12deadbeef' }));
    const r = await h.service.forReview(WS, PR_ID);
    expect(r?.outcome).toBe('stale');
    expect(r?.intent?.filter).toBe(false);
    expect(r?.intent?.text).toContain('Stored summary');
    expect(r?.intent?.text).toContain('(stale: derived at f00ba12)');
    expect(r?.filterOffReason).toBe('stale');
    expect(r?.logLine).toContain('context only, scope filter off');
    expect(classifierCalls(h.llm)).toBe(0);
  });

  it('absent → derived once; a second review reuses it with no extra call', async () => {
    const h = makeHarness();
    const first = await h.service.forReview(WS, PR_ID);
    expect(first?.outcome).toBe('derived');
    expect(first?.intent?.filter).toBe(true); // author mode, medium confidence, fresh
    const second = await h.service.forReview(WS, PR_ID);
    expect(second?.outcome).toBe('reused');
    expect(classifierCalls(h.llm)).toBe(1);
  });

  it('changes-only or low-confidence intents never filter', async () => {
    const h = makeHarness({ detail: makeDetail({ body: '' }) });
    const r = await h.service.forReview(WS, PR_ID);
    expect(r?.intent?.filter).toBe(false);
    expect(r?.filterOffReason).toBe('inferred_from_changes');
  });

  it('concurrent derive + forReview share one LLM call (single-flight)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const h = makeHarness({ gate });
    const p1 = h.service.derive(WS, PR_ID);
    const p2 = h.service.forReview(WS, PR_ID);
    await new Promise((r) => setTimeout(r, 25));
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.intent).not.toBeNull();
    expect(b?.outcome).toBe('derived');
    expect(classifierCalls(h.llm)).toBe(1);
    expect(h.repo.upserts).toBe(1);
  });

  it('forReview never throws: a model failure becomes outcome unavailable', async () => {
    const llm = new MockLLMProvider('openai', { structured: { nope: true } });
    const h = makeHarness({ llm });
    const r = await h.service.forReview(WS, PR_ID);
    expect(r?.outcome).toBe('unavailable');
    expect(r?.intent).toBeUndefined();
    expect(r?.logLine).toMatch(/^intent: unavailable \(.*\) — reviewing without intent$/s);
  });
});

describe('IntentService errors and get', () => {
  it('unknown PR → NotFoundError for get and derive; forReview returns undefined', async () => {
    const h = makeHarness();
    await expect(h.service.get(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(h.service.derive(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(await h.service.forReview(WS, 'nope')).toBeUndefined();
  });

  it('derive maps a failing model call to ExternalServiceError (502)', async () => {
    const h = makeHarness({ llm: new MockLLMProvider('openai', { structured: { nope: true } }) });
    await expect(h.service.derive(WS, PR_ID)).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it('get returns null + not stale when nothing is stored, and flags staleness otherwise', async () => {
    const h = makeHarness();
    expect(await h.service.get(WS, PR_ID)).toEqual({ intent: null, current_head_sha: HEAD, stale: false });
    const res = await h.service.derive(WS, PR_ID);
    expect(res).toMatchObject({ current_head_sha: HEAD, stale: false });
    h.repo.rows.set(PR_ID, { ...res.intent!, head_sha: 'old' });
    expect((await h.service.get(WS, PR_ID)).stale).toBe(true);
  });

  it('stores the clamped classifier output with provider, model and usage', async () => {
    const h = makeHarness();
    const res = await h.service.derive(WS, PR_ID);
    expect(res.intent).toMatchObject({
      intent: CLASSIFIER_OUTPUT.summary,
      in_scope: CLASSIFIER_OUTPUT.in_scope,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      head_sha: HEAD,
    });
  });
});

describe('IntentService logging', () => {
  it('the pino object holds kinds, refs and counts but no body, issue, commit or hunk text', async () => {
    const body = `${REAL_BODY} BODY-MARKER-XYZ Fixes #5`;
    const detail = makeDetail({
      body,
      commits: [{ sha: 'c', message: 'COMMIT-MARKER-XYZ subject\n\nbody text', author: 'a', committed_at: null }],
      files: [{ path: 'a.ts', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@ HUNK-MARKER-XYZ()\n+const added = "ADDED-MARKER-XYZ";' }],
    });
    const h = makeHarness({ detail });
    const res = await h.service.forReview(WS, PR_ID);

    const info = h.logs.find((l) => l.msg === 'intent: derived');
    expect(info).toBeDefined();
    expect(info!.obj).toMatchObject({
      prId: PR_ID,
      headSha: HEAD,
      mode: 'author_description',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      tokensIn: 100,
      tokensOut: 50,
    });
    const dump = JSON.stringify(h.logs) + res!.logLine;
    for (const marker of ['BODY-MARKER-XYZ', 'COMMIT-MARKER-XYZ', 'HUNK-MARKER-XYZ', 'ADDED-MARKER-XYZ', 'Mock issue', 'mock issue']) {
      expect(dump).not.toContain(marker);
    }
  });

  it('the classifier output is not logged raw', async () => {
    const h = makeHarness();
    await h.service.derive(WS, PR_ID);
    expect(JSON.stringify(h.logs)).not.toContain(CLASSIFIER_OUTPUT.summary);
  });
});
