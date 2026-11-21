import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { countBySeverity, latestReviewPerAgent, topFindings } from "./helpers";

function finding(over: Partial<FindingRecord> & Pick<FindingRecord, "id" | "severity">): FindingRecord {
  return {
    category: "bug",
    title: `Finding ${over.id}`,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function review(over: Partial<ReviewRecord> & Pick<ReviewRecord, "id">): ReviewRecord {
  return {
    pr_id: "pr1",
    agent_id: "a1",
    run_id: null,
    agent_name: "Agent",
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 80,
    model: null,
    grounding: null,
    created_at: "2026-11-20T10:00:00Z",
    findings: [],
    ...over,
  };
}

describe("countBySeverity", () => {
  it("returns 0 for levels without findings", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(countBySeverity([finding({ id: "1", severity: "WARNING" })])).toEqual({
      CRITICAL: 0,
      WARNING: 1,
      SUGGESTION: 0,
    });
  });

  it("skips dismissed findings but keeps accepted ones", () => {
    const counts = countBySeverity([
      finding({ id: "1", severity: "CRITICAL" }),
      finding({ id: "2", severity: "CRITICAL", dismissed_at: "2026-11-20T10:00:00Z" }),
      finding({ id: "3", severity: "CRITICAL", accepted_at: "2026-11-20T10:00:00Z" }),
    ]);
    expect(counts).toEqual({ CRITICAL: 2, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("topFindings", () => {
  it("orders by confidence, caps at the limit and reports the overflow", () => {
    const fs = [
      finding({ id: "low", severity: "WARNING", confidence: 0.5 }),
      finding({ id: "high", severity: "WARNING", confidence: 0.95 }),
      finding({ id: "mid", severity: "WARNING", confidence: 0.7 }),
      finding({ id: "gone", severity: "WARNING", confidence: 0.99, dismissed_at: "x" }),
      finding({ id: "other", severity: "CRITICAL" }),
    ];
    const { top, more } = topFindings(fs, "WARNING", 2);
    expect(top.map((f) => f.id)).toEqual(["high", "mid"]);
    expect(more).toBe(1);
  });
});

describe("latestReviewPerAgent", () => {
  it("keeps the newest review per agent and skips summaries", () => {
    const out = latestReviewPerAgent([
      review({ id: "old", agent_id: "sec", created_at: "2026-11-19T10:00:00Z" }),
      review({ id: "new", agent_id: "sec", created_at: "2026-11-20T10:00:00Z" }),
      review({ id: "perf", agent_id: "perf" }),
      review({ id: "sum", agent_id: "sum", kind: "summary" }),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(["new", "perf"]);
  });

  it("falls back to agent_name when agent_id is null", () => {
    const out = latestReviewPerAgent([
      review({ id: "a", agent_id: null, agent_name: "X", created_at: "2026-11-19T10:00:00Z" }),
      review({ id: "b", agent_id: null, agent_name: "X", created_at: "2026-11-21T10:00:00Z" }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });
});
