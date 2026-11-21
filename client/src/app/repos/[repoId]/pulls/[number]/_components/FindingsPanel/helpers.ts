import type { FindingRecord } from "@devdigest/shared";
import type { CounterSeverity } from "@/components/severity-counters";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/**
 * Apply the panel's filters and sort by severity. The severity filter and
 * "hide low confidence" compose: a finding is shown only if it passes both.
 */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: CounterSeverity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (severity) shown = shown.filter((f) => f.severity === severity);
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
