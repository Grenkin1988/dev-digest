"use client";

import type { RunSummary, PrCommit, FindingRecord } from "@devdigest/shared";
import { buildTimeline } from "./helpers";
import { CommitRow } from "./_components/CommitRow";
import { RunRow } from "./_components/RunRow";
import { s } from "./styles";

/**
 * PR timeline: every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; the logs icon opens the run's trace.
 */
export interface RunHistoryProps {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** Loaded findings keyed by run_id (from the PR's reviews) for severity counters. */
  findingsByRun?: Record<string, FindingRecord[]>;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}

export function RunHistory({
  runs,
  commits = [],
  onOpenTrace,
  onGoToReview,
  onDelete,
  findingsByRun,
}: RunHistoryProps) {
  if (runs.length === 0 && commits.length === 0) return null;
  return (
    <div style={s.list}>
      {buildTimeline(runs, commits).map((item) =>
        item.kind === "commit" ? (
          <CommitRow key={`commit:${item.commit.sha}`} commit={item.commit} />
        ) : (
          <RunRow
            key={`run:${item.run.run_id}`}
            run={item.run}
            findings={findingsByRun?.[item.run.run_id]}
            onOpenTrace={onOpenTrace}
            onGoToReview={onGoToReview}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
}
