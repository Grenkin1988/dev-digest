import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/conventions.json";
import type { ConventionView } from "@/lib/hooks/conventions";

const mutate = vi.fn();
vi.mock("@/lib/hooks/conventions", () => ({
  useUpdateConvention: () => ({ mutate, isPending: false }),
}));

import { ConventionCard } from "./ConventionCard";

const BASE: ConventionView = {
  id: "c1",
  rule: "Use named exports",
  evidence_path: "client/src/x.tsx",
  evidence_snippet: "export function X() {}",
  confidence: 0.5,
  accepted: false,
  status: "pending",
  category: "ui components",
  start_line: 33,
  end_line: 36,
};

function renderCard(c: Partial<ConventionView> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard repoId="r1" convention={{ ...BASE, ...c }} fullName="acme/web" branch="main" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockReset();
});
afterEach(cleanup);

describe("ConventionCard", () => {
  it("links the evidence to the GitHub blob at the line range", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /client\/src\/x\.tsx:L33-L36/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/web/blob/main/client/src/x.tsx#L33-L36");
    expect(screen.getByText("export function X() {}")).toBeInTheDocument();
  });

  it("accepts and rejects through the mutation", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mutate).toHaveBeenLastCalledWith({ id: "c1", patch: { status: "accepted" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(mutate).toHaveBeenLastCalledWith({ id: "c1", patch: { status: "rejected" } });
  });

  it("clicking the active status sets it back to pending", () => {
    renderCard({ status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mutate).toHaveBeenLastCalledWith({ id: "c1", patch: { status: "pending" } });
  });

  it("edits the rule inline and saves via PATCH", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Use default exports  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { rule: "Use default exports" } });
  });
});
