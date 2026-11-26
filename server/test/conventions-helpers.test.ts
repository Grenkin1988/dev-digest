import { describe, it, expect } from 'vitest';
import {
  buildUserPrompt,
  capBytes,
  locateSnippet,
  normaliseRule,
  toConventionView,
} from '../src/modules/conventions/helpers.js';

const FILE = ['import a from "a";', '', 'export function run() {', '  const x = 1;', '  return x;', '}', ''].join('\n');

describe('locateSnippet', () => {
  it('returns the 1-based inclusive line range', () => {
    expect(locateSnippet(FILE, 'export function run() {\n  const x = 1;')).toEqual({ startLine: 3, endLine: 4 });
  });

  it('tolerates indentation drift and blank-line / CRLF differences', () => {
    const crlf = FILE.replace(/\n/g, '\r\n');
    expect(locateSnippet(crlf, 'const   x = 1;\nreturn x;')).toEqual({ startLine: 4, endLine: 5 });
    expect(locateSnippet(FILE, '\n\n  import a from "a";\n\n')).toEqual({ startLine: 1, endLine: 1 });
  });

  it('returns null on a miss or an empty snippet', () => {
    expect(locateSnippet(FILE, 'const y = 2;')).toBeNull();
    expect(locateSnippet(FILE, 'const x = 1;\nreturn y;')).toBeNull();
    expect(locateSnippet(FILE, '   \n ')).toBeNull();
  });
});

describe('normaliseRule', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normaliseRule('Use  named exports, NOT default!')).toBe(normaliseRule('use named exports not default'));
  });
});

describe('toConventionView', () => {
  it('coalesces nullable columns and derives accepted from status', () => {
    const v = toConventionView({
      id: 'i', rule: 'r', evidencePath: null, evidenceSnippet: null, confidence: null,
      status: 'accepted', category: null, startLine: null, endLine: null,
    });
    expect(v).toMatchObject({ evidence_path: '', evidence_snippet: '', confidence: 0, accepted: true, status: 'accepted', category: null });
  });
});

describe('prompt helpers', () => {
  it('wraps every file as untrusted data', () => {
    const p = buildUserPrompt([{ path: 'tsconfig.json', content: '{}' }], [{ path: 'src/a.ts', content: 'x' }]);
    expect(p).toContain('<untrusted source="config:tsconfig.json">');
    expect(p).toContain('<untrusted source="file:src/a.ts">');
  });

  it('caps by bytes on a character boundary', () => {
    expect(Buffer.byteLength(capBytes('é'.repeat(100), 11), 'utf8')).toBeLessThanOrEqual(11);
    expect(capBytes('abc', 10)).toBe('abc');
  });
});
