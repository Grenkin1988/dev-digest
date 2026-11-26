import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";

const extractMutate = vi.fn();
const state = {
  list: { data: { conventions: [] as unknown[], last_scan_at: null as string | null }, isLoading: false, isError: false },
  extract: { isPending: false, isError: false, error: null as Error | null },
};

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/web", default_branch: "main" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ ...state.list, error: null, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: extractMutate, ...state.extract }),
  useUpdateConvention: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/skills", () => ({ useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }) }));

import { ConventionsView } from "./ConventionsView";

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>
        <ConventionsView repoId="r1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  extractMutate.mockReset();
  state.list = { data: { conventions: [], last_scan_at: null }, isLoading: false, isError: false };
  state.extract = { isPending: false, isError: false, error: null };
});
afterEach(cleanup);

describe("ConventionsView", () => {
  it("shows the empty state and runs extraction from the CTA", () => {
    renderView();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run extraction" }));
    expect(extractMutate).toHaveBeenCalledTimes(1);
  });

  it("shows the extraction error banner with the server message", () => {
    state.extract = { isPending: false, isError: true, error: new Error("LLM unavailable") };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("Extraction failed");
    expect(screen.getByRole("alert")).toHaveTextContent("LLM unavailable");
  });

  it("lists candidates, counts accepted, and gates Create skill", () => {
    const c = (id: string, status: string) => ({
      id,
      rule: `rule ${id}`,
      evidence_path: "a.ts",
      evidence_snippet: "x",
      confidence: 0.5,
      accepted: status === "accepted",
      status,
      category: null,
      start_line: 1,
      end_line: 1,
    });
    state.list = { data: { conventions: [c("1", "accepted"), c("2", "pending")], last_scan_at: null }, isLoading: false, isError: false };
    renderView();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();
  });
});
