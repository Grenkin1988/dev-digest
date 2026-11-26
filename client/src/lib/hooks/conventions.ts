/* hooks/conventions.ts — React Query hooks for the Conventions page (saved
   candidates per repo, one-shot extraction, accept/reject/edit). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { conventionKeys } from "./keys";
import type { ConventionCandidate } from "@devdigest/shared";

export type ConventionStatus = "pending" | "accepted" | "rejected";

export interface ConventionView extends ConventionCandidate {
  status: ConventionStatus;
  category: string | null;
  start_line: number | null;
  end_line: number | null;
}

export interface ConventionList {
  conventions: ConventionView[];
  last_scan_at: string | null;
}

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionKeys.list(repoId),
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** One scan; the server replaces pending candidates and returns the fresh list. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionList>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => {
      qc.setQueryData(conventionKeys.list(repoId), data);
    },
  });
}

export interface UpdateConventionInput {
  id: string;
  patch: { status?: ConventionStatus; rule?: string };
}

/** Optimistic status/rule update; a failure rolls back (global error toast). */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  const key = conventionKeys.list(repoId);
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) => api.patch<ConventionView>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ConventionList>(key);
      if (prev) {
        qc.setQueryData<ConventionList>(key, {
          ...prev,
          conventions: prev.conventions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (row) => {
      qc.setQueryData<ConventionList>(key, (cur) =>
        cur ? { ...cur, conventions: cur.conventions.map((c) => (c.id === row.id ? row : c)) } : cur,
      );
    },
  });
}
