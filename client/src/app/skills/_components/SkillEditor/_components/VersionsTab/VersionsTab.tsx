/* Versions tab: every body snapshot (newest first) with its change note.
   Diff compares an old version to the current text; Restore writes the old
   text back as a NEW version (history is never rewritten). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions, type SkillVersion } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { formatDate } from "../../helpers";
import { VersionDiffModal } from "../VersionDiffModal";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<SkillVersion | null>(null);

  if (isLoading) return <Skeleton height={140} />;
  if (isError || !versions) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  const onRestore = async (v: SkillVersion) => {
    const ok = await confirm({
      title: t("versions.restoreTitle", { version: v.version }),
      body: t("versions.restoreBody", { version: v.version }),
      confirmLabel: t("versions.restore"),
    });
    if (!ok) return;
    restore.mutate(
      { id: skill.id, version: v.version },
      { onSuccess: () => toast.success(t("versions.restoredToast", { version: v.version })) },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <Badge color="var(--text-secondary)">{t("versions.count", { count: versions.length })}</Badge>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>
      {versions.map((v) => {
        const current = v.version === skill.version;
        return (
          <div key={v.version} style={s.row(current)}>
            <span className="mono" style={s.versionChip(current)}>
              v{v.version}
            </span>
            <div style={s.text}>
              <div style={s.message}>{v.message || t("versions.noNote")}</div>
              <div style={s.date}>{formatDate(v.created_at)}</div>
            </div>
            {current ? (
              <Badge color="var(--ok)" dot>
                {t("versions.current")}
              </Badge>
            ) : (
              <div style={s.actions}>
                <Button kind="secondary" size="sm" onClick={() => setDiffOf(v)}>
                  <Icon.Eye size={13} aria-hidden /> {t("versions.diff")}
                </Button>
                <Button kind="secondary" size="sm" onClick={() => onRestore(v)} disabled={restore.isPending}>
                  <Icon.History size={13} aria-hidden /> {t("versions.restore")}
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {diffOf && (
        <VersionDiffModal
          version={diffOf.version}
          oldBody={diffOf.body}
          currentBody={skill.body}
          onClose={() => setDiffOf(null)}
        />
      )}
      {dialog}
    </div>
  );
}
