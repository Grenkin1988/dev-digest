/** Constants for the intent module (domain ring: no I/O, no env). */

/** The `review_intent` feature id in the FEATURE_MODELS registry. */
export const INTENT_FEATURE = 'review_intent' as const;

/** Minimum non-whitespace author characters before a body counts as a real description. */
export const MIN_AUTHOR_CHARS = 40;

// ---- caps on what is sent to the classifier -------------------------------
export const TITLE_MAX_CHARS = 300;
export const BODY_MAX_CHARS = 10_000;
export const MAX_ISSUES = 3;
export const ISSUE_BODY_MAX_CHARS = 10_000;
export const MAX_DOCS = 3;
export const DOC_MAX_CHARS = 10_000;
/** External / unusable references recorded as missing context (never fetched). */
export const MAX_RECORDED_REFS = 10;
export const MAX_FILES = 150;
export const MAX_HUNKS_PER_FILE = 5;
export const HUNK_HEADER_MAX_CHARS = 160;
export const HUNKS_BLOCK_MAX_CHARS = 6_000;
export const MAX_COMMITS = 20;
export const COMMIT_BODY_MAX_CHARS = 300;

/** Per-source wall-clock budget for GitHub / git reads. */
export const SOURCE_TIMEOUT_MS = 10_000;

// ---- small-PR added-lines excerpt (changes-only mode) ---------------------
/** The excerpt is only offered when the PR changes fewer lines than this. */
export const SMALL_PR_MAX_CHANGED_LINES = 50;
export const ADDED_LINES_MAX = 40;
export const ADDED_LINE_MAX_CHARS = 200;
export const REDACTED_LINE = '[redacted]';
/** Lines that look like credentials are replaced before the excerpt leaves the process. */
export const SECRET_LINE_PATTERNS: readonly RegExp[] = [
  /(api[_-]?key|secret|token|password)\s*[:=]/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
];

// ---- PR template (probed at the PR head) ----------------------------------
export const PR_TEMPLATE_CANDIDATES: readonly string[] = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'docs/pull_request_template.md',
  'pull_request_template.md',
];
export const TEMPLATE_MAX_CHARS = 10_000;

// ---- plan / spec docs ------------------------------------------------------
/** Only repo-relative markdown under docs/ or specs/ is ever read from the clone. */
export const DOC_PATH_PATTERN = /^([\w.-]+\/)?(docs|specs)\/[\w./-]+\.md$/;

// ---- commit descriptiveness -------------------------------------------------
export const GENERIC_COMMIT_WORDS: ReadonlySet<string> = new Set([
  'wip',
  'fix',
  'fixes',
  'update',
  'updates',
  'change',
  'changes',
  'tmp',
  'misc',
  'cleanup',
]);
export const GENERIC_COMMIT_PREFIXES: readonly string[] = ['fixup!', 'squash!'];
export const MIN_DESCRIPTIVE_COMMIT_WORDS = 4;
export const MIN_DESCRIPTIVE_COMMIT_CHARS = 20;
export const MERGE_COMMIT_PATTERN = /^Merge (branch|pull request)/;
