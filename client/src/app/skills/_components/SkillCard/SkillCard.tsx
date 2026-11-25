/* SkillCard — name, enabled toggle, description, type + source, and the
   "N agents · X% pull · Y% accept" footer. Clicking opens the editor. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import type { SkillCardStats } from "@/lib/hooks/skills";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { SOURCE_ICONS } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  stats,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  stats?: SkillCardStats;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const SourceIcon = Icon[SOURCE_ICONS[skill.source]];
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
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()} aria-label={t("card.toggleLabel", { name: skill.name })}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <span style={s.source}>
          <SourceIcon size={12} aria-hidden />
          {t(`source.${skill.source}`)}
        </span>
      </div>
      {stats && (
        <div style={s.footer}>
          <span>{t("card.agents", { count: stats.agents })}</span>
          {stats.pull_pct != null && <span>{t("card.pull", { pct: stats.pull_pct })}</span>}
          {stats.accept_pct != null ? (
            <span style={s.accept(stats.accept_pct)}>{t("card.accept", { pct: stats.accept_pct })}</span>
          ) : (
            stats.pull_pct == null && <span>{t("card.noData")}</span>
          )}
        </div>
      )}
    </div>
  );
}
