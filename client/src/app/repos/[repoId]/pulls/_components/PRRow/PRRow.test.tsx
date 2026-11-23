import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { PrMeta } from "@/lib/types";
import prReview from "../../../../../../../messages/en/prReview.json";
import runCost from "../../../../../../../messages/en/runCost.json";

const usePrReviews = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null | undefined) => usePrReviews(prId),
}));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  usePrReviews.mockReset();
});

const PR: PrMeta = {
  id: "pr1",
  number: 482,
  title: "Add rate limiting",
  author: "marisa",
  branch: "feat/x",
  base: "main",
  head_sha: "abc",
  additions: 10,
  deletions: 2,
  files_count: 1,
  status: "needs_review",
  score: 61,
  cost_usd: 0.014,
};

function finding(id: string, severity: FindingRecord["severity"], dismissed = false): FindingRecord {
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
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r",
    accepted_at: null,
    dismissed_at: dismissed ? "2026-11-21T10:00:00Z" : null,
  };
}

function review(id: string, agentId: string, createdAt: string, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
    agent_id: agentId,
    run_id: null,
    agent_name: agentId,
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 60,
    model: null,
    grounding: null,
    created_at: createdAt,
    findings,
  };
}

function renderRow(pr: PrMeta = PR) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview, runCost }}>
      <PRRow pr={pr} repoId="repo1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow findings column", () => {
  it("sums the latest review per agent and skips dismissed findings", () => {
    usePrReviews.mockReturnValue({
      data: [
        // Older security run is superseded by the newer one → not counted.
        review("sec-old", "sec", "2026-11-19T10:00:00Z", [finding("o1", "CRITICAL"), finding("o2", "CRITICAL")]),
        review("sec-new", "sec", "2026-11-20T10:00:00Z", [
          finding("c1", "CRITICAL"),
          finding("c2", "CRITICAL", true),
          finding("w1", "WARNING"),
        ]),
        review("perf", "perf", "2026-11-20T09:00:00Z", [finding("w2", "WARNING"), finding("s1", "SUGGESTION")]),
      ],
    });
    renderRow();
    expect(usePrReviews).toHaveBeenCalledWith("pr1");
    expect(screen.getByLabelText("1 Critical finding")).toHaveTextContent("1");
    expect(screen.getByLabelText("2 Warning findings")).toHaveTextContent("2");
    expect(screen.getByLabelText("1 Suggestion finding")).toHaveTextContent("1");
  });

  it("hides empty levels on the list", () => {
    usePrReviews.mockReturnValue({ data: [review("r", "a", "2026-11-20T10:00:00Z", [finding("s", "SUGGESTION")])] });
    renderRow();
    expect(screen.queryByLabelText(/Critical/)).toBeNull();
    expect(screen.getByLabelText("1 Suggestion finding")).toBeInTheDocument();
  });

  it("renders a dash when the PR has no reviews yet", () => {
    usePrReviews.mockReturnValue({ data: undefined });
    renderRow({ ...PR, score: null });
    expect(screen.getByTestId("severity-counters")).toHaveTextContent(/^—$/);
  });
});
