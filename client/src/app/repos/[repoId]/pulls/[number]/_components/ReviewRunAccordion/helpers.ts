import type { FindingRecord } from "@devdigest/shared";
import { VERDICT_COLOR, VERDICT_LABEL_KEY } from "./constants";

/** Locale date-time, or the raw string when it doesn't parse. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Non-dismissed CRITICAL findings (same rule as the header blockers). */
export function blockerCount(findings: FindingRecord[]): number {
  return findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}

export function verdictColor(verdict: string | null | undefined): string {
  return (verdict && VERDICT_COLOR[verdict]) || "var(--text-muted)";
}

/** i18n key under `prReview.verdict` for a verdict, or null for an unknown one. */
export function verdictLabelKey(verdict: string | null | undefined): string | null {
  return (verdict && VERDICT_LABEL_KEY[verdict]) || null;
}
