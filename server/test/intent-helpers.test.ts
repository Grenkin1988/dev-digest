import { describe, it, expect } from 'vitest';
import type { PrFile } from '@devdigest/shared';
import {
  addedLinesExcerpt,
  computeConfidence,
  extractReferences,
  fileStatus,
  filterOffReason,
  formatIntentLogLine,
  hunkHeaders,
  isAllowlistedDocPath,
  isDescriptiveCommit,
  isEffectivelyEmptyBody,
  isStale,
  issueFailureReason,
  prepareCommits,
  prepareFiles,
  redactRef,
  renderIntentSection,
  shouldFilterByScope,
} from '../src/modules/intent/helpers.js';

const repo = { owner: 'acme', name: 'widgets' };

describe('isEffectivelyEmptyBody', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['whitespace only', '   \n\t \r\n  '],
  ])('%s → empty', (_n, body) => {
    expect(isEffectivelyEmptyBody(body)).toBe(true);
  });

  it('template-only body (headings, comments, unchecked boxes, rules, labels, placeholders) → empty', () => {
    const body = [
      '## Summary',
      '<!-- describe what you changed and why, in a few sentences please -->',
      '### Checklist',
      '- [ ] tests added',
      '- [x] docs updated',
      '---',
      '**Why**',
      'Motivation:',
      'N/A',
      'TODO',
    ].join('\n');
    expect(isEffectivelyEmptyBody(body)).toBe(true);
  });

  it('lines identical to the repo PR template are stripped', () => {
    const line = 'Describe your change here please explain thoroughly';
    expect(isEffectivelyEmptyBody(line)).toBe(false);
    expect(isEffectivelyEmptyBody(line, `## Title\n${line}\n`)).toBe(true);
  });

  it('a real description (>= 40 author chars) → not empty', () => {
    expect(
      isEffectivelyEmptyBody('## Summary\nAdd rate limiting to the public comments endpoint so bursts return 429.'),
    ).toBe(false);
  });

  it('a short real sentence is not stripped as a label (no trailing colon, not fully bold)', () => {
    // If "Fix typo in README" were stripped as a label only 32 chars would remain (< 40 → empty).
    expect(isEffectivelyEmptyBody('Fix typo in README\nand also update the changelog entries')).toBe(false);
  });

  it('40-char threshold counts non-whitespace characters', () => {
    expect(isEffectivelyEmptyBody('a'.repeat(39))).toBe(true);
    expect(isEffectivelyEmptyBody('a'.repeat(40))).toBe(false);
  });
});

describe('extractReferences', () => {
  it('orders closing keywords first, then owner/repo#N, then bare #N; de-duplicates', () => {
    const r = extractReferences('t', 'See #7 and acme/other#5. Fixes #12. Also #12 again.', repo);
    expect(r.issues).toEqual([
      { owner: 'acme', name: 'widgets', number: 12 },
      { owner: 'acme', name: 'other', number: 5 },
      { owner: 'acme', name: 'widgets', number: 7 },
    ]);
  });

  it('caps issues at 3', () => {
    const r = extractReferences('t', 'Closes #1. Also #2 #3 #4 #5', repo);
    expect(r.issues.map((i) => i.number)).toEqual([1, 2, 3]);
  });

  it('understands github issue/pull URLs and ignores the PR itself', () => {
    const r = extractReferences(
      't',
      'Related https://github.com/acme/widgets/pull/9 and #5',
      repo,
      5,
    );
    expect(r.issues.map((i) => i.number)).toEqual([9]);
    expect(r.missing).toEqual([]);
  });

  it('records external URLs as host_not_allowlisted with query and fragment stripped, never as issues', () => {
    const r = extractReferences('t', 'Spec: https://linear.app/acme/issue/ACM-12?token=SECRET#frag.', repo);
    expect(r.issues).toEqual([]);
    expect(r.missing).toEqual([
      { ref: 'https://linear.app/acme/issue/ACM-12', reason: 'host_not_allowlisted' },
    ]);
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });

  it('a blob URL of another repo is not read', () => {
    const r = extractReferences('t', 'https://github.com/evil/repo/blob/main/docs/x.md', repo);
    expect(r.docs).toEqual([]);
    expect(r.missing[0]).toMatchObject({ reason: 'host_not_allowlisted' });
  });

  it('collects allowlisted docs from relative links, bare paths and same-repo blob URLs', () => {
    const r = extractReferences(
      't',
      'Plan [rl](docs/plans/rl.md), see ./specs/b.md and https://github.com/acme/widgets/blob/main/docs/c.md',
      repo,
    );
    expect([...r.docs].sort()).toEqual(['docs/c.md', 'docs/plans/rl.md', 'specs/b.md']);
  });

  it('rejects traversal and absolute doc paths (recorded, not read)', () => {
    const r = extractReferences('t', '[a](../secret/docs/a.md) [b](/docs/b.md)', repo);
    expect(r.docs).toEqual([]);
    expect(r.missing.map((m) => m.reason)).toEqual(['path_not_allowlisted', 'path_not_allowlisted']);
  });

  it('caps docs at 3', () => {
    const r = extractReferences('t', 'docs/a.md docs/b.md docs/c.md docs/d.md', repo);
    expect(r.docs).toHaveLength(3);
  });
});

describe('isAllowlistedDocPath / redactRef', () => {
  it.each(['docs/a.md', 'specs/b/c.md', 'pkg/docs/x.md'])('allows %s', (p) => {
    expect(isAllowlistedDocPath(p)).toBe(true);
  });
  it.each(['../docs/a.md', '/docs/a.md', 'docs/../a.md', 'docs/a.txt', 'src/a.md', 'docs\\a.md', 'docs//a.md'])(
    'rejects %s',
    (p) => {
      expect(isAllowlistedDocPath(p)).toBe(false);
    },
  );

  it('redactRef strips query and fragment, also from non-URLs', () => {
    expect(redactRef('https://x.io/a/b?k=v#h')).toBe('https://x.io/a/b');
    expect(redactRef('docs/a.md?x=1#y')).toBe('docs/a.md');
  });
});

describe('fileStatus / hunkHeaders', () => {
  it('fileStatus takes the patch only', () => {
    expect(fileStatus('@@ -0,0 +1,3 @@\n+a')).toBe('added');
    expect(fileStatus('@@ -1,3 +0,0 @@\n-a')).toBe('deleted');
    expect(fileStatus('@@ -1,3 +1,4 @@\n a')).toBe('modified');
    expect(fileStatus(null)).toBe('unknown');
    expect(fileStatus('')).toBe('unknown');
  });

  it('hunkHeaders keeps at most 5 headers, each at most 160 chars, and drops bodies', () => {
    const patch = Array.from({ length: 7 }, (_, i) => `@@ -${i},1 +${i},1 @@ fn${i}()\n+body line ${i}`).join('\n');
    const h = hunkHeaders(patch);
    expect(h).toHaveLength(5);
    expect(h.join('\n')).not.toContain('body line');
    expect(hunkHeaders(`@@ -1,1 +1,1 @@ ${'x'.repeat(400)}`)[0]).toHaveLength(160);
    expect(hunkHeaders(undefined)).toEqual([]);
  });

  it('prepareFiles sorts by size desc and summarises the overflow', () => {
    const files: PrFile[] = Array.from({ length: 152 }, (_, i) => ({
      path: `f${String(i).padStart(3, '0')}.ts`,
      additions: i,
      deletions: 0,
      patch: '@@ -1,1 +1,1 @@ fn',
    }));
    const p = prepareFiles(files);
    expect(p.files).toHaveLength(150);
    expect(p.moreFiles).toBe(2);
    expect(p.files[0]!.path).toBe('f151.ts');
  });
});

describe('addedLinesExcerpt', () => {
  const file = (patch: string, additions: number, deletions = 0): PrFile => ({
    path: 'a.ts',
    additions,
    deletions,
    patch,
  });

  it('takes only + lines: never -, context or the +++ header; strips the +', () => {
    const patch = ['--- a/a.ts', '+++ b/a.ts', '@@ -1,2 +1,3 @@', ' context', '-removed', '+added one', '+added two'].join('\n');
    expect(addedLinesExcerpt([file(patch, 2, 1)])).toEqual({ lines: ['added one', 'added two'], truncated: false });
  });

  it('redacts secret-looking lines', () => {
    const patch = ['@@ -1 +1,4 @@', '+const apiKey = "abc"', '+password: hunter2', '+-----BEGIN RSA PRIVATE KEY-----', '+const ok = 1'].join('\n');
    expect(addedLinesExcerpt([file(patch, 4)]).lines).toEqual(['[redacted]', '[redacted]', '[redacted]', 'const ok = 1']);
  });

  it('caps at 40 lines and 200 chars per line', () => {
    const many = ['@@ -0,0 +1,45 @@', ...Array.from({ length: 45 }, (_, i) => `+line ${i}`)].join('\n');
    const r = addedLinesExcerpt([file(many, 45)]);
    expect(r.lines).toHaveLength(40);
    expect(r.truncated).toBe(true);
    expect(addedLinesExcerpt([file(`@@ -0,0 +1 @@\n+${'y'.repeat(300)}`, 1)]).lines[0]).toHaveLength(200);
  });

  it('is empty for PRs with >= 50 changed lines (additions + deletions), included at 49', () => {
    const patch = '@@ -1 +1 @@\n+x';
    expect(addedLinesExcerpt([file(patch, 30, 20)]).lines).toEqual([]);
    expect(addedLinesExcerpt([file(patch, 30, 19)]).lines).toEqual(['x']);
    // the total is over ALL files
    expect(addedLinesExcerpt([file(patch, 25), file(patch, 25)]).lines).toEqual([]);
  });

  it('skips files without a patch', () => {
    expect(addedLinesExcerpt([{ path: 'img.png', additions: 1, deletions: 0, patch: null }]).lines).toEqual([]);
  });
});

describe('commits', () => {
  it.each([
    ['Add token bucket limiter for comments', true],
    ['Fix the bug in the parser today', false],
    ['wip more changes to the thing here', false],
    ['fixup! Add token bucket limiter', false],
    ['Add x', false],
    ['Merge branch main into feature-x', false],
  ])('isDescriptiveCommit(%j) = %s', (s, expected) => {
    expect(isDescriptiveCommit(s)).toBe(expected);
  });

  it('prepareCommits skips merge commits, splits subject/body and caps at 20', () => {
    const mk = (message: string) => ({ sha: 's', message, author: 'a' });
    const out = prepareCommits([mk('Merge branch x'), mk(`Subject\n\n${'b'.repeat(500)}`)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.subject).toBe('Subject');
    expect(out[0]!.body).toHaveLength(300);
    expect(prepareCommits(Array.from({ length: 30 }, (_, i) => mk(`c${i}`)))).toHaveLength(20);
  });
});

describe('computeConfidence', () => {
  const descriptive = ['Add token bucket limiter for comments'];
  const base = { contextFetched: 0, commitSubjects: [] as string[], missingCount: 0, inScopeCount: 2 };

  it.each([
    ['changes-only, generic commits → low', { mode: 'inferred_from_changes', commitSubjects: ['wip'] }, 'low'],
    ['changes-only, descriptive commit → medium', { mode: 'inferred_from_changes', commitSubjects: descriptive }, 'medium'],
    ['changes-only, descriptive commit but missing context → low', { mode: 'inferred_from_changes', commitSubjects: descriptive, missingCount: 1 }, 'low'],
    ['author, body only → medium', { mode: 'author_description' }, 'medium'],
    ['author, issue/doc fetched → high', { mode: 'author_description', contextFetched: 1 }, 'high'],
    ['author, fetched but something missing → capped at medium', { mode: 'author_description', contextFetched: 2, missingCount: 1 }, 'medium'],
    ['empty in_scope forces low', { mode: 'author_description', contextFetched: 2, inScopeCount: 0 }, 'low'],
  ] as const)('%s', (_n, over, expected) => {
    expect(computeConfidence({ ...base, ...over })).toBe(expected);
  });
});

describe('staleness and filter decision', () => {
  it('isStale: differing or missing derived sha is stale', () => {
    expect(isStale('abc', 'abc')).toBe(false);
    expect(isStale('abc', 'def')).toBe(true);
    expect(isStale(null, 'def')).toBe(true);
  });

  it('shouldFilterByScope is on only for fresh author_description with high/medium confidence', () => {
    expect(shouldFilterByScope({ mode: 'author_description', confidence: 'high', stale: false })).toBe(true);
    expect(shouldFilterByScope({ mode: 'author_description', confidence: 'medium', stale: false })).toBe(true);
    expect(shouldFilterByScope({ mode: 'author_description', confidence: 'low', stale: false })).toBe(false);
    expect(shouldFilterByScope({ mode: 'author_description', confidence: 'high', stale: true })).toBe(false);
    expect(shouldFilterByScope({ mode: 'inferred_from_changes', confidence: 'high', stale: false })).toBe(false);
  });

  it('filterOffReason names the cause (stale wins)', () => {
    expect(filterOffReason({ mode: 'inferred_from_changes', confidence: 'low', stale: true })).toBe('stale');
    expect(filterOffReason({ mode: 'inferred_from_changes', confidence: 'low', stale: false })).toBe('inferred_from_changes');
    expect(filterOffReason({ mode: 'author_description', confidence: 'low', stale: false })).toBe('low confidence');
  });
});

describe('rendering and logging', () => {
  it('renderIntentSection adds a stale line with the 7-char sha', () => {
    const text = renderIntentSection({
      mode: 'author_description',
      confidence: 'high',
      summary: 'S',
      inScope: ['a'],
      outOfScope: [],
      stale: true,
      derivedSha: 'a1b2c3d4e5f6',
    });
    expect(text).toContain('(stale: derived at a1b2c3d)');
    expect(text).toContain('OUT OF SCOPE:\n- (none)');
  });

  it('formatIntentLogLine(derived) lists kinds, refs and counts only', () => {
    const line = formatIntentLogLine({
      kind: 'derived',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      mode: 'author_description',
      confidence: 'medium',
      sources: [
        { kind: 'title', ref: 'title', chars: 54, truncated: false },
        { kind: 'body', ref: 'body', chars: 1820, truncated: false },
        { kind: 'issue', ref: '#42', chars: 2400, truncated: false },
        { kind: 'doc', ref: 'docs/plans/rl.md', chars: 10000, truncated: true },
        { kind: 'files', ref: '12', chars: 100, truncated: false },
        { kind: 'added_lines', ref: '5 lines', chars: 80, truncated: false },
      ],
      missingCount: 1,
      tokensEst: 3400,
      tokensIn: 3512,
      tokensOut: 140,
    });
    expect(line).toBe(
      'intent: derived via openrouter/deepseek/deepseek-v4-flash [author_description, confidence=medium] — ' +
        'sources: title(54) body(1820) issue#42(2400) doc:docs/plans/rl.md(10000,truncated) files(12) added_lines(5 lines) · ' +
        'missing: 1 · ~3,400 tok est · in 3,512 / out 140 tok',
    );
  });

  it('reused / stale / unavailable lines', () => {
    expect(formatIntentLogLine({ kind: 'reused', derivedSha: 'a1b2c3d9', confidence: 'high', inScopeCount: 3, outOfScopeCount: 2 })).toBe(
      'intent: reused (derived at a1b2c3d, confidence=high) — 3 in / 2 out of scope',
    );
    expect(formatIntentLogLine({ kind: 'stale', derivedSha: 'a1b2c3d9', headSha: 'f00ba12xx' })).toBe(
      'intent: stale (derived at a1b2c3d, head f00ba12) — context only, scope filter off',
    );
    expect(formatIntentLogLine({ kind: 'unavailable', message: 'boom' })).toBe(
      'intent: unavailable (boom) — reviewing without intent',
    );
  });

  it('issueFailureReason maps statuses and timeouts', () => {
    expect(issueFailureReason({ status: 404 })).toBe('not_found');
    expect(issueFailureReason(new Error('request timed out'))).toBe('timeout');
    expect(issueFailureReason(new Error('ECONNRESET'))).toBe('unreachable');
  });
});
