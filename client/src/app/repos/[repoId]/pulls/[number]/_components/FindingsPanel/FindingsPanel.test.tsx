import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function finding(over: Partial<FindingRecord> & Pick<FindingRecord, "id" | "severity" | "title">): FindingRecord {
  return {
    category: "security",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "Rationale.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

const CRIT = finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret" });
const WARN_HIGH = finding({ id: "f2", severity: "WARNING", title: "Missing rate limit", confidence: 0.9 });
const WARN_LOW = finding({ id: "f3", severity: "WARNING", title: "Maybe leaky errors", confidence: 0.4 });

const FINDINGS: FindingRecord[] = [CRIT, WARN_HIGH, WARN_LOW];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const counter = (level: RegExp) => screen.getByRole("button", { name: level });
const titlesShown = () =>
  ["Hardcoded secret", "Missing rate limit", "Maybe leaky errors"].filter((t) => screen.queryByText(t));

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={[CRIT]} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity counters + filter", () => {
  it("shows a counter for every level, 0 included", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(counter(/Critical/)).toHaveTextContent("1");
    expect(counter(/Warning/)).toHaveTextContent("2");
    expect(counter(/Suggestion/)).toHaveTextContent("0");
  });

  it("filters by the clicked level and clears on a second click", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(counter(/Critical/));
    expect(titlesShown()).toEqual(["Hardcoded secret"]);
    expect(counter(/Critical/)).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(counter(/Critical/));
    expect(titlesShown()).toHaveLength(3);
    expect(counter(/Critical/)).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to another level instead of stacking filters", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(counter(/Critical/));
    fireEvent.click(counter(/Warning/));
    expect(titlesShown()).toEqual(["Missing rate limit", "Maybe leaky errors"]);
    expect(counter(/Critical/)).toHaveAttribute("aria-pressed", "false");
    expect(counter(/Warning/)).toHaveAttribute("aria-pressed", "true");
  });

  it("combines with Hide low confidence", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(counter(/Warning/));
    fireEvent.click(screen.getByRole("switch"));
    expect(titlesShown()).toEqual(["Missing rate limit"]);
    // Counters always reflect the run's findings, not the filtered list.
    expect(counter(/Warning/)).toHaveTextContent("2");
  });

  it("shows the empty state when the filter leaves nothing", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(counter(/Suggestion/));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("never hits the network when a counter is clicked", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(counter(/Critical/));
    fireEvent.click(counter(/Critical/));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("updates counters when a finding is dismissed (new findings from the cache)", () => {
    const { rerender } = renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(counter(/Critical/)).toHaveTextContent("1");
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel
          findings={[{ ...CRIT, dismissed_at: "2026-11-21T10:00:00Z" }, WARN_HIGH, WARN_LOW]}
          prId="pr1"
        />
      </NextIntlClientProvider>,
    );
    expect(counter(/Critical/)).toHaveTextContent("0");
  });
});
