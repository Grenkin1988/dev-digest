/**
 * Map-reduce step (`review/reduce.ts`): merging per-file partial Reviews,
 * the deterministic findings-based score, and slicing one file out of a diff.
 */
import { describe, it, expect } from 'vitest';
import type { Finding, Review, UnifiedDiff } from '@devdigest/shared';
import { reduceReviews, sliceDiff } from '../src/index.js';
import { scoreFromFindings } from '../src/review/reduce.js';

const finding = (severity: Finding['severity'], id = severity): Finding => ({
  id,
  severity,
  category: 'bug',
  title: id,
  file: 'a.ts',
  start_line: 1,
  end_line: 1,
  rationale: 'r',
  confidence: 0.9,
});

const review = (over: Partial<Review>): Review => ({
  verdict: 'approve',
  score: 100,
  summary: '',
  findings: [],
  ...over,
});

describe('scoreFromFindings', () => {
  it('is 100 with no findings and drops with severity', () => {
    expect(scoreFromFindings([])).toBe(100);
    expect(scoreFromFindings([finding('SUGGESTION')])).toBeGreaterThan(
      scoreFromFindings([finding('WARNING')]),
    );
    expect(scoreFromFindings([finding('WARNING')])).toBeGreaterThan(
      scoreFromFindings([finding('CRITICAL')]),
    );
  });

  it('never goes below 0', () => {
    expect(scoreFromFindings(Array.from({ length: 10 }, (_, i) => finding('CRITICAL', `c${i}`)))).toBe(0);
  });
});

describe('reduceReviews', () => {
  it('returns a single partial unchanged', () => {
    const only = review({ verdict: 'comment', score: 70 });
    expect(reduceReviews([only])).toBe(only);
  });

  it('takes the worst verdict, the mean score, all findings and joined summaries', () => {
    const merged = reduceReviews([
      review({ verdict: 'approve', score: 90, summary: 'ok', findings: [finding('SUGGESTION')] }),
      review({ verdict: 'request_changes', score: 40, summary: 'bad', findings: [finding('CRITICAL')] }),
      review({ verdict: 'comment', score: 71, summary: '' }),
    ]);
    expect(merged.verdict).toBe('request_changes');
    expect(merged.score).toBe(67);
    expect(merged.findings.map((f) => f.severity)).toEqual(['SUGGESTION', 'CRITICAL']);
    expect(merged.summary).toBe('ok bad');
  });
});

describe('sliceDiff', () => {
  const raw = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '+const a = 1;',
    'diff --git a/src/b.ts b/src/b.ts',
    '--- a/src/b.ts',
    '+++ b/src/b.ts',
    '+const b = 2;',
  ].join('\n');
  const diff = { raw, files: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }] } as unknown as UnifiedDiff;

  it('extracts only the requested file', () => {
    const slice = sliceDiff(diff, 'src/b.ts');
    expect(slice).toContain('+const b = 2;');
    expect(slice).not.toContain('+const a = 1;');
  });

  it('falls back to the whole diff for an unknown path', () => {
    expect(sliceDiff(diff, 'nope.ts')).toBe(raw);
  });
});
