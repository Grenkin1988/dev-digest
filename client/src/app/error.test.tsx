import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import shell from "../../messages/en/shell.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import RouteError from "./error";

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("route error boundary", () => {
  it("shows a friendly message, retries via reset, and links home", () => {
    const reset = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        <RouteError error={new Error("boom: SQL detail")} reset={reset} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(shell.errors.title)).toBeInTheDocument();
    expect(screen.queryByText(/SQL detail/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(reset).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: shell.errors.home }));
    expect(push).toHaveBeenCalledWith("/");
  });
});
