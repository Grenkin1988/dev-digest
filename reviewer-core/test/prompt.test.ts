/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt, LANGUAGE_RULE } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — English-only output rule', () => {
  it('appends the language rule after the agent prompt, in messages and assembly', () => {
    const { messages, assembly } = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF' });
    const sys = messages[0]!.content;
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toContain(LANGUAGE_RULE);
    expect(sys).toMatch(/MUST respond entirely in English/);
    expect(assembly.system).toBe(sys);
  });

  it('keeps the rule regardless of the PR language', () => {
    const sys = systemOf({ system: 'sys', diff: 'DIFF', prDescription: '添加速率限制' });
    expect(sys).toContain(LANGUAGE_RULE);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — skills section', () => {
  const blocks = ['### Skill: first\n\nFIRST-BODY', '### Skill: second\n\nSECOND-BODY'];

  it('renders skill blocks in the given order under "## Skills / rules", before the diff, unwrapped', () => {
    const user = userOf({ system: 'sys', diff: 'DIFF', skills: blocks });
    expect(user).toContain('## Skills / rules');
    expect(user.indexOf('FIRST-BODY')).toBeLessThan(user.indexOf('SECOND-BODY'));
    expect(user.indexOf('SECOND-BODY')).toBeLessThan(user.indexOf('## Diff to review'));
    // skills are the user's own instructions: trusted, not fenced as untrusted data
    expect(user).not.toMatch(/<untrusted source="skill/);
  });

  it('exposes the block in the trace assembly and omits the section when there are none', () => {
    const { assembly } = assemblePrompt({ system: 'sys', diff: 'D', skills: blocks });
    expect(assembly.skills).toContain('### Skill: second');
    expect(userOf({ system: 'sys', diff: 'D', skills: [] })).not.toContain('## Skills / rules');
    expect(assemblePrompt({ system: 'sys', diff: 'D' }).assembly.skills ?? null).toBeNull();
  });
});
