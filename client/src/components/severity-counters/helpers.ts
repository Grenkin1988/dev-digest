import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/** Severity levels the counters show, in display order (INFO is not surfaced). */
export const SEVERITY_LEVELS = ["CRITICAL", "WARNING", "SUGGESTION"] as const;
export type CounterSeverity = (typeof SEVERITY_LEVELS)[number];
export type SeverityCounts = Record<CounterSeverity, number>;

/** How many findings the hover popover lists per level. */
export const TOP_FINDINGS_LIMIT = 3;

/** A dismissed finding no longer counts (same rule as the run header's blockers). */
function isActive(f: FindingRecord): boolean {
  return !f.dismissed_at;
}

/** Per-level counts of non-dismissed findings; levels with no findings are 0. */
export function countBySeverity(findings: FindingRecord[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (isActive(f) && f.severity in counts) counts[f.severity as CounterSeverity] += 1;
  }
  return counts;
}

/** Non-dismissed findings of one level, most confident first, capped at `limit`. */
export function topFindings(
  findings: FindingRecord[],
  severity: CounterSeverity,
  limit = TOP_FINDINGS_LIMIT,
): { top: FindingRecord[]; more: number } {
  const all = findings
    .filter((f) => isActive(f) && f.severity === severity)
    .sort((a, b) => b.confidence - a.confidence);
  return { top: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

/**
 * Newest review per agent (keyed by agent_id, falling back to agent_name), so a
 * PR's list counters reflect each agent's latest pass and re-runs don't
 * double-count. Summary-kind rows carry no reviewer findings and are skipped.
 */
export function latestReviewPerAgent(reviews: ReviewRecord[]): ReviewRecord[] {
  const byAgent = new Map<string, ReviewRecord>();
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    const key = r.agent_id ?? r.agent_name ?? r.id;
    const prev = byAgent.get(key);
    if (!prev || Date.parse(r.created_at) > Date.parse(prev.created_at)) byAgent.set(key, r);
  }
  return [...byAgent.values()];
}
