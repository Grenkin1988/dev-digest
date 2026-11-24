/* PrDetailView — the PR detail screen (/repos/:repoId/pulls/:number): header,
   Overview / Findings / Files tabs and the run-trace drawer. Tab + open trace
   live in the URL (?tab, ?trace) via usePrDetailParams. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePullByNumber } from "@/lib/hooks/core";
import { useInvalidateAfterRun, usePrReviews } from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import { PrDetailHeader } from "../PrDetailHeader";
import { OverviewTab } from "../OverviewTab";
import { FindingsTab } from "../FindingsTab";
import { DiffTab } from "../DiffTab";
import RunTraceDrawer from "../RunTraceDrawer";
import { usePrDetailParams } from "./usePrDetailParams";
import { s } from "./styles";

export function PrDetailView({ repoId, number }: { repoId: string; number: string }) {
  const t = useTranslations("prReview");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const prNumber = Number(number);
  const { data: pr, isLoading, isError, error, refetch } = usePullByNumber(repoId, prNumber);
  const prId = pr?.id ?? null;
  const { data: reviews } = usePrReviews(prId);
  const invalidate = useInvalidateAfterRun(prId);
  const { tab, setTab, traceRunId, setTrace } = usePrDetailParams(repoId, number);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];
  const findingsCount = runs.reduce((n, r) => n + r.findings.length, 0);
  // The real "owner/repo" (null until the repo is loaded) for github.com deep-links.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = [
    { label: repoFullName ?? repoId, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("list.breadcrumb"), href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ];

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <PrDetailSkeleton />
      </AppShell>
    );
  }

  if (isError || !pr) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("detail.loadErrorBody", { number })}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  const traceRun = traceRunId ? runs.find((r) => r.run_id === traceRunId) : undefined;

  return (
    <AppShell crumb={crumb}>
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        findingsCount={findingsCount}
        githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
        onSetTab={setTab}
        onRunStart={() => setTab("findings")}
        onRunsStarted={() => invalidate.activeRuns()}
      />

      <div style={s.body}>
        {tab === "overview" && <OverviewTab pr={pr} />}

        {tab === "findings" && (
          <FindingsTab
            prId={prId}
            runs={runs}
            prCommits={pr.commits}
            github={{ repoFullName, headSha: pr.head_sha }}
            onOpenTrace={setTrace}
          />
        )}

        {tab === "diff" && (
          <DiffTab prId={prId} filesCount={pr.files_count} files={pr.files} canComment={pr.status === "open"} />
        )}
      </div>

      {prId && traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          findings={traceRun?.findings ?? []}
          agentName={traceRun?.agent_name ?? null}
          onClose={() => setTrace(null)}
        />
      )}
    </AppShell>
  );
}

export function PrDetailSkeleton() {
  return (
    <div style={s.skeleton}>
      <Skeleton height={28} width={420} />
      <Skeleton height={16} width={300} />
      <Skeleton height={200} />
    </div>
  );
}
