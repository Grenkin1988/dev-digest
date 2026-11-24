"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { withParam } from "./helpers";

/** The PR detail screen's URL state: `?tab` (default "overview") and `?trace` (open run trace). */
export function usePrDetailParams(repoId: string, number: string) {
  const search = useSearchParams();
  const router = useRouter();
  const setParam = (key: string, value: string | null) =>
    router.replace(withParam(`/repos/${repoId}/pulls/${number}`, search.toString(), key, value));

  return {
    tab: search.get("tab") ?? "overview",
    traceRunId: search.get("trace"),
    setTab: (tab: string) => setParam("tab", tab),
    setTrace: (runId: string | null) => setParam("trace", runId),
  };
}
