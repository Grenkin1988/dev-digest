/** Verdict → colour token. */
export const VERDICT_COLOR: Record<string, string> = {
  request_changes: "var(--crit)",
  comment: "var(--warn)",
  approve: "var(--ok)",
};

/** Verdict → i18n key under `prReview.verdict`. */
export const VERDICT_LABEL_KEY: Record<string, string> = {
  request_changes: "requestChanges",
  comment: "comment",
  approve: "approve",
};
