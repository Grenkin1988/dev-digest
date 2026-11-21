import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { SeverityCounters, type SeverityCountersProps } from "./SeverityCounters";

afterEach(cleanup);

function finding(over: Partial<FindingRecord> & Pick<FindingRecord, "id" | "severity">): FindingRecord {
  return {
    category: "bug",
    title: `Finding ${over.id}`,
    file: "src/a.ts",
    start_line: 4,
    end_line: 4,
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

const FINDINGS = [
  finding({ id: "c1", severity: "CRITICAL", title: "Hardcoded secret", file: "src/config.ts", start_line: 12, end_line: 12 }),
  finding({ id: "w1", severity: "WARNING" }),
  finding({ id: "w2", severity: "WARNING" }),
];

function renderCounters(props: SeverityCountersProps) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityCounters {...props} />
    </NextIntlClientProvider>,
  );
}

const counter = (label: RegExp) => screen.getByLabelText(label);

describe("SeverityCounters", () => {
  it("shows every level with 0 when showZero is set", () => {
    renderCounters({ findings: FINDINGS, showZero: true });
    expect(counter(/^1 Critical finding$/)).toHaveTextContent("1");
    expect(counter(/^2 Warning findings$/)).toHaveTextContent("2");
    expect(counter(/^0 Suggestion findings$/)).toHaveTextContent("0");
  });

  it("hides empty levels by default and renders a dash when nothing counts", () => {
    renderCounters({ findings: FINDINGS });
    expect(screen.queryByLabelText(/Suggestion/)).toBeNull();
    cleanup();
    renderCounters({ findings: [finding({ id: "x", severity: "CRITICAL", dismissed_at: "x" })] });
    expect(screen.getByTestId("severity-counters")).toHaveTextContent(/^—$/);
  });

  it("reveals the top findings on hover", () => {
    renderCounters({ findings: FINDINGS, showZero: true });
    fireEvent.mouseEnter(counter(/Critical/).parentElement!);
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getByText("1 Critical finding")).toBeInTheDocument();
    expect(within(tip).getByText("Hardcoded secret")).toBeInTheDocument();
    expect(within(tip).getByText("src/config.ts:12")).toBeInTheDocument();
    fireEvent.mouseLeave(counter(/Critical/).parentElement!);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("says a zero level has no findings on hover", () => {
    renderCounters({ findings: FINDINGS, showZero: true });
    fireEvent.mouseEnter(counter(/Suggestion/).parentElement!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("No suggestion findings");
  });

  it("is a toggle button when onSelect is given, marking the active level", () => {
    const onSelect = vi.fn();
    renderCounters({ findings: FINDINGS, showZero: true, active: "WARNING", onSelect });
    expect(counter(/Warning/)).toHaveAttribute("aria-pressed", "true");
    expect(counter(/Critical/)).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(counter(/Critical/));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("is not interactive without onSelect", () => {
    renderCounters({ findings: FINDINGS });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
