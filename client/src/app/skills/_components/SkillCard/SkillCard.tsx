/* SkillCard — name + type + enabled toggle + delete, the description,
   "Source · vN", and the "N agents · X% pull freq · Y% accept" footer.
   Clicking the card opens the editor; the toggle and delete do not. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import type { SkillCardStats } from "@/lib/hooks/skills";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { s } from "./styles";

export function SkillCard({
  skill,
  stats,
  active,
  deleting,
  onClick,
  onToggle,
  onDelete,
}: {
  skill: Skill;
  stats?: SkillCardStats;
  active?: boolean;
  deleting?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("skills");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={s.card(!!active, skill.enabled)}
      title={skill.enabled ? undefined : t("card.disabledTitle")}
      data-testid="skill-card"
    >
      <div style={s.headerRow}>
        <span className="mono" style={s.name} title={skill.name}>
          {skill.name}
        </span>
        <SkillTypeBadge type={skill.type} />
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()} aria-label={t("card.toggleLabel", { name: skill.name })}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onKeyDown={(e) => e.stopPropagation()}
            disabled={deleting}
            title={t("card.deleteLabel", { name: skill.name })}
            aria-label={t("card.deleteLabel", { name: skill.name })}
            style={s.deleteBtn(!!deleting)}
          >
            <Icon.Trash size={14} aria-hidden />
          </button>
        )}
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.meta}>
        {t("card.sourceVersion", { source: t(`source.${skill.source}`), version: skill.version })}
      </div>
      <div style={s.footer}>
        <Badge color="var(--text-secondary)" icon="Cpu">
          {stats ? t("card.agents", { count: stats.agents }) : t("card.agentsUnknown")}
        </Badge>
        {stats?.pull_pct != null && <span>{t("card.pull", { pct: stats.pull_pct })}</span>}
        {stats?.accept_pct != null ? (
          <span style={s.accept(stats.accept_pct)}>{t("card.accept", { pct: stats.accept_pct })}</span>
        ) : (
          stats && stats.pull_pct == null && <span>{t("card.noData")}</span>
        )}
      </div>
    </div>
  );
}
