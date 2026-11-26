import { describe, it, expect } from "vitest";
import type { PrCommit, RunSummary } from "@devdigest/shared";
import { buildTimeline, outcomeOf, showsUsage, tsOf } from "./helpers";

const run = (over: Partial<RunSummary>): RunSummary => ({ run_id: "r", status: "done", ...over }) as RunSummary;

describe("RunHistory helpers", () => {
  it("derives the outcome from blockers / findings, not the lifecycle alone", () => {
    expect(outcomeOf(run({ blockers: 1, findings_count: 3 })).key).toBe("rejected");
    expect(outcomeOf(run({ blockers: 0, findings_count: 2 })).key).toBe("reviewed");
    expect(outcomeOf(run({ blockers: 0, findings_count: 0 })).key).toBe("approved");
    expect(outcomeOf(run({ status: "failed" })).key).toBe("error");
    expect(outcomeOf(run({ status: "running" })).key).toBe("running");
  });

  it("interleaves runs and commits newest first; bad timestamps sort last", () => {
    const items = buildTimeline(
      [run({ run_id: "r1", ran_at: "2026-11-02T00:00:00Z" }), run({ run_id: "r2", ran_at: "garbage" })],
      [{ sha: "c1", message: "m", author: "a", committed_at: "2026-11-03T00:00:00Z" } as PrCommit],
    );
    expect(items.map((i) => (i.kind === "run" ? i.run.run_id : i.commit.sha))).toEqual(["c1", "r1", "r2"]);
    expect(tsOf(null)).toBe(0);
  });

  it("shows usage for done runs, and for failed ones only when tokens were spent", () => {
    expect(showsUsage(run({ status: "done" }))).toBe(true);
    expect(showsUsage(run({ status: "failed", tokens_in: 0, tokens_out: 0 }))).toBe(false);
    expect(showsUsage(run({ status: "failed", tokens_in: 10 }))).toBe(true);
    expect(showsUsage(run({ status: "running", tokens_in: 10 }))).toBe(false);
  });
});
