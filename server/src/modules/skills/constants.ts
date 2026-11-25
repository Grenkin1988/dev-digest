/** Constants for the skills module. */

/** Version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Largest accepted import upload (raw bytes, markdown or zip). */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Largest SKILL.md body we accept (uncompressed). */
export const MAX_SKILL_MD_BYTES = 200 * 1024;

/** Request body cap for the preview route (base64 of MAX_IMPORT_BYTES + JSON overhead). */
export const IMPORT_BODY_LIMIT = 3 * 1024 * 1024;

/** The one file we read out of an archive. */
export const SKILL_FILENAME = 'SKILL.md';

/** Max ignored file names echoed back in an import preview. */
export const MAX_IGNORED_LISTED = 100;

/** Window for the Stats tab / card footers. */
export const STATS_WINDOW_DAYS = 30;

export const DEFAULT_IMPORT_TYPE = 'custom' as const;

/** Auto change notes (stored in skill_versions.message). */
export const MSG_INITIAL = 'Initial version';
export const MSG_BODY = 'Body edited';
export const MSG_DESCRIPTION = 'Description edited';
export const MSG_BOTH = 'Body and description edited';
export const msgRestored = (version: number): string => `Restored from v${version}`;
