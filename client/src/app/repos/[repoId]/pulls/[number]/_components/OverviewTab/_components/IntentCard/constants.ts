import type { IntentConfidence } from "@devdigest/shared";

/** Badge colours per confidence level (design tokens, keyed by the contract enum). */
export const CONFIDENCE_TONE = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--crit)", bg: "var(--crit-bg)" },
} as const satisfies Record<IntentConfidence, { color: string; bg: string }>;

/** Length of the short SHA shown in the stale hint. */
export const SHORT_SHA_LENGTH = 7;
