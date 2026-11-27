/* hooks/intent.ts — React Query hooks for the PR Intent card (stored intent +
   explicit derive). The server derives automatically when a review starts; this
   hook pair only reads it and lets the user re-derive. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PrIntentResponse } from "@devdigest/shared";
import { api } from "../api";
import { intentKeys } from "./keys";

/** Stored intent of a PR, its current head SHA and staleness (no LLM call). */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: intentKeys.forPr(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Derive (or re-derive) the intent now; the response replaces the cached one. Errors reach the global error toast. */
export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent/derive`),
    onSuccess: (data) => {
      qc.setQueryData(intentKeys.forPr(prId), data);
    },
  });
}
