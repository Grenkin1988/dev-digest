import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { applyScopeFilter, reviewPullRequest, type ScopedFinding } from '../src/index.js';

function f(over: Partial<ScopedFinding> & { id: string }): ScopedFinding {
  return {
    severity: 'WARNING',
    category: 'bug',
    title: `title ${over.id}`,
    file: 'src/config.ts',
    start_line: 11,
    end_line: 11,
    rationale: 'because',
    confidence: 0.8,
    kind: 'finding',
    scope: 'in',
    ...over,
  } as ScopedFinding;
}

describe('applyScopeFilter', () => {
  it('disabled: keeps everything and only strips the tag', () => {
    const { kept, stats } = applyScopeFilter([f({ id: 'a', scope: 'out' }), f({ id: 'b' })], { enabled: false });
    expect(kept.map((k) => k.id)).toEqual(['a', 'b']);
    expect(kept.every((k) => !('scope' in k))).toBe(true);
    expect(stats).toEqual({ applied: false, dropped: 0, collapsed: 0, keptSerious: null });
  });

  it('drops non-serious out-of-scope findings and counts them', () => {
    const { kept, stats } = applyScopeFilter(
      [f({ id: 'in' }), f({ id: 'out1', scope: 'out' }), f({ id: 'out2', scope: 'out', severity: 'SUGGESTION' })],
      { enabled: true },
    );
    expect(kept.map((k) => k.id)).toEqual(['in']);
    expect(stats).toMatchObject({ applied: true, dropped: 2, collapsed: 0, keptSerious: null });
  });

  it('a missing scope tag counts as in (never dropped)', () => {
    const untagged = { ...f({ id: 'u' }), scope: undefined } as ScopedFinding;
    const { kept } = applyScopeFilter([untagged], { enabled: true });
    expect(kept.map((k) => k.id)).toEqual(['u']);
  });

  it('two out-of-scope serious findings: exactly one kept (the worst) and it mentions the other', () => {
    const crit = f({ id: 'crit', scope: 'out', severity: 'CRITICAL', category: 'bug', title: 'Crash on null', file: 'a.ts' });
    const sec = f({
      id: 'sec',
      scope: 'out',
      severity: 'WARNING',
      category: 'security',
      title: 'Weak hash',
      file: 'b.ts',
      start_line: 7,
    });
    const { kept, stats } = applyScopeFilter([sec, crit], { enabled: true });
    expect(kept).toHaveLength(1);
    expect(kept[0]!.id).toBe('crit');
    expect(kept[0]!.rationale).toContain('Also out of the stated scope: Weak hash (b.ts:7)');
    expect(stats).toMatchObject({ applied: true, dropped: 0, collapsed: 1 });
    expect(stats.keptSerious?.id).toBe('crit');
    expect('scope' in kept[0]!).toBe(false);
  });

  it('a lone serious out-of-scope finding is kept untouched; secret_leak kind counts as serious', () => {
    const leak = f({ id: 'leak', scope: 'out', kind: 'secret_leak' });
    const { kept } = applyScopeFilter([leak, f({ id: 'x', scope: 'out' })], { enabled: true });
    expect(kept.map((k) => k.id)).toEqual(['leak']);
    expect(kept[0]!.rationale).toBe('because');
  });
});

describe('reviewPullRequest with intent', () => {
  const grounded = (over: Partial<ScopedFinding> & { id: string }) => f({ file: 'src/config.ts', start_line: 11, end_line: 11, ...over });
  const fixture = (findings: ScopedFinding[]) => ({
    verdict: 'request_changes',
    summary: 's',
    score: 1,
    findings,
  });
  const run = async (findings: ScopedFinding[], filter: boolean) => {
    const llm = new MockLLMProvider('openai', { structured: fixture(findings) });
    const diff = await new MockGitClient().diff();
    const outcome = await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      diff,
      llm,
      intent: { text: 'Mode: author_description', filter },
    });
    return { outcome, llm };
  };

  it('filters after grounding: an ungrounded serious out-of-scope finding is not kept as the signal', async () => {
    const { outcome } = await run(
      [
        grounded({ id: 'ghost', scope: 'out', severity: 'CRITICAL', category: 'security', start_line: 999, end_line: 999 }),
        grounded({ id: 'minor', scope: 'out' }),
        grounded({ id: 'keep' }),
      ],
      true,
    );
    expect(outcome.review.findings.map((x: Finding) => x.id)).toEqual(['keep']);
    expect(outcome.scopeFilter).toMatchObject({ applied: true, dropped: 1, keptSerious: null });
    expect(outcome.dropped.map((d) => d.finding.id)).toEqual(['ghost']);
  });

  it('keeps one grounded serious out-of-scope finding, recomputes the score and strips scope', async () => {
    const { outcome } = await run(
      [
        grounded({ id: 's1', scope: 'out', severity: 'CRITICAL', category: 'security' }),
        grounded({ id: 's2', scope: 'out', severity: 'CRITICAL', category: 'security', confidence: 0.1 }),
        grounded({ id: 'minor', scope: 'out' }),
      ],
      true,
    );
    expect(outcome.review.findings.map((x) => x.id)).toEqual(['s1']);
    expect(outcome.review.findings.every((x) => !('scope' in x))).toBe(true);
    // one CRITICAL survives => 100 - 35
    expect(outcome.review.score).toBe(65);
    expect(outcome.scopeFilter).toMatchObject({ applied: true, dropped: 1, collapsed: 1 });
  });

  it('filter off: nothing dropped, scope stripped, intent reaches the prompt with the scope rule', async () => {
    const { outcome, llm } = await run([grounded({ id: 'a', scope: 'out' }), grounded({ id: 'b' })], false);
    expect(outcome.review.findings.map((x) => x.id)).toEqual(['a', 'b']);
    expect(outcome.scopeFilter).toMatchObject({ applied: false, dropped: 0 });
    expect(outcome.assembly?.intent).toContain('Stated intent');
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      schemaName: string;
      messages: { content: string }[];
    };
    expect(req.schemaName).toBe('ScopedReview');
    expect(req.messages[0]!.content).toContain('SCOPE');
  });

  it('no intent: plain Review schema, scopeFilter null, no intent section', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture([grounded({ id: 'a' })]) });
    const diff = await new MockGitClient().diff();
    const outcome = await reviewPullRequest({ systemPrompt: 'sys', model: 'm', diff, llm });
    expect(outcome.scopeFilter).toBeNull();
    expect(outcome.assembly?.intent ?? null).toBeNull();
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as { schemaName: string };
    expect(req.schemaName).toBe('Review');
  });
});
