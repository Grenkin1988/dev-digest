/* ConventionsView — the Conventions screen (/repos/:repoId/conventions): scan
   the repo once, review each grounded candidate, then turn the accepted ones
   into a skill. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { useConventions, useExtractConventions } from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionCard } from "../ConventionCard";
import { CreateConventionSkillModal } from "../CreateConventionSkillModal";
import { SKELETON_CARDS } from "./constants";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [created, setCreated] = React.useState<Skill | null>(null);

  const fullName = activeRepo?.full_name ?? repoId;
  const branch = activeRepo?.default_branch ?? "main";
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const list = data?.conventions ?? [];
  const accepted = list.filter((c) => c.status === "accepted");
  const scanning = extract.isPending;
  const runScan = () => extract.mutate();

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>
            {t("page.headingPrefix")}
            {activeRepo?.full_name ?? t("page.repoFallback")}
          </h1>
          <p style={s.subtitle}>
            {list.length > 0 ? t("page.candidateCount", { count: list.length }) : t("page.subtitle")}
            {data?.last_scan_at && ` · ${t("page.lastScan", { when: new Date(data.last_scan_at).toLocaleString() })}`}
          </p>
        </div>
        {list.length > 0 && (
          <div style={s.actions}>
            <span style={s.counter}>{t("page.acceptedCount", { accepted: accepted.length, total: list.length })}</span>
            <Button kind="secondary" icon="RefreshCw" onClick={runScan} disabled={scanning}>
              {scanning ? t("page.scanning") : t("page.rescan")}
            </Button>
            <Button kind="primary" icon="Sparkles" onClick={() => setModalOpen(true)} disabled={accepted.length === 0}>
              {t("page.createSkill")}
            </Button>
          </div>
        )}
      </div>

      {extract.isError && (
        <div style={s.banner("crit")} role="alert">
          <strong>{t("page.extractionFailed")}</strong>
          {extract.error instanceof Error && `: ${extract.error.message}`}
        </div>
      )}
      {created && (
        <div style={s.banner("ok")} role="status">
          {t("modal.created", { name: created.name })} — <Link href={`/skills/${created.id}`}>{t("modal.viewSkill")}</Link>
        </div>
      )}

      {isLoading ? (
        <div style={s.skeletons}>
          {Array.from({ length: SKELETON_CARDS }, (_, i) => (
            <Skeleton key={i} height={140} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t("page.loadError")}
          body={error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon="ListChecks"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={scanning ? t("page.scanning") : t("page.empty.cta")}
          onCta={scanning ? undefined : runScan}
          ctaLoading={scanning}
        />
      ) : (
        <div style={s.list}>
          {list.map((c) => (
            <ConventionCard key={c.id} repoId={repoId} convention={c} fullName={fullName} branch={branch} />
          ))}
        </div>
      )}

      {modalOpen && (
        <CreateConventionSkillModal
          fullName={fullName}
          conventions={accepted}
          onClose={() => setModalOpen(false)}
          onCreated={(skill) => {
            setModalOpen(false);
            setCreated(skill);
          }}
        />
      )}
      </div>
    </AppShell>
  );
}
