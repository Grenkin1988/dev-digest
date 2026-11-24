/* A settled run must refresh every view of the PR: runs, reviews, the detail
   (cached under BOTH the uuid key and the by-number key the detail screen reads),
   and the PR list counters. Missing one leaves the Overview cost stale. */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useInvalidateAfterRun } from "./reviews";

describe("useInvalidateAfterRun", () => {
  it("invalidates runs, reviews, both detail caches and the PR lists", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useInvalidateAfterRun("pr1"), { wrapper });

    result.current.all();

    const keys = spy.mock.calls.map(([arg]) => arg?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ["pr-active-runs", "pr1"],
        ["pr-runs", "pr1"],
        ["reviews", "pr1"],
        ["pull", "pr1"],
        ["pull-by-number"],
        ["pulls"],
      ]),
    );
  });

  it("does nothing without a PR id", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useInvalidateAfterRun(null), { wrapper });
    result.current.all();
    expect(spy).not.toHaveBeenCalled();
  });
});
