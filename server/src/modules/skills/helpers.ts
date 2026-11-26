import { unzipSync } from 'fflate';
import type { Skill, SkillType } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  DEFAULT_IMPORT_TYPE,
  MAX_IGNORED_LISTED,
  MAX_SKILL_MD_BYTES,
  MSG_BODY,
  MSG_BOTH,
  MSG_DESCRIPTION,
  SKILL_FILENAME,
} from './constants.js';

/**
 * Pure helpers for the skills module — row ⇄ DTO mapping, the version-bump rule,
 * the prompt block format, the markdown/zip import parser and stats maths.
 * No I/O. Importing never executes anything: archives are only READ, and only
 * one text file is ever decompressed.
 */

const SKILL_TYPES: readonly SkillType[] = ['rubric', 'convention', 'security', 'custom'];

// ---- DTO mapping -----------------------------------------------------------

/** Structural shape of a persisted skill (no table types — onion §6). */
export interface SkillLike {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
}

export function toSkillDto(row: SkillLike): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as Skill['type'],
    source: row.source as Skill['source'],
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

export interface SkillVersionLike {
  skillId: string;
  version: number;
  body: string;
  description: string | null;
  message: string | null;
  createdAt: Date;
}

export interface SkillVersionDto {
  skill_id: string;
  version: number;
  body: string;
  description: string | null;
  message: string | null;
  created_at: string;
}

export function toSkillVersionDto(row: SkillVersionLike): SkillVersionDto {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    description: row.description,
    message: row.message,
    created_at: row.createdAt.toISOString(),
  };
}

// ---- Versioning ------------------------------------------------------------

/** A body or description change bumps the skill version (name/type/enabled don't). */
export function isContentChange(
  existing: { body: string; description: string },
  patch: { body?: string; description?: string },
): boolean {
  return (
    (patch.body !== undefined && patch.body !== existing.body) ||
    (patch.description !== undefined && patch.description !== existing.description)
  );
}

/** Auto change note used when the author gave none. */
export function autoVersionMessage(
  existing: { body: string; description: string },
  patch: { body?: string; description?: string },
): string {
  const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
  const descChanged = patch.description !== undefined && patch.description !== existing.description;
  if (bodyChanged && descChanged) return MSG_BOTH;
  return descChanged ? MSG_DESCRIPTION : MSG_BODY;
}

// ---- Prompt block ----------------------------------------------------------

/** One skill rendered for the `## Skills / rules` prompt section. */
export function formatSkillBlock(skill: { name: string; description: string; body: string }): string {
  const parts = [`### Skill: ${skill.name}`];
  if (skill.description.trim()) parts.push(skill.description.trim());
  parts.push(skill.body.trim());
  return parts.join('\n\n');
}

/** Rough token estimate (≈4 chars/token) for logs; the UI uses the same rule. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---- Import: markdown ------------------------------------------------------

export interface ParsedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

function unquote(v: string): string {
  const s = v.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Minimal `key: value` frontmatter reader (single line, or indented / `>` `|` continuation). */
function parseFrontmatter(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  let key: string | null = null;
  for (const line of raw.split('\n')) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m) {
      key = m[1]!.toLowerCase();
      const v = m[2]!.trim();
      out[key] = v === '>' || v === '|' || v === '>-' || v === '|-' ? '' : unquote(v);
    } else if (key && /^\s+\S/.test(line)) {
      out[key] = `${out[key] ?? ''} ${line.trim()}`.trim();
    }
  }
  return out;
}

/** Turn a SKILL.md / *.md into the core of a skill. Throws ValidationError when there is no body. */
export function parseSkillMarkdown(text: string, fallbackName: string): ParsedSkill {
  let src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let meta: Record<string, string> = {};
  const fm = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
  if (fm) {
    meta = parseFrontmatter(fm[1]!);
    src = src.slice(fm[0].length);
  }
  const body = src.trim();
  if (!body) throw new ValidationError('The skill file has no body text.');

  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const name = (meta.name || heading || fallbackName).trim().slice(0, 120);
  const firstPara = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  const description = (meta.description || firstPara || '').slice(0, 500);
  const type = SKILL_TYPES.includes(meta.type as SkillType) ? (meta.type as SkillType) : DEFAULT_IMPORT_TYPE;
  return { name, description, type, body };
}

/** `foo/bar.md` → `bar`. */
export function nameFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/\.[^.]+$/, '') || 'imported-skill';
}

// ---- Import: zip -----------------------------------------------------------

export interface ZipExtract {
  text: string;
  /** Archive entries that were NOT read (never decompressed, written or run). */
  ignored: string[];
  /** The entry we read. */
  source: string;
}

/** Zip magic number (`PK`). */
export function isZip(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0x50 && b[1] === 0x4b;
}

function isSafeEntry(name: string): boolean {
  return !name.split('/').includes('..') && !name.startsWith('/') && !name.includes('\\');
}

/**
 * Read ONLY the skill's markdown out of a zip. Two passes with fflate's `filter`:
 * the first lists entries (decompresses nothing), the second inflates just the
 * chosen file. Scripts, binaries and everything else stay compressed and unread.
 */
export function extractSkillFromZip(bytes: Uint8Array): ZipExtract {
  const entries: { name: string; originalSize: number }[] = [];
  try {
    unzipSync(bytes, {
      filter: (f) => {
        entries.push({ name: f.name, originalSize: f.originalSize });
        return false;
      },
    });
  } catch {
    throw new ValidationError('The archive could not be read as a zip file.');
  }

  const files = entries.filter(
    (e) => !e.name.endsWith('/') && isSafeEntry(e.name) && !e.name.startsWith('__MACOSX/'),
  );
  const lower = (s: string) => s.toLowerCase();
  const skillMd = files
    .filter((e) => {
      const parts = e.name.split('/');
      return parts.length <= 2 && lower(parts[parts.length - 1]!) === lower(SKILL_FILENAME);
    })
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length)[0];
  const mdFiles = files.filter((e) => /\.(md|markdown)$/i.test(e.name));
  const chosen = skillMd ?? (mdFiles.length === 1 ? mdFiles[0] : undefined);
  if (!chosen) throw new ValidationError(`No ${SKILL_FILENAME} found in the archive.`);
  if (chosen.originalSize > MAX_SKILL_MD_BYTES) {
    throw new ValidationError(`${chosen.name} is larger than ${MAX_SKILL_MD_BYTES / 1024} KB.`);
  }

  const out = unzipSync(bytes, { filter: (f) => f.name === chosen.name });
  const data = out[chosen.name];
  if (!data || data.length > MAX_SKILL_MD_BYTES) {
    throw new ValidationError(`${chosen.name} is missing or larger than ${MAX_SKILL_MD_BYTES / 1024} KB.`);
  }
  const ignored = files
    .filter((e) => e.name !== chosen.name)
    .map((e) => e.name)
    .slice(0, MAX_IGNORED_LISTED);
  return { text: new TextDecoder('utf-8').decode(data), ignored, source: chosen.name };
}

// ---- Stats -----------------------------------------------------------------

export interface StatsInput {
  /** agent_skills rows (+ agent name) for the workspace. */
  links: { skillId: string; agentId: string; agentName: string }[];
  /** Done runs inside the window. */
  runs: { agentId: string | null; prId: string | null }[];
  /** Findings produced by reviews inside the window. */
  findings: {
    agentId: string | null;
    category: string;
    acceptedAt: Date | null;
    dismissedAt: Date | null;
  }[];
}

export interface SkillStats {
  agents: number;
  pull_pct: number | null;
  accept_pct: number | null;
  findings: number;
  used_by: { id: string; name: string }[];
  by_category: { category: string; count: number }[];
}

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((100 * n) / d) : null);

/**
 * Stats are a proxy via the agents that use the skill TODAY: nothing records
 * which skills a past run carried, so this is "how do the agents that use this
 * skill perform", not a per-run attribution.
 */
export function computeSkillStats(skillId: string, input: StatsInput): SkillStats {
  const used = input.links.filter((l) => l.skillId === skillId);
  const agentIds = new Set(used.map((l) => l.agentId));

  const allPulls = new Set<string>();
  const skillPulls = new Set<string>();
  for (const r of input.runs) {
    if (!r.prId) continue;
    allPulls.add(r.prId);
    if (r.agentId && agentIds.has(r.agentId)) skillPulls.add(r.prId);
  }

  let accepted = 0;
  let dismissed = 0;
  let findings = 0;
  const cats = new Map<string, number>();
  for (const f of input.findings) {
    if (!f.agentId || !agentIds.has(f.agentId)) continue;
    findings += 1;
    if (f.acceptedAt) accepted += 1;
    else if (f.dismissedAt) dismissed += 1;
    cats.set(f.category, (cats.get(f.category) ?? 0) + 1);
  }

  return {
    agents: agentIds.size,
    pull_pct: pct(skillPulls.size, allPulls.size),
    accept_pct: pct(accepted, accepted + dismissed),
    findings,
    used_by: used.map((l) => ({ id: l.agentId, name: l.agentName })),
    by_category: [...cats.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
  };
}
