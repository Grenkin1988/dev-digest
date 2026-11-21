import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { visibleFindings } from "./helpers";

function finding(id: string, severity: FindingRecord["severity"], confidence: number): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const ALL = [
  finding("sugg", "SUGGESTION", 0.9),
  finding("warn-low", "WARNING", 0.3),
  finding("crit", "CRITICAL", 0.9),
  finding("warn-high", "WARNING", 0.9),
];

const ids = (fs: FindingRecord[]) => fs.map((f) => f.id);

describe("visibleFindings", () => {
  it("sorts by severity with no filters", () => {
    expect(ids(visibleFindings(ALL, false))).toEqual(["crit", "warn-low", "warn-high", "sugg"]);
  });

  it("filters by severity", () => {
    expect(ids(visibleFindings(ALL, false, "WARNING"))).toEqual(["warn-low", "warn-high"]);
  });

  it("applies severity and low-confidence filters together", () => {
    expect(ids(visibleFindings(ALL, true, "WARNING"))).toEqual(["warn-high"]);
    expect(ids(visibleFindings(ALL, true, null))).toEqual(["crit", "warn-high", "sugg"]);
  });
});
