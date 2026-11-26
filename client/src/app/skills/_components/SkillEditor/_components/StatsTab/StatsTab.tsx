/* Stats tab: used-by / pull frequency / accept rate / findings (30d), the agents
   that use the skill, and findings by category. The numbers are a proxy via the
   agents linked today (see the basis note) — runs don't record their skills. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, CircularScore, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { CategoryDonut } from "../CategoryDonut";
import { s } from "./styles";

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) return <Skeleton height={140} />;
  if (isError || !data) return <ErrorState body={t("editor.loadError")} onRetry={() => refetch()} />;

  const pct = (v: number | null) => (v == null ? t("stats.noData") : `${v}%`);
  return (
    <div>
      <div style={s.tiles}>
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("stats.usedBy")}</div>
          <div style={s.tileValue}>
            {data.agents} <span style={s.unit}>{t("stats.agentsUnit", { count: data.agents })}</span>
          </div>
        </div>
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("stats.pullFrequency")}</div>
          <div style={s.tileValue}>{pct(data.pull_pct)}</div>
        </div>
        <div style={s.tile}>
          <div style={s.tileLabel}>
            {t("stats.acceptRate")}
            {data.accept_pct != null && (
              <span style={s.ring}>
                <CircularScore score={data.accept_pct} size={32} stroke={3} />
              </span>
            )}
          </div>
          <div style={s.tileValue}>{pct(data.accept_pct)}</div>
        </div>
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("stats.findings")}</div>
          <div style={s.tileValue}>{data.findings}</div>
        </div>
      </div>

      <div style={s.panels}>
        <section style={s.panel}>
          <h3 style={s.panelTitle}>
            <Icon.Cpu size={13} aria-hidden /> {t("stats.agentsUsing")}
          </h3>
          {data.used_by.length === 0 && <p style={s.empty}>{t("stats.noAgents")}</p>}
          {data.used_by.map((a) => (
            <div key={a.id} style={s.agentRow}>
              <Icon.Cpu size={14} style={s.agentIcon} aria-hidden />
              <span style={s.agentName}>{a.name}</span>
              <Button kind="ghost" size="sm" onClick={() => router.push(`/agents/${a.id}?tab=skills`)}>
                {t("stats.open")}
              </Button>
            </div>
          ))}
        </section>
        <section style={s.panel}>
          <h3 style={s.panelTitle}>
            <Icon.Tag size={13} aria-hidden /> {t("stats.byCategory")}
          </h3>
          {data.by_category.length === 0 ? (
            <p style={s.empty}>{t("stats.noFindings")}</p>
          ) : (
            <CategoryDonut items={data.by_category} label={t("stats.byCategory")} />
          )}
        </section>
      </div>
      <p style={s.basis}>{t("stats.basis")}</p>
    </div>
  );
}
