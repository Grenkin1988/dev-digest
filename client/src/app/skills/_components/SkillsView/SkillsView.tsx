/* SkillsView — /skills, /skills/new and /skills/:id. The skill list on the left
   (search, enabled toggles, Add Skill → Create / Import) and the editor for the
   selected skill on the right. The editor tab lives in the URL (?tab). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import { useSkill, useSkills, useSkillsStats, useUpdateSkill } from "@/lib/hooks/skills";
import { useConfirmDeleteSkill } from "../../_hooks/useConfirmDeleteSkill";
import { SkillCard } from "../SkillCard";
import { SkillEditor, resolveTab, type SkillTab } from "../SkillEditor";
import { ImportSkillModal } from "../ImportSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsView({ id, isNew }: { id?: string; isNew?: boolean }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const params = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: stats } = useSkillsStats();
  const { data: skill, isLoading: skillLoading, isError: skillError, error, refetch: refetchSkill } = useSkill(id);
  const update = useUpdateSkill();
  const del = useConfirmDeleteSkill();
  const [search, setSearch] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  const tab = resolveTab(params.get("tab"));
  const setTab = (next: SkillTab) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const list = filterSkills(skills ?? [], search);
  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(id ? [{ label: skill?.name ?? t("page.crumbSkills") }] : isNew ? [{ label: t("editor.newTitle") }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      {del.dialog}
      {importing && (
        <ImportSkillModal
          onClose={() => setImporting(false)}
          onSaved={(created) => {
            setImporting(false);
            router.push(`/skills/${created.id}?tab=config`);
          }}
        />
      )}
      <div style={s.layout}>
        <aside style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <div style={s.titleRow}>
              <h1 style={s.title}>{t("page.heading")}</h1>
              <Dropdown
                width={210}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.menu.create"), icon: "Edit", onClick: () => router.push("/skills/new") },
                  { label: t("page.menu.import"), icon: "Upload", onClick: () => setImporting(true) },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} aria-hidden />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                aria-label={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.list}>
            {isLoading && (
              <>
                <Skeleton height={110} />
                <Skeleton height={110} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && skills && skills.length > 0 && list.length === 0 && (
              <div style={s.note}>{t("page.noMatch")}</div>
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                stats={stats?.[sk.id]}
                active={sk.id === id}
                deleting={del.pendingId === sk.id}
                onClick={() => router.push(`/skills/${sk.id}?tab=${id ? tab : "config"}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                onDelete={() => void del.remove(sk, sk.id === id ? () => router.replace("/skills") : undefined)}
              />
            ))}
          </div>
        </aside>

        <div style={s.main}>
          {isNew && <SkillEditor key="new" skill={null} tab="config" onTab={() => undefined} />}
          {id && skillLoading && (
            <div style={s.mainSkeleton}>
              <Skeleton height={24} width={240} />
              <Skeleton height={200} />
            </div>
          )}
          {id && (skillError || (!skillLoading && !skill)) && (
            <ErrorState
              title={t("editor.notFound.title")}
              body={error instanceof ApiError && error.status !== 404 ? error.message : t("editor.notFound.body")}
              onRetry={() => refetchSkill()}
            />
          )}
          {id && skill && <SkillEditor key={`${skill.id}-${skill.version}`} skill={skill} tab={tab} onTab={setTab} />}
          {!id && !isNew && !isLoading && !isError && (
            <EmptyState
              icon="Sparkles"
              title={skills && skills.length === 0 ? t("page.empty.title") : t("page.selectPrompt.title")}
              body={skills && skills.length === 0 ? t("page.empty.body") : t("page.selectPrompt.body")}
              cta={skills && skills.length === 0 ? t("page.empty.cta") : undefined}
              onCta={() => router.push("/skills/new")}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
