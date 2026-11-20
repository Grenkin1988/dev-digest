import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/runCost.json";
import { RunCostBadge, type RunCostBadgeProps } from "./RunCostBadge";

afterEach(cleanup);

function renderBadge(props: RunCostBadgeProps) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runCost: messages }}>
      <RunCostBadge {...props} />
    </NextIntlClientProvider>,
  );
  return screen.getByTestId("run-cost");
}

describe("RunCostBadge", () => {
  it("compact: just the cost", () => {
    expect(renderBadge({ variant: "compact", costUsd: 0.014 })).toHaveTextContent(/^\$0\.014$/);
  });

  it("detailed: cost plus in→out tokens", () => {
    const el = renderBadge({ variant: "detailed", costUsd: 0.014, tokensIn: 8200, tokensOut: 1300 });
    expect(el).toHaveTextContent("$0.014");
    expect(el).toHaveTextContent("8.2K→1.3K");
  });

  it("no data renders a dash in every variant, never $0.00", () => {
    for (const variant of ["compact", "inline", "detailed"] as const) {
      const el = renderBadge({ variant, costUsd: null, tokensIn: 0, tokensOut: 0 });
      expect(el).toHaveTextContent(/^—$/);
      cleanup();
    }
  });

  it("tokens without a known price still show tokens, with a dash for cost", () => {
    const el = renderBadge({ variant: "inline", costUsd: null, tokensIn: 100, tokensOut: 20 });
    expect(el).toHaveTextContent("120 tok · —");
  });
});
