import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const updateMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import { ConfigTab } from "./ConfigTab";

const SKILL: Skill = {
  id: "s1",
  name: "branch-coverage-gate",
  description: "Flag every new branch that has no test.",
  type: "rubric",
  source: "manual",
  body: "# Branch coverage gate",
  enabled: true,
  version: 3,
};

beforeEach(() => updateMutate.mockReset());
afterEach(cleanup);

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ConfigTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("skill ConfigTab type select", () => {
  it("opens the styled list, picks a type and saves only that change", () => {
    renderTab();
    // Nothing to save until something changes.
    expect(screen.getByRole("button", { name: /Save skill/ })).toBeDisabled();

    fireEvent.click(screen.getByText("rubric"));
    expect(screen.getByPlaceholderText("Search types…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "security" }));

    fireEvent.click(screen.getByRole("button", { name: /Save skill/ }));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0]![0]).toEqual({ id: "s1", patch: { type: "security" } });
  });

  it("filters the type list by what you type", () => {
    renderTab();
    fireEvent.click(screen.getByText("rubric"));
    fireEvent.change(screen.getByPlaceholderText("Search types…"), { target: { value: "conv" } });
    expect(screen.getByRole("button", { name: "convention" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "security" })).not.toBeInTheDocument();
  });
});
