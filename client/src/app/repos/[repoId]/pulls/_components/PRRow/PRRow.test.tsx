import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
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
  usePrReviews: (prId: string | null | undefined, opts: { enabled?: boolean }) => usePrReviews(prId, opts),
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
  it("renders the server's severity counts without fetching any reviews", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: false });
    renderRow({ ...PR, severity_counts: { CRITICAL: 1, WARNING: 2, SUGGESTION: 1 } });
    expect(usePrReviews).toHaveBeenCalledWith("pr1", { enabled: false });
    expect(screen.getByLabelText("1 Critical finding")).toHaveTextContent("1");
    expect(screen.getByLabelText("2 Warning findings")).toHaveTextContent("2");
    expect(screen.getByLabelText("1 Suggestion finding")).toHaveTextContent("1");
  });

  it("hides empty levels on the list", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: false });
    renderRow({ ...PR, severity_counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 1 } });
    expect(screen.queryByLabelText(/Critical/)).toBeNull();
    expect(screen.getByLabelText("1 Suggestion finding")).toBeInTheDocument();
  });

  it("renders a dash when the PR has no reviews yet", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: false });
    renderRow({ ...PR, score: null, severity_counts: null });
    expect(screen.getByTestId("severity-counters")).toHaveTextContent(/^—$/);
  });

  it("fetches the findings lazily when a popover opens, then lists them", () => {
    usePrReviews.mockImplementation((_id: string, opts: { enabled: boolean }) =>
      opts.enabled
        ? {
            data: [
              review("sec-old", "sec", "2026-11-19T10:00:00Z", [finding("old", "CRITICAL")]),
              review("sec-new", "sec", "2026-11-20T10:00:00Z", [finding("Hardcoded secret", "CRITICAL")]),
            ],
            isLoading: false,
          }
        : { data: undefined, isLoading: false },
    );
    renderRow({ ...PR, severity_counts: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } });
    fireEvent.mouseEnter(screen.getByLabelText("1 Critical finding").parentElement!);
    expect(usePrReviews).toHaveBeenLastCalledWith("pr1", { enabled: true });
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getByText("Hardcoded secret")).toBeInTheDocument();
    expect(within(tip).queryByText("old")).toBeNull();
  });
});
