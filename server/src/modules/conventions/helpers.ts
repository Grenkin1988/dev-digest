import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { ConventionView } from './schemas.js';

/**
 * Pure helpers for the conventions module. No I/O.
 */

/** Collapse all whitespace runs to one space and trim. */
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Find `snippet` in `content`, tolerant of indentation / blank-line drift.
 * Line-wise: every non-empty snippet line must match (whitespace-normalised) a
 * run of consecutive non-empty file lines. Returns 1-based inclusive line
 * numbers of the match in the ORIGINAL content, or null.
 */
export function locateSnippet(
  content: string,
  snippet: string,
): { startLine: number; endLine: number } | null {
  const want = snippet.split(/\r?\n/).map(squash).filter((l) => l.length > 0);
  if (want.length === 0) return null;
  const have: { idx: number; text: string }[] = [];
  content.split(/\r?\n/).forEach((raw, idx) => {
    const text = squash(raw);
    if (text.length > 0) have.push({ idx, text });
  });
  for (let i = 0; i + want.length <= have.length; i++) {
    let ok = true;
    for (let j = 0; j < want.length; j++) {
      if (have[i + j]!.text !== want[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return { startLine: have[i]!.idx + 1, endLine: have[i + want.length - 1]!.idx + 1 };
  }
  return null;
}

/** Normalised form of a rule, for dedupe across scans. */
export function normaliseRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Structural shape of a persisted convention (no table types, onion section 6). */
export interface ConventionLike {
  id: string;
  rule: string;
  evidencePath: string | null;
  evidenceSnippet: string | null;
  confidence: number | null;
  status: string;
  category: string | null;
  startLine: number | null;
  endLine: number | null;
}

/** Row to API view. Nullable columns are coalesced: the response schema is enforced at runtime. */
export function toConventionView(row: ConventionLike): ConventionView {
  const status = row.status === 'accepted' || row.status === 'rejected' ? row.status : 'pending';
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    accepted: status === 'accepted',
    status,
    category: row.category,
    start_line: row.startLine,
    end_line: row.endLine,
  };
}

/** Truncate to at most `maxBytes` bytes (UTF-8), on a character boundary. */
export function capBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  let out = text.slice(0, maxBytes);
  while (Buffer.byteLength(out, 'utf8') > maxBytes) out = out.slice(0, -1);
  return out;
}

export interface PromptFile {
  path: string;
  content: string;
}

/** The user prompt: config files + sampled sources, each wrapped as untrusted data. */
export function buildUserPrompt(configs: PromptFile[], samples: PromptFile[]): string {
  const block = (kind: string, f: PromptFile) => wrapUntrusted(`${kind}:${f.path}`, f.content);
  return [
    'CONFIG FILES:',
    configs.length ? configs.map((f) => block('config', f)).join('\n\n') : '(none found)',
    'SAMPLED SOURCE FILES:',
    samples.length ? samples.map((f) => block('file', f)).join('\n\n') : '(none)',
    'Propose house conventions. Every evidence_path MUST be one of the files above and every evidence_snippet MUST be copied verbatim from that file.',
  ].join('\n\n');
}
