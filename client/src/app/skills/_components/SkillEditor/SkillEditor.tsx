/* SkillEditor — header (name, type, version) + tabs Config / Preview / Stats /
   Versions for one skill. `skill` is null on /skills/new: only the Config form
   (create) is shown. The tab lives in the URL (?tab). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS, type SkillTab } from "./constants";
import { s } from "./styles";

export function SkillEditor({
  skill,
  tab,
  onTab,
}: {
  skill: Skill | null;
  tab: SkillTab;
  onTab: (t: SkillTab) => void;
}) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={s.icon} aria-hidden />
        <h1 className="mono" style={s.title}>
          {skill ? skill.name : t("editor.newTitle")}
        </h1>
        {skill && <SkillTypeBadge type={skill.type} />}
        {skill && (
          <Badge color="var(--text-secondary)" mono icon="GitCommit">
            {t("editor.version", { version: skill.version })}
          </Badge>
        )}
      </div>
      {skill && (
        <div style={s.tabsBar}>
          <Tabs tabs={tabs} value={tab} onChange={(k) => onTab(k as SkillTab)} pad="0 28px" />
        </div>
      )}
      <div style={s.body}>
        {(!skill || tab === "config") && <ConfigTab skill={skill} />}
        {skill && tab === "preview" && <PreviewTab skill={skill} />}
        {skill && tab === "stats" && <StatsTab skillId={skill.id} />}
        {skill && tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
