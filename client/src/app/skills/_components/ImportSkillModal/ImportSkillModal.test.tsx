import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { act, render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const previewMutate = vi.fn();
const createMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutate: previewMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

beforeEach(() => {
  previewMutate.mockReset();
  createMutate.mockReset();
});
afterEach(cleanup);

const PREVIEW = {
  name: "flaky-test-detector",
  description: "Flag tests that depend on time.",
  type: "custom" as const,
  body: "# Flaky tests\n\nLook for sleeps.",
  ignored_files: ["flaky/scripts/run.sh"],
  warnings: ["1 other file(s) in the archive were ignored."],
  name_conflict: false,
};

function renderModal(onSaved = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ImportSkillModal onClose={vi.fn()} onSaved={onSaved} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onSaved;
}

async function pickFile(name: string, content = "# x") {
  const file = new File([content], name);
  // jsdom's File has no arrayBuffer(); real browsers do.
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new TextEncoder().encode(content).buffer,
  });
  await act(async () => {
    fireEvent.change(screen.getByTestId("skill-file-input"), { target: { files: [file] } });
  });
}

describe("ImportSkillModal", () => {
  it("rejects a file of the wrong type without calling the server", async () => {
    renderModal();
    await pickFile("run.sh");
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload a .md or .zip file.");
    expect(previewMutate).not.toHaveBeenCalled();
  });

  it("previews first (trust warning, ignored files) and saves only on confirm", async () => {
    previewMutate.mockImplementation((_in, opts) => opts.onSuccess(PREVIEW));
    createMutate.mockImplementation((_in, opts) => opts.onSuccess({ id: "new1", name: "flaky-test-detector" }));
    const onSaved = renderModal();

    await pickFile("pack.zip");
    // Preview step: warning + ignored list are visible, and nothing was created yet.
    expect(await screen.findByText("Treat this like code you are about to run")).toBeInTheDocument();
    expect(screen.getByText("flaky/scripts/run.sh")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Save skill/ }));
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0]![0]).toMatchObject({
      name: "flaky-test-detector",
      source: "imported_url",
      body: PREVIEW.body,
    });
    expect(onSaved).toHaveBeenCalledWith({ id: "new1", name: "flaky-test-detector" });
  });

  it("blocks saving until a name and description are present", async () => {
    previewMutate.mockImplementation((_in, opts) => opts.onSuccess({ ...PREVIEW, description: "" }));
    renderModal();
    await pickFile("rule.md");
    const save = await screen.findByRole("button", { name: /Save skill/ });
    expect(save).toBeDisabled();
  });
});
