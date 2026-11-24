/** Rows per multi-row INSERT when importing GitHub's PR list. */
export const UPSERT_CHUNK_SIZE = 200;

/**
 * Diff stats aren't on GitHub's PR-list payload. At most this many PRs per sync
 * get their stats back-filled from the detail endpoint (one GitHub call each);
 * later syncs chip away at the remainder.
 */
export const BACKFILL_LIMIT = 10;

/**
 * `GET /repos/:id/pulls` syncs from GitHub at most once per this window per
 * repo (gated on `repos.last_polled_at`). Every other read is served from
 * Postgres, so a tab polling the list doesn't spend GitHub quota each time.
 */
export const PULL_SYNC_MIN_INTERVAL_MS = 5 * 60_000;

/**
 * `GET /pulls/:id` refreshes files/commits/body from GitHub at most once per
 * this window per PR (per API process); otherwise it serves persisted detail.
 */
export const DETAIL_REFRESH_TTL_MS = 2 * 60_000;

/**
 * A PR number that isn't in Postgres triggers a list sync, but no more often
 * than this, so repeated lookups of a bogus number can't hammer GitHub.
 */
export const MISSING_PR_SYNC_INTERVAL_MS = 30_000;

/** Severity levels counted on the PR list, in display order. */
export const COUNTED_SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;
