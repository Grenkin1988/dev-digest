/** Constants for the conventions module (domain ring: no I/O). */

/** How many top-ranked source files are sampled for one scan. */
export const SAMPLE_COUNT = 12;

/** Hard cap on candidates the model may return (and we accept). */
export const MAX_CANDIDATES = 15;

/**
 * Root-level config files worth showing the model. The git port has no
 * directory listing, so these are concrete names (the usual `.eslintrc*` /
 * `eslint.config.*` / `.prettierrc*` / `prettier.config.*` spellings); a read
 * that is empty or throws counts as "file not present".
 */
export const CONFIG_FILE_CANDIDATES: readonly string[] = [
  'tsconfig.json',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.mjs',
  'prettier.config.cjs',
  '.editorconfig',
];

/** Per-file byte caps for what is sent to the model. */
export const CONFIG_MAX_BYTES = 4 * 1024;
export const SAMPLE_MAX_BYTES = 8 * 1024;

/** Cap on a stored evidence snippet (chars). */
export const SNIPPET_MAX_CHARS = 2000;

export const SYSTEM_PROMPT_FILE = 'conventions.system.md';
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';
export const FEATURE_MODEL_ID = 'conventions';
