import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import type { ConventionView } from "@/lib/hooks/conventions";

const createMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { CreateConventionSkillModal } from "./CreateConventionSkillModal";

const conv = (id: string, path: string): ConventionView => ({
  id,
  rule: `rule ${id}`,
  evidence_path: path,
  evidence_snippet: "x",
  confidence: 0.8,
  accepted: true,
  status: "accepted",
  category: "naming",
  start_line: 1,
  end_line: 2,
});

function renderModal(onCreated = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>
        <CreateConventionSkillModal
          fullName="acme/web"
          conventions={[conv("a", "src/a.ts"), conv("b", "src/b.ts")]}
          onClose={vi.fn()}
          onCreated={onCreated}
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onCreated;
}

beforeEach(() => {
  createMutate.mockReset();
});
afterEach(cleanup);

describe("CreateConventionSkillModal", () => {
  it("posts a convention/extracted skill with the evidence files", () => {
    createMutate.mockImplementation((_in, opts) => opts.onSuccess({ id: "s1", name: "repo-conventions" }));
    const onCreated = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    const payload = createMutate.mock.calls[0]![0];
    expect(payload).toMatchObject({
      name: "repo-conventions",
      type: "convention",
      source: "extracted",
      enabled: false,
      evidence_files: ["src/a.ts", "src/b.ts"],
    });
    expect(payload.body).toContain("rule a");
    expect(onCreated).toHaveBeenCalledWith({ id: "s1", name: "repo-conventions" });
  });

  it("rebuilds the body when a rule is unchecked", () => {
    createMutate.mockImplementation(() => undefined);
    renderModal();
    fireEvent.click(screen.getByRole("checkbox", { name: /rule b/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    const payload = createMutate.mock.calls[0]![0];
    expect(payload.body).not.toContain("rule b");
    expect(payload.evidence_files).toEqual(["src/a.ts"]);
  });

  it("shows a 409 name clash inline under Name", () => {
    createMutate.mockImplementation((_in, opts) => opts.onError(new ApiError("dup", 409)));
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A skill with this name already exists.");
  });
});
