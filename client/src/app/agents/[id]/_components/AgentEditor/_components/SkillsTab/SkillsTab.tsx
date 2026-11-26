/* Skills tab of the agent editor: every workspace skill with a checkbox
   (checked = linked to this agent), the linked ones on top in prompt order.
   Drag (or the arrow buttons) to reorder; every change is saved at once through
   POST /agents/:id/skills. A skill switched off on the Skills page stays linked
   but is not added to the prompt — it is marked "disabled" here. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, ErrorState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { filterRows, moveItem, orderRows, toggleLink } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills(agent.id);
  const [search, setSearch] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  if (isLoading || links === undefined) return <Skeleton height={160} />;
  if (isError || !skills) return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;
  if (skills.length === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("skills.empty")}
        cta={t("skills.emptyCta")}
        onCta={() => router.push("/skills")}
      />
    );
  }

  const linkedIds = [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
  const rows = orderRows(skills, linkedIds);
  const linkedCount = rows.filter((r) => r.linked).length;
  const shown = filterRows(rows, search);
  // Reordering while filtered would be ambiguous (hidden rows), so it is off.
  const canReorder = search.trim() === "";

  const save = (ids: string[]) => setSkills.mutate(ids);
  const move = (id: string, delta: number) => {
    const from = linkedIds.indexOf(id);
    save(moveItem(linkedIds, from, from + delta));
  };
  const drop = (targetId: string) => {
    if (dragId && dragId !== targetId) {
      save(moveItem(linkedIds, linkedIds.indexOf(dragId), linkedIds.indexOf(targetId)));
    }
    setDragId(null);
    setOverId(null);
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: linkedCount, total: rows.length })}
        </Badge>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {shown.length === 0 && <div style={s.note}>{t("skills.noMatch")}</div>}
      {shown.map(({ skill, linked }) => {
        const idx = linkedIds.indexOf(skill.id);
        const draggable = linked && canReorder;
        return (
          <div
            key={skill.id}
            data-testid="agent-skill-row"
            draggable={draggable}
            onDragStart={() => draggable && setDragId(skill.id)}
            onDragOver={(e) => {
              if (draggable && dragId) {
                e.preventDefault();
                setOverId(skill.id);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggable) drop(skill.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            style={s.row(linked, dragId === skill.id, overId === skill.id && dragId !== skill.id)}
          >
            <span style={s.grip(draggable)} title={t("skills.dragHandle", { name: skill.name })}>
              <Icon.Menu size={15} aria-hidden />
            </span>
            <Checkbox
              checked={linked}
              onChange={() => save(toggleLink(linkedIds, skill.id))}
              label={
                <span className="mono" style={s.name}>
                  {skill.name}
                </span>
              }
            />
            {!skill.enabled && (
              <span title={t("skills.disabledTitle")}>
                <Badge color="var(--text-muted)">{t("skills.disabledGlobally")}</Badge>
              </span>
            )}
            <span style={s.spacer} />
            {draggable && (
              <span style={s.moves}>
                <IconBtn
                  icon="ArrowUp"
                  size={26}
                  label={t("skills.moveUp", { name: skill.name })}
                  onClick={() => idx > 0 && move(skill.id, -1)}
                />
                <IconBtn
                  icon="ArrowDown"
                  size={26}
                  label={t("skills.moveDown", { name: skill.name })}
                  onClick={() => idx < linkedIds.length - 1 && move(skill.id, 1)}
                />
              </span>
            )}
            <SkillTypeBadge type={skill.type} />
          </div>
        );
      })}
    </div>
  );
}
