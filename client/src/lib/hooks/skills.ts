/* hooks/skills.ts — React Query hooks for the Skills Lab (list, editor, versions,
   stats, import preview) and for an agent's ordered skill links. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { agentKeys, skillKeys } from "./keys";
import type { AgentSkillLink, Skill, SkillSource, SkillType } from "@devdigest/shared";

export interface SkillVersion {
  skill_id: string;
  version: number;
  body: string;
  description: string | null;
  message: string | null;
  created_at: string;
}

/** Card-footer numbers; null percentages mean "no data yet". */
export interface SkillCardStats {
  agents: number;
  pull_pct: number | null;
  accept_pct: number | null;
}

export interface SkillStats extends SkillCardStats {
  findings: number;
  used_by: { id: string; name: string }[];
  by_category: { category: string; count: number }[];
}

export interface ImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  ignored_files: string[];
  warnings: string[];
  name_conflict: boolean;
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: Extract<SkillSource, "manual" | "imported_url">;
  enabled?: boolean;
  message?: string;
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">> & { message?: string };
}

export function useSkills() {
  return useQuery({
    queryKey: skillKeys.all,
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.detail(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillsStats() {
  return useQuery({
    queryKey: skillKeys.statsAll,
    queryFn: () => api.get<Record<string, SkillCardStats>>("/skills/stats"),
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.stats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.setQueryData(skillKeys.detail(data.id), data);
    },
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
      qc.setQueryData(skillKeys.detail(data.id), data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.invalidateQueries({ queryKey: skillKeys.statsAll });
      qc.removeQueries({ queryKey: skillKeys.detail(id) });
      // Links to the deleted skill vanish server-side (cascade).
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
      qc.setQueryData(skillKeys.detail(data.id), data);
    },
  });
}

/** Parse an uploaded .md/.zip. Persists nothing — saving is a separate, confirmed step. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_base64: string }) =>
      api.post<ImportPreview>("/skills/import/preview", input),
  });
}

/** The agent's linked skills, in order. */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: agentKeys.skills(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Replace the agent's ordered set of linked skills (attach / detach / reorder). */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    // Optimistic: the list reorders instantly; a failure rolls back (global error toast).
    onMutate: async (skillIds) => {
      await qc.cancelQueries({ queryKey: agentKeys.skills(agentId) });
      const prev = qc.getQueryData<AgentSkillLink[]>(agentKeys.skills(agentId));
      qc.setQueryData<AgentSkillLink[]>(
        agentKeys.skills(agentId),
        skillIds.map((skill_id, order) => ({ agent_id: agentId, skill_id, order })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(agentKeys.skills(agentId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: agentKeys.skills(agentId) });
      qc.invalidateQueries({ queryKey: skillKeys.statsAll });
    },
  });
}
