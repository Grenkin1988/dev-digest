/**
 * Structured-output parsing (`llm/structured.ts`): strict JSON first, then
 * fence/brace extraction, and a reprompt message that names the bad fields.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { extractJson, parseWithRepair } from '../src/index.js';

const Schema = z.object({ verdict: z.enum(['approve', 'comment']), score: z.number() });

describe('extractJson', () => {
  it('strips a ```json fence', () => {
    expect(extractJson('Here:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('takes the first balanced object out of prose', () => {
    expect(extractJson('Sure! {"a":{"b":2}} hope that helps')).toBe('{"a":{"b":2}}');
  });

  it('handles a top-level array', () => {
    expect(extractJson('result: [1,[2,3]] end')).toBe('[1,[2,3]]');
  });
});

describe('parseWithRepair', () => {
  it('parses strict JSON whose string values contain fences and braces', () => {
    const raw = JSON.stringify({ verdict: 'comment', score: 5, note: '```js\n{ x }\n```' });
    const res = parseWithRepair(Schema.passthrough(), raw);
    expect(res.ok).toBe(true);
  });

  it('falls back to extraction for prose-wrapped output', () => {
    const res = parseWithRepair(Schema, 'Answer: {"verdict":"approve","score":90}');
    expect(res).toEqual({ ok: true, data: { verdict: 'approve', score: 90 } });
  });

  it('asks for valid JSON when nothing parses', () => {
    const res = parseWithRepair(Schema, 'no json here');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.repromptMessage).toMatch(/valid JSON/);
  });

  it('names the failing fields when the shape is wrong', () => {
    const res = parseWithRepair(Schema, '{"verdict":"maybe","score":"high"}');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('verdict');
      expect(res.error).toContain('score');
    }
  });
});
