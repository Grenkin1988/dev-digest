import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runCost from "../../../../../../../../messages/en/runCost.json";
import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

function renderOverview(pr: Parameters<typeof OverviewTab>[0]["pr"]) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runCost }}>
      <OverviewTab pr={pr} />
    </NextIntlClientProvider>,
  );
}

describe("OverviewTab — review cost", () => {
  it("shows the PR total and the latest round separately", () => {
    renderOverview({
      body: null,
      cost_usd: 0.05,
      tokens_in: 9000,
      tokens_out: 1500,
      latest_round_cost_usd: 0.02,
      latest_round_tokens_in: 3000,
      latest_round_tokens_out: 500,
    });
    const total = screen.getByTestId("overview-cost");
    expect(total).toHaveTextContent("Total review cost");
    expect(within(total).getByTestId("run-cost")).toHaveTextContent("$0.05");
    expect(within(total).getByTestId("run-cost")).toHaveTextContent("9K→1.5K");

    const latest = screen.getByTestId("overview-cost-latest-round");
    expect(latest).toHaveTextContent("Latest round");
    expect(within(latest).getByTestId("run-cost")).toHaveTextContent("$0.02");
    expect(within(latest).getByTestId("run-cost")).toHaveTextContent("3K→500");
  });

  it("renders dashes, never $0, before any run has usage data", () => {
    renderOverview({ body: null, cost_usd: null, tokens_in: null, tokens_out: null });
    for (const id of ["overview-cost", "overview-cost-latest-round"]) {
      expect(within(screen.getByTestId(id)).getByTestId("run-cost")).toHaveTextContent(/^—$/);
    }
  });
});
