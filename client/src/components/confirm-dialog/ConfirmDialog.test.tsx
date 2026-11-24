import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { useConfirm } from "./ConfirmDialog";

afterEach(cleanup);

function Harness({ onResult }: { onResult: (ok: boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={async () => onResult(await confirm({ title: "Delete it?", body: "Gone for good." }))}
      >
        open
      </button>
      {dialog}
    </>
  );
}

function renderHarness() {
  const results: boolean[] = [];
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <Harness onResult={(ok) => results.push(ok)} />
    </NextIntlClientProvider>,
  );
  return results;
}

describe("useConfirm / ConfirmDialog", () => {
  it("resolves true on the confirm button and closes", async () => {
    const results = renderHarness();
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete it?");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete" })));
    expect(results).toEqual([true]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("focuses Cancel first and resolves false on Escape", async () => {
    const results = renderHarness();
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await act(async () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }));
    expect(results).toEqual([false]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
