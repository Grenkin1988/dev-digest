import type { IconName } from "@devdigest/ui";
import type { PrCommit, RunSummary } from "@devdigest/shared";

/**
 * Pure timeline logic for RunHistory (no React).
 *
 * The badge reflects the review OUTCOME, not just the run lifecycle: a finished
 * run that found blockers reads "rejected" (red), never a green "done". The
 * outcome comes from the denormalized blocker/finding counts on the run row, so
 * it matches the CI gate (deterministic) rather than the model's verdict.
 */
export type Outcome = { key: string; color: string; bg: string; icon: IconName };

export function outcomeOf(run: Pick<RunSummary, "status" | "blockers" | "findings_count">): Outcome {
  const status = run.status ?? "";
  if (status === "running")
    return { key: "running", color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" };
  if (status === "failed")
    return { key: "error", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if (status === "cancelled")
    return { key: "cancelled", color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" };
  if ((run.blockers ?? 0) > 0)
    return { key: "rejected", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if ((run.findings_count ?? 0) > 0)
    return { key: "reviewed", color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" };
  return { key: "approved", color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" };
}

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
export function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

export type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/** Runs and commits interleaved, newest first. */
export function buildTimeline(runs: RunSummary[], commits: PrCommit[]): TimelineItem[] {
  return [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({ kind: "commit" as const, ts: tsOf(commit.committed_at), commit })),
  ].sort((a, b) => b.ts - a.ts);
}

/** Completed runs always show usage ("—" when unknown); failed/cancelled ones only if they used tokens. */
export function showsUsage(run: Pick<RunSummary, "status" | "tokens_in" | "tokens_out">): boolean {
  if (run.status === "done") return true;
  return run.status !== "running" && (run.tokens_in ?? 0) + (run.tokens_out ?? 0) > 0;
}
