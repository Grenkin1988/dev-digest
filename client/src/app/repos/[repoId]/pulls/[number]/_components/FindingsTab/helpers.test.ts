import { describe, it, expect } from "vitest";
import type { ReviewRecord } from "@devdigest/shared";
import { findingsByRunId, lethalTrifectaFindings } from "./helpers";

const reviews = [
  { run_id: "r1", findings: [{ id: "a", kind: "finding" }, { id: "b", kind: "lethal_trifecta" }] },
  { run_id: null, findings: [{ id: "c", kind: "lethal_trifecta" }] },
] as unknown as ReviewRecord[];

describe("FindingsTab helpers", () => {
  it("keys findings by run id, skipping runs without one", () => {
    expect(Object.keys(findingsByRunId(reviews))).toEqual(["r1"]);
  });

  it("collects lethal-trifecta findings across every review", () => {
    expect(lethalTrifectaFindings(reviews).map((x) => x.id)).toEqual(["b", "c"]);
  });
});
