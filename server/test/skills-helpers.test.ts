import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  autoVersionMessage,
  computeSkillStats,
  extractSkillFromZip,
  formatSkillBlock,
  isContentChange,
  parseSkillMarkdown,
} from '../src/modules/skills/helpers.js';
import { ValidationError } from '../src/platform/errors.js';

const SKILL_MD = `---
name: flaky-test-detector
description: "Flag tests that depend on time, order or the network."
type: rubric
---
# Flaky tests

Look for sleeps, shared state and real network calls.
`;

describe('parseSkillMarkdown', () => {
  it('reads frontmatter and returns the body without it', () => {
    const p = parseSkillMarkdown(SKILL_MD, 'fallback');
    expect(p.name).toBe('flaky-test-detector');
    expect(p.description).toBe('Flag tests that depend on time, order or the network.');
    expect(p.type).toBe('rubric');
    expect(p.body.startsWith('# Flaky tests')).toBe(true);
  });

  it('falls back to heading/first line and type custom without frontmatter', () => {
    const p = parseSkillMarkdown('# My rule\n\nAlways add a test.\r\n', 'file');
    expect(p.name).toBe('My rule');
    expect(p.description).toBe('Always add a test.');
    expect(p.type).toBe('custom');
  });

  it('ignores an unknown type and rejects an empty body', () => {
    expect(parseSkillMarkdown('---\ntype: weird\n---\nbody', 'x').type).toBe('custom');
    expect(() => parseSkillMarkdown('---\nname: a\n---\n  \n', 'x')).toThrow(ValidationError);
  });
});

describe('extractSkillFromZip', () => {
  it('reads only SKILL.md and reports everything else as ignored (never decompressed)', () => {
    const zip = zipSync({
      'flaky/SKILL.md': strToU8(SKILL_MD),
      'flaky/scripts/run.sh': strToU8('#!/bin/sh\nrm -rf /\n'),
      'flaky/README.txt': strToU8('hi'),
    });
    const out = extractSkillFromZip(zip);
    expect(out.source).toBe('flaky/SKILL.md');
    expect(out.text).toContain('Flaky tests');
    expect(out.ignored.sort()).toEqual(['flaky/README.txt', 'flaky/scripts/run.sh']);
    expect(out.text).not.toContain('rm -rf');
  });

  it('accepts a lone markdown file when there is no SKILL.md', () => {
    const out = extractSkillFromZip(zipSync({ 'rules.md': strToU8('# Rules\nbody') }));
    expect(out.source).toBe('rules.md');
  });

  it('rejects an archive with no markdown, a corrupt zip and an oversized SKILL.md', () => {
    expect(() => extractSkillFromZip(zipSync({ 'a.sh': strToU8('x') }))).toThrow(/No SKILL\.md/);
    expect(() => extractSkillFromZip(new Uint8Array([0x50, 0x4b, 1, 2, 3, 4]))).toThrow(ValidationError);
    const big = zipSync({ 'SKILL.md': strToU8('a'.repeat(300 * 1024)) });
    expect(() => extractSkillFromZip(big)).toThrow(/larger than/);
  });

  it('skips path-traversal and macOS metadata entries', () => {
    const out = extractSkillFromZip(
      zipSync({ 'SKILL.md': strToU8('# S\nbody'), '../evil.md': strToU8('x'), '__MACOSX/._SKILL.md': strToU8('x') }),
    );
    expect(out.ignored).toEqual([]);
  });
});

describe('versioning + prompt block', () => {
  const existing = { body: 'a', description: 'd' };

  it('bumps only on body/description change', () => {
    expect(isContentChange(existing, { body: 'a', description: 'd' })).toBe(false);
    expect(isContentChange(existing, {})).toBe(false);
    expect(isContentChange(existing, { body: 'b' })).toBe(true);
    expect(isContentChange(existing, { description: 'x' })).toBe(true);
  });

  it('writes an auto change note', () => {
    expect(autoVersionMessage(existing, { body: 'b' })).toBe('Body edited');
    expect(autoVersionMessage(existing, { description: 'x' })).toBe('Description edited');
    expect(autoVersionMessage(existing, { body: 'b', description: 'x' })).toBe('Body and description edited');
  });

  it('formats a skill block as name → description → body', () => {
    expect(formatSkillBlock({ name: 'n', description: ' d ', body: ' b \n' })).toBe('### Skill: n\n\nd\n\nb');
    expect(formatSkillBlock({ name: 'n', description: '', body: 'b' })).toBe('### Skill: n\n\nb');
  });
});

describe('computeSkillStats', () => {
  const day = new Date();
  const input = {
    links: [
      { skillId: 's1', agentId: 'a1', agentName: 'Sec' },
      { skillId: 's1', agentId: 'a2', agentName: 'Perf' },
      { skillId: 's2', agentId: 'a2', agentName: 'Perf' },
    ],
    runs: [
      { agentId: 'a1', prId: 'p1' },
      { agentId: 'a2', prId: 'p1' },
      { agentId: 'a3', prId: 'p2' },
      { agentId: 'a2', prId: 'p3' },
    ],
    findings: [
      { agentId: 'a1', category: 'security', acceptedAt: day, dismissedAt: null },
      { agentId: 'a1', category: 'security', acceptedAt: null, dismissedAt: day },
      { agentId: 'a2', category: 'perf', acceptedAt: day, dismissedAt: null },
      { agentId: 'a3', category: 'bug', acceptedAt: day, dismissedAt: null },
      { agentId: 'a1', category: 'style', acceptedAt: null, dismissedAt: null },
    ],
  };

  it('counts agents, pull share, accept rate and categories via linked agents', () => {
    const s = computeSkillStats('s1', input);
    expect(s.agents).toBe(2);
    expect(s.pull_pct).toBe(67); // p1,p3 of p1,p2,p3
    expect(s.accept_pct).toBe(67); // 2 accepted, 1 dismissed (undecided ignored)
    expect(s.findings).toBe(4);
    expect(s.by_category[0]).toEqual({ category: 'security', count: 2 });
    expect(s.used_by.map((u) => u.name)).toEqual(['Sec', 'Perf']);
  });

  it('returns null percentages when there is no data', () => {
    const s = computeSkillStats('unlinked', input);
    expect(s).toMatchObject({ agents: 0, pull_pct: 0, accept_pct: null, findings: 0 });
  });
});
