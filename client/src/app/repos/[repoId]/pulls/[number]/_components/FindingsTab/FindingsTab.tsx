/* FindingsTab — the PR detail "Findings" tab: live runs, the run/commit
   timeline and the review-run accordions. Run wiring (live ids, cancel,
   delete, invalidation) lives in useFindingsTabRuns. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import type { FindingRecord, PrCommit, ReviewRecord } from "@devdigest/shared";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { useFindingsTabRuns } from "./useFindingsTabRuns";
import { findingsByRunId, lethalTrifectaFindings } from "./helpers";
import { s, sx } from "./styles";

export interface FindingsTabProps {
  prId: string | null;
  /** Reviews of the PR, newest first (one accordion per run). */
  runs: ReviewRecord[];
  prCommits: PrCommit[];
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  github: { repoFullName: string | null; headSha: string | null };
  onOpenTrace: (runId: string) => void;
}

export function FindingsTab({ prId, runs, prCommits, github, onOpenTrace }: FindingsTabProps) {
  const t = useTranslations("prReview.findingsTab");
  const { liveRunIds, prRuns, cancelPending, cancelAll, deleteRun, onRunDone, confirmDialog } =
    useFindingsTabRuns(prId);
  const reviewRunning = liveRunIds.length > 0;
  const lethalTrifecta: FindingRecord[] = lethalTrifectaFindings(runs);

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below. The nonce re-triggers the
  // scroll even when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const goToReview = (runId: string) => setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));

  return (
    <section>
      {reviewRunning && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button kind="danger" size="sm" icon="X" loading={cancelPending} onClick={cancelAll}>
                  {t("cancel")}
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={() => onOpenTrace(liveRunIds[0]!)}>
                  {t("openTrace")}
                </Button>
              </div>
            }
          >
            {t("liveReview")}
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={onRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress} role="status" aria-live="polite">
          <Icon.RefreshCw size={16} style={sx.spinner} aria-hidden />
          <span style={s.reviewInProgressText}>{t("inProgress")}</span>
          <span style={s.reviewInProgressSub}>{t("inProgressSub")}</span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={sx.shield} aria-hidden />
          <span style={s.lethalTrifectaTitle}>{t("trifectaTitle")}</span>
          <Badge color="var(--crit)" bg="transparent">
            {t("trifectaCount", { count: lethalTrifecta.length })}
          </Badge>
        </div>
      )}

      {(prRuns.length > 0 || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel icon="Activity" right={<span style={sx.sectionHint}>{t("timelineHint")}</span>}>
            {t("timeline")}
          </SectionLabel>
          <RunHistory
            runs={prRuns}
            commits={prCommits}
            onOpenTrace={onOpenTrace}
            onGoToReview={goToReview}
            onDelete={deleteRun}
            findingsByRun={findingsByRunId(runs)}
          />
        </div>
      )}

      <SectionLabel icon="AlertOctagon" right={<span style={sx.sectionHint}>{t("reviewRunsHint")}</span>}>
        {t("reviewRuns")}
      </SectionLabel>
      {runs.length === 0 ? (
        reviewRunning ? null : (
          <EmptyState icon="Sparkles" title={t("emptyTitle")} body={t("emptyBody")} />
        )
      ) : (
        prId &&
        runs.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            prId={prId}
            defaultOpen={i === 0}
            repoFullName={github.repoFullName}
            headSha={github.headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
          />
        ))
      )}
      {confirmDialog}
    </section>
  );
}
