/* hooks/core.ts — typed React Query hooks over the F1 API (contracts):
   settings, secrets, repos, pulls, and project context. Scaffolding screens use
   these; feature-domain hooks live in the sibling files (agents/reviews/trace/…)
   and are re-exported alongside these from hooks/index.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { agentKeys, pullKeys, repoKeys, settingsKeys } from "./keys";
import type {
  Settings,
  SettingsUpdate,
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  Repo,
  PrMeta,
  PrDetail,
  SpecFile,
  IndexStatus,
} from "../types";

// ---- Settings (F1: GET/PUT /settings, POST /settings/test-connection) ----
export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => api.get<Settings>("/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsUpdate) => api.put<Settings>("/settings", patch),
    onSuccess: (data) => qc.setQueryData(settingsKeys.all, data),
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnTestProvider | { provider: ConnTestProvider; key?: string }) => {
      const body = typeof input === "string" ? { provider: input } : input;
      return api.post<ConnTestResult>("/settings/test-connection", body);
    },
    // Saving/validating a provider key can change which models resolve — drop the
    // cached (possibly empty) model lists so the agent picker refetches, and
    // refresh the "Configured / Not set" key-status badges.
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: agentKeys.providerModelsAll });
        qc.invalidateQueries({ queryKey: settingsKeys.secretsStatus });
      }
    },
  });
}

/** Which provider keys are configured (booleans only — never the values). */
export function useSecretsStatus() {
  return useQuery({
    queryKey: settingsKeys.secretsStatus,
    queryFn: () => api.get<SecretsStatus>("/settings/secrets-status"),
    staleTime: 30_000,
  });
}

// ---- Repos (F1: GET/POST /repos, refresh, delete) ----
export function useRepos() {
  return useQuery({
    queryKey: repoKeys.all,
    queryFn: () => api.get<Repo[]>("/repos"),
  });
}

export function useAddRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.post<Repo>("/repos", { url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: repoKeys.all }),
  });
}

export function useRefreshRepo() {
  const qc = useQueryClient();
  return useMutation({
    // Re-fetch the clone AND force a PR-list sync: the list GET only re-syncs
    // from GitHub once per PULL_SYNC_MIN_INTERVAL_MS, so an explicit Refresh
    // must ask for it. The poll is best-effort (it fails without a GitHub token).
    mutationFn: async (repoId: string) => {
      const repo = await api.post<Repo>(`/repos/${repoId}/refresh`);
      await api.post(`/repos/${repoId}/poll`).catch(() => undefined);
      return repo;
    },
    onSuccess: (_d, repoId) => {
      qc.invalidateQueries({ queryKey: repoKeys.all });
      qc.invalidateQueries({ queryKey: pullKeys.list(repoId) });
    },
  });
}

export function useDeleteRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.del<{ deleted: string }>(`/repos/${repoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: repoKeys.all }),
  });
}

// ---- Pull requests (F1: GET /repos/:id/pulls, GET /pulls/:id) ----
export function usePulls(repoId: string | null | undefined) {
  return useQuery({
    queryKey: pullKeys.list(repoId),
    queryFn: () => api.get<PrMeta[]>(`/repos/${repoId}/pulls`),
    enabled: !!repoId,
    // Refresh statuses + severity counters every 60s and on focus. Cheap: the
    // server re-syncs from GitHub at most once per PULL_SYNC_MIN_INTERVAL_MS
    // per repo; other polls are pure Postgres reads.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function usePullDetail(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: pullKeys.detail(prId),
    queryFn: () => api.get<PrDetail>(`/pulls/${prId}`),
    enabled: prId != null,
  });
}

/**
 * PR detail addressed by the route's GitHub number — one request, instead of
 * loading the whole PR list to map number → uuid first. The result is also
 * seeded into the uuid-keyed `pullKeys.detail` cache. Run/cost invalidation
 * (`useInvalidateAfterRun`) refreshes both keys.
 */
export function usePullByNumber(repoId: string | null | undefined, number: number | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: pullKeys.byNumber(repoId, number),
    queryFn: async () => {
      const pr = await api.get<PrDetail>(`/repos/${repoId}/pulls/by-number/${number}`);
      if (pr.id) qc.setQueryData(pullKeys.detail(pr.id), pr);
      return pr;
    },
    enabled: !!repoId && number != null && Number.isInteger(number),
  });
}

// ---- Project Context (A3 contract; safe to call once API exposes it) ----
export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: repoKeys.context(repoId),
    queryFn: () => api.get<SpecFile[]>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useReindexContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<IndexStatus>(`/repos/${repoId}/context/reindex`),
    onSuccess: (_d, repoId) => qc.invalidateQueries({ queryKey: repoKeys.context(repoId) }),
  });
}
