import type {
  IntentConfidence,
  IntentMode,
  IntentSource,
  MissingContext,
  PrCommit,
  PrFile,
} from '@devdigest/shared';
import {
  ADDED_LINES_MAX,
  ADDED_LINE_MAX_CHARS,
  COMMIT_BODY_MAX_CHARS,
  DOC_PATH_PATTERN,
  GENERIC_COMMIT_PREFIXES,
  GENERIC_COMMIT_WORDS,
  HUNKS_BLOCK_MAX_CHARS,
  HUNK_HEADER_MAX_CHARS,
  MAX_COMMITS,
  MAX_DOCS,
  MAX_FILES,
  MAX_HUNKS_PER_FILE,
  MAX_ISSUES,
  MAX_RECORDED_REFS,
  MERGE_COMMIT_PATTERN,
  MIN_AUTHOR_CHARS,
  MIN_DESCRIPTIVE_COMMIT_CHARS,
  MIN_DESCRIPTIVE_COMMIT_WORDS,
  REDACTED_LINE,
  SECRET_LINE_PATTERNS,
  SMALL_PR_MAX_CHANGED_LINES,
} from './constants.js';

/**
 * Pure helpers of the intent module (domain ring): no I/O, no clock, no env.
 * Nothing here logs or returns body / issue / doc / hunk / commit text in a
 * form meant for logs; `formatIntentLogLine` only sees kinds, refs and counts.
 */

// ---- text caps -------------------------------------------------------------

export function capText(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

// ---- "no description" decision --------------------------------------------

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const HEADING_LINE = /^#{1,6}\s/;
const CHECKLIST_LINE = /^\s*[-*] \[[ xX]\]/;
const RULE_LINE = /^\s*([-*_])(\s*\1){2,}\s*$/;
// A label is a short phrase ending in ":" or a fully bold phrase ("**Why**").
const LABEL_LINE = /^\s*(?:\**[\w /-]{1,40}:\**|\*\*[^*]{1,40}\*\*)\s*$/;
const PLACEHOLDER_LINE = /^\s*(n\/a|none|tbd|todo|-)\s*$/i;

/**
 * True when the PR body carries no real author-written description: null,
 * whitespace-only, or nothing but template scaffolding (comments, headings,
 * unchecked boxes, rules, labels, placeholders, lines copied from the repo's
 * PR template) with fewer than MIN_AUTHOR_CHARS non-whitespace chars left.
 */
export function isEffectivelyEmptyBody(
  body: string | null | undefined,
  templateText?: string | null,
): boolean {
  if (body == null || body.trim().length === 0) return true;
  const templateLines = new Set(
    (templateText ?? '')
      .replace(HTML_COMMENT, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0),
  );
  let remaining = 0;
  for (const raw of body.replace(HTML_COMMENT, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (
      HEADING_LINE.test(line) ||
      CHECKLIST_LINE.test(line) ||
      RULE_LINE.test(line) ||
      LABEL_LINE.test(line) ||
      PLACEHOLDER_LINE.test(line) ||
      templateLines.has(line)
    ) {
      continue;
    }
    remaining += line.replace(/\s+/g, '').length;
  }
  return remaining < MIN_AUTHOR_CHARS;
}

// ---- references ------------------------------------------------------------

/** Strip query string and fragment (they can carry tokens) before storing or logging. */
export function redactRef(ref: string): string {
  try {
    const u = new URL(ref);
    return `${u.origin}${u.pathname}`;
  } catch {
    return ref.replace(/[?#].*$/s, '');
  }
}

/** Normalized, no `..`, not absolute, and under docs/ or specs/ as markdown. */
export function isAllowlistedDocPath(path: string): boolean {
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
  if (path.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return false;
  return DOC_PATH_PATTERN.test(path);
}

export interface IssueRef {
  owner: string;
  name: string;
  number: number;
}

export interface ExtractedReferences {
  /** Same- or cross-repo GitHub issues/PRs to fetch via the API (max MAX_ISSUES). */
  issues: IssueRef[];
  /** Allowlisted repo-relative docs to read at the PR head (max MAX_DOCS). */
  docs: string[];
  /** References that are recorded but never fetched. */
  missing: MissingContext[];
}

const CLOSING_REF = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:([\w.-]+)\/([\w.-]+))?#(\d+)\b/gi;
const QUALIFIED_REF = /(?<![\w/.-])([\w.-]+)\/([\w.-]+)#(\d+)\b/g;
const BARE_REF = /(?<![\w&/#])#(\d+)\b/g;
const URL_REF = /https?:\/\/[^\s)<>\]"'`]+/g;
const MD_LINK_REL = /\]\((?![a-z][a-z0-9+.-]*:)(?!\/\/)([^)\s#?]+\.md)(?:[#?][^)\s]*)?\)/gi;
const BARE_DOC = /(?<![\w./-])((?:[\w.-]+\/)?(?:docs|specs)\/[\w./-]+\.md)\b/g;

/**
 * Pull issue and doc references out of the PR title/body. Order: closing
 * keywords first, then the rest; de-duplicated. Nothing here is fetched: URLs
 * on any host other than same-repo github.com issue/PR/blob links are only
 * recorded as `host_not_allowlisted` (no SSRF surface).
 */
export function extractReferences(
  title: string,
  body: string | null | undefined,
  repo: { owner: string; name: string },
  selfNumber?: number,
): ExtractedReferences {
  const text = `${title}\n${body ?? ''}`;
  const issues: IssueRef[] = [];
  const seenIssues = new Set<string>();
  const docs: string[] = [];
  const seenDocs = new Set<string>();
  const missing: MissingContext[] = [];
  const seenMissing = new Set<string>();

  const addIssue = (owner: string, name: string, n: number) => {
    if (!Number.isSafeInteger(n) || n <= 0 || (n === selfNumber && sameRepo(owner, name, repo))) return;
    const key = `${owner.toLowerCase()}/${name.toLowerCase()}#${n}`;
    if (seenIssues.has(key)) return;
    seenIssues.add(key);
    if (issues.length < MAX_ISSUES) issues.push({ owner, name, number: n });
  };
  const addDoc = (path: string) => {
    const norm = path.replace(/^\.\//, '');
    if (seenDocs.has(norm)) return;
    seenDocs.add(norm);
    if (isAllowlistedDocPath(norm)) {
      if (docs.length < MAX_DOCS) docs.push(norm);
    } else {
      addMissing(norm, 'path_not_allowlisted');
    }
  };
  const addMissing = (ref: string, reason: MissingContext['reason']) => {
    const key = `${reason}:${ref}`;
    if (seenMissing.has(key) || missing.length >= MAX_RECORDED_REFS) return;
    seenMissing.add(key);
    missing.push({ ref, reason });
  };

  for (const m of text.matchAll(CLOSING_REF)) {
    addIssue(m[1] ?? repo.owner, m[2] ?? repo.name, Number(m[3]));
  }
  for (const m of text.matchAll(QUALIFIED_REF)) addIssue(m[1]!, m[2]!, Number(m[3]));
  for (const m of text.matchAll(BARE_REF)) addIssue(repo.owner, repo.name, Number(m[1]));

  for (const m of text.matchAll(URL_REF)) {
    const raw = m[0].replace(/[.,;:!?]+$/, '');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const segs = url.pathname.split('/').filter((s) => s.length > 0);
    const isGithub = url.protocol === 'https:' && url.hostname === 'github.com';
    if (isGithub && segs.length >= 4 && (segs[2] === 'issues' || segs[2] === 'pull') && /^\d+$/.test(segs[3]!)) {
      addIssue(segs[0]!, segs[1]!, Number(segs[3]));
      continue;
    }
    if (isGithub && segs.length >= 5 && segs[2] === 'blob' && sameRepo(segs[0]!, segs[1]!, repo)) {
      addDoc(segs.slice(4).join('/'));
      continue;
    }
    addMissing(redactRef(raw), 'host_not_allowlisted');
  }

  for (const m of text.matchAll(MD_LINK_REL)) addDoc(m[1]!);
  for (const m of text.matchAll(BARE_DOC)) addDoc(m[1]!);

  return { issues, docs, missing };
}

function sameRepo(owner: string, name: string, repo: { owner: string; name: string }): boolean {
  return owner.toLowerCase() === repo.owner.toLowerCase() && name.toLowerCase() === repo.name.toLowerCase();
}

// ---- files, hunks, status --------------------------------------------------

export type FileStatus = 'added' | 'deleted' | 'modified' | 'unknown';

/** Status inferred from the patch header (PrFile has no GitHub `status`). */
export function fileStatus(patch: string | null | undefined): FileStatus {
  if (!patch) return 'unknown';
  if (patch.startsWith('@@ -0,0 ')) return 'added';
  if (/^@@ -\d+(?:,\d+)? \+0,0 @@/.test(patch)) return 'deleted';
  return 'modified';
}

/** The `@@ … @@ funcname` lines of a patch (hunk bodies are discarded). */
export function hunkHeaders(patch: string | null | undefined): string[] {
  if (!patch) return [];
  const out: string[] = [];
  for (const line of patch.split(/\r?\n/)) {
    if (/^@@ [^@]+ @@/.test(line)) {
      out.push(line.slice(0, HUNK_HEADER_MAX_CHARS));
      if (out.length >= MAX_HUNKS_PER_FILE) break;
    }
  }
  return out;
}

export interface PreparedFile {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  hunks: string[];
}

export interface PreparedFiles {
  files: PreparedFile[];
  /** Files beyond MAX_FILES ("+N more files"). */
  moreFiles: number;
  /** Total hunk headers kept (after the block cap). */
  hunkCount: number;
}

/** Biggest changes first, capped; hunk headers capped per file and in total. */
export function prepareFiles(files: readonly PrFile[]): PreparedFiles {
  const sorted = [...files].sort(
    (a, b) => b.additions + b.deletions - (a.additions + a.deletions) || a.path.localeCompare(b.path),
  );
  const shown = sorted.slice(0, MAX_FILES);
  let budget = HUNKS_BLOCK_MAX_CHARS;
  let hunkCount = 0;
  const prepared = shown.map((f): PreparedFile => {
    const hunks: string[] = [];
    for (const h of hunkHeaders(f.patch)) {
      if (budget - h.length < 0) break;
      budget -= h.length;
      hunks.push(h);
    }
    hunkCount += hunks.length;
    return {
      path: f.path,
      status: fileStatus(f.patch),
      additions: f.additions,
      deletions: f.deletions,
      hunks,
    };
  });
  return { files: prepared, moreFiles: Math.max(0, sorted.length - shown.length), hunkCount };
}

export interface AddedLinesExcerpt {
  lines: string[];
  /** More `+` lines existed than the excerpt keeps. */
  truncated: boolean;
}

/**
 * Small-PR excerpt for changes-only mode: only `+` lines (never removed or
 * context lines), only when the whole PR changes fewer than
 * SMALL_PR_MAX_CHANGED_LINES lines. Credential-looking lines are redacted.
 */
export function addedLinesExcerpt(files: readonly PrFile[]): AddedLinesExcerpt {
  const changed = files.reduce((n, f) => n + f.additions + f.deletions, 0);
  if (changed >= SMALL_PR_MAX_CHANGED_LINES) return { lines: [], truncated: false };
  const lines: string[] = [];
  let truncated = false;
  for (const f of files) {
    if (!f.patch) continue;
    for (const line of f.patch.split(/\r?\n/)) {
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      if (lines.length >= ADDED_LINES_MAX) {
        truncated = true;
        break;
      }
      const content = line.slice(1);
      lines.push(
        SECRET_LINE_PATTERNS.some((p) => p.test(content))
          ? REDACTED_LINE
          : content.slice(0, ADDED_LINE_MAX_CHARS),
      );
    }
    if (truncated) break;
  }
  return { lines, truncated };
}

// ---- commits ---------------------------------------------------------------

export interface PreparedCommit {
  subject: string;
  body?: string;
}

/** Subject + first chars of the body; merge commits skipped; capped. */
export function prepareCommits(commits: readonly PrCommit[]): PreparedCommit[] {
  const out: PreparedCommit[] = [];
  for (const c of commits) {
    const [subject = '', ...rest] = c.message.split(/\r?\n/);
    if (MERGE_COMMIT_PATTERN.test(subject)) continue;
    const body = rest.join('\n').trim().slice(0, COMMIT_BODY_MAX_CHARS);
    out.push(body.length > 0 ? { subject: subject.trim(), body } : { subject: subject.trim() });
    if (out.length >= MAX_COMMITS) break;
  }
  return out;
}

/** A descriptive subject is an author statement of purpose (≥4 words, ≥20 chars, not generic). */
export function isDescriptiveCommit(subject: string): boolean {
  const s = subject.trim();
  if (MERGE_COMMIT_PATTERN.test(s)) return false;
  const lower = s.toLowerCase();
  if (GENERIC_COMMIT_PREFIXES.some((p) => lower.startsWith(p))) return false;
  const words = s.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < MIN_DESCRIPTIVE_COMMIT_WORDS || s.length < MIN_DESCRIPTIVE_COMMIT_CHARS) return false;
  const first = words[0]!.toLowerCase().replace(/[^a-z]/g, '');
  return !GENERIC_COMMIT_WORDS.has(first);
}

// ---- confidence, staleness, filter decision --------------------------------

export interface ConfidenceInput {
  mode: IntentMode;
  /** Issues + docs actually fetched. */
  contextFetched: number;
  commitSubjects: readonly string[];
  missingCount: number;
  inScopeCount: number;
}

/** Deterministic: the model never sets confidence. */
export function computeConfidence(i: ConfidenceInput): IntentConfidence {
  if (i.inScopeCount === 0) return 'low';
  if (i.mode === 'inferred_from_changes') {
    if (i.missingCount > 0) return 'low';
    return i.commitSubjects.some(isDescriptiveCommit) ? 'medium' : 'low';
  }
  if (i.missingCount > 0) return 'medium';
  return i.contextFetched > 0 ? 'high' : 'medium';
}

/** An intent without a recorded head SHA cannot be verified, so it counts as stale. */
export function isStale(derivedHeadSha: string | null | undefined, currentHeadSha: string): boolean {
  return !derivedHeadSha || derivedHeadSha !== currentHeadSha;
}

/** Filtering is on only for a fresh, author-description intent with high/medium confidence. */
export function shouldFilterByScope(i: {
  mode: IntentMode;
  confidence: IntentConfidence;
  stale: boolean;
}): boolean {
  return i.mode === 'author_description' && i.confidence !== 'low' && !i.stale;
}

/** Why the filter is off (for the `scope filter: off (…)` log line). */
export function filterOffReason(i: {
  mode: IntentMode;
  confidence: IntentConfidence;
  stale: boolean;
}): 'stale' | 'inferred_from_changes' | 'low confidence' {
  if (i.stale) return 'stale';
  if (i.mode === 'inferred_from_changes') return 'inferred_from_changes';
  return 'low confidence';
}

// ---- rendering --------------------------------------------------------------

export interface RenderIntentInput {
  mode: IntentMode;
  confidence: IntentConfidence;
  summary: string;
  inScope: readonly string[];
  outOfScope: readonly string[];
  stale: boolean;
  derivedSha: string | null | undefined;
}

const sha7 = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : 'unknown');

/** The text placed in the reviewer prompt's "Stated intent" block. */
export function renderIntentSection(i: RenderIntentInput): string {
  const list = (items: readonly string[]) =>
    items.length > 0 ? items.map((x) => `- ${x}`).join('\n') : '- (none)';
  return [
    `Mode: ${i.mode}`,
    `Confidence: ${i.confidence}`,
    ...(i.stale ? [`(stale: derived at ${sha7(i.derivedSha)})`] : []),
    `Summary: ${i.summary}`,
    `IN SCOPE:\n${list(i.inScope)}`,
    `OUT OF SCOPE:\n${list(i.outOfScope)}`,
  ].join('\n');
}

// ---- log line (kinds, refs and counts only) --------------------------------

function formatSource(s: IntentSource): string {
  const flag = s.truncated ? ',truncated' : '';
  switch (s.kind) {
    case 'title':
    case 'body':
      return `${s.kind}(${s.chars}${flag})`;
    case 'issue':
      return `issue${s.ref}(${s.chars}${flag})`;
    case 'doc':
      return `doc:${s.ref}(${s.chars}${flag})`;
    case 'files':
    case 'hunks':
    case 'commits':
    case 'added_lines':
      return `${s.kind}(${s.ref}${flag})`;
  }
}

export type IntentLogEvent =
  | {
      kind: 'derived';
      provider: string;
      model: string;
      mode: IntentMode;
      confidence: IntentConfidence;
      sources: readonly IntentSource[];
      missingCount: number;
      tokensEst: number;
      tokensIn: number;
      tokensOut: number;
    }
  | {
      kind: 'reused';
      derivedSha: string | null | undefined;
      confidence: IntentConfidence;
      inScopeCount: number;
      outOfScopeCount: number;
    }
  | { kind: 'stale'; derivedSha: string | null | undefined; headSha: string }
  | { kind: 'unavailable'; message: string };

/** Human-readable `intent: …` line for the live run log. Never contains source content. */
export function formatIntentLogLine(e: IntentLogEvent): string {
  switch (e.kind) {
    case 'derived':
      return (
        `intent: derived via ${e.provider}/${e.model} [${e.mode}, confidence=${e.confidence}] — ` +
        `sources: ${e.sources.map(formatSource).join(' ')} · missing: ${e.missingCount} · ` +
        `~${e.tokensEst.toLocaleString('en-US')} tok est · in ${e.tokensIn.toLocaleString('en-US')} / out ${e.tokensOut.toLocaleString('en-US')} tok`
      );
    case 'reused':
      return (
        `intent: reused (derived at ${sha7(e.derivedSha)}, confidence=${e.confidence}) — ` +
        `${e.inScopeCount} in / ${e.outOfScopeCount} out of scope`
      );
    case 'stale':
      return (
        `intent: stale (derived at ${sha7(e.derivedSha)}, head ${sha7(e.headSha)}) — ` +
        'context only, scope filter off'
      );
    case 'unavailable':
      return `intent: unavailable (${e.message}) — reviewing without intent`;
  }
}

// ---- failure classification -------------------------------------------------

/** Max chars of an error message that may reach the log (provider errors can quote model output). */
const ERROR_SUMMARY_MAX = 120;

/**
 * A log-safe summary of an error: its first line only, capped at
 * `ERROR_SUMMARY_MAX` chars. Provider/schema errors may embed raw model output
 * or request fragments, which the Intent Layer never logs in full.
 */
export function safeErrorSummary(err: unknown): string {
  const raw = err instanceof Error ? err.message : '';
  const firstLine = raw.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!firstLine) return 'unknown error';
  return firstLine.length > ERROR_SUMMARY_MAX ? `${firstLine.slice(0, ERROR_SUMMARY_MAX)}…` : firstLine;
}

/** Map a GitHub client error to a `missing_context` reason (message text is never stored). */
export function issueFailureReason(err: unknown): MissingContext['reason'] {
  const status = (err as { status?: unknown } | null)?.status;
  if (status === 404 || status === 410) return 'not_found';
  const msg = err instanceof Error ? err.message : '';
  if (/timed? ?out|timeout/i.test(msg)) return 'timeout';
  return 'unreachable';
}

/** Display ref of an issue: `#N` in the PR's own repo, `owner/repo#N` otherwise. */
export function issueDisplayRef(i: { owner: string; name: string; number: number }, repo: { owner: string; name: string }): string {
  return sameRepo(i.owner, i.name, repo) ? `#${i.number}` : `${i.owner}/${i.name}#${i.number}`;
}
