import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/** Findings keyed by run id, so timeline counters reuse the loaded reviews (no fetch). */
export function findingsByRunId(runs: ReviewRecord[]): Record<string, FindingRecord[]> {
  const map: Record<string, FindingRecord[]> = {};
  for (const r of runs) if (r.run_id) map[r.run_id] = r.findings;
  return map;
}

/** Every lethal-trifecta finding across the PR's reviews. */
export function lethalTrifectaFindings(runs: ReviewRecord[]): FindingRecord[] {
  return runs.flatMap((r) => r.findings).filter((f) => f.kind === "lethal_trifecta");
}
