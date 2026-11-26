import { describe, it, expect } from "vitest";
import type { PrMeta } from "@/lib/types";
import { filterPulls, pullCounts, sizeOf } from "./helpers";

const pr = (over: Partial<PrMeta>): PrMeta => ({
  number: 1,
  title: "t",
  author: "a",
  branch: "b",
  base: "main",
  head_sha: "h",
  additions: 0,
  deletions: 0,
  files_count: 0,
  status: "needs_review",
  ...over,
});

const PULLS = [
  pr({ number: 1, title: "Add rate limiting", status: "needs_review", updated_at: "2026-11-01T00:00:00Z" }),
  pr({ number: 2, title: "Fix login", status: "reviewed", updated_at: "2026-11-03T00:00:00Z" }),
  pr({ number: 3, title: "Bump deps", status: "merged", updated_at: "2026-11-02T00:00:00Z" }),
];

describe("filterPulls", () => {
  it("filters by status tab ('all' keeps everything), newest first", () => {
    expect(filterPulls(PULLS, { status: "all", query: "", sort: "newest" }).map((p) => p.number)).toEqual([2, 3, 1]);
    expect(filterPulls(PULLS, { status: "reviewed", query: "", sort: "newest" }).map((p) => p.number)).toEqual([2]);
  });

  it("matches the query against title and number, and sorts oldest first on request", () => {
    expect(filterPulls(PULLS, { status: "all", query: "LOGIN", sort: "newest" }).map((p) => p.number)).toEqual([2]);
    expect(filterPulls(PULLS, { status: "all", query: "3", sort: "newest" }).map((p) => p.number)).toEqual([3]);
    expect(filterPulls(PULLS, { status: "all", query: "", sort: "oldest" }).map((p) => p.number)).toEqual([1, 3, 2]);
  });
});

describe("pullCounts / sizeOf", () => {
  it("counts open (derived statuses only) and needs-review PRs", () => {
    expect(pullCounts(PULLS)).toEqual({ open: 2, needsReview: 1 });
  });

  it("buckets by changed lines", () => {
    expect(sizeOf(pr({ additions: 10, deletions: 5 })).size).toBe("S");
    expect(sizeOf(pr({ additions: 5000, deletions: 0 })).size).toBe("L");
  });
});
