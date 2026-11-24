/* ReviewRunAccordion — one collapsible review RUN (a single agent's pass over
   the PR). Header shows agent + verdict + counts + score + when it ran; the
   body holds that run's VerdictBanner summary and its own FindingsPanel. A PR
   can have many runs (different agents / re-runs over time); each is separate
   and collapsible so older runs don't bury the latest. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { useDeleteReview } from "@/lib/hooks/reviews";
import { useConfirm } from "@/components/confirm-dialog";
import { FindingsPanel } from "../FindingsPanel";
import { VerdictBanner } from "../VerdictBanner";
import { blockerCount, formatWhen, verdictColor, verdictLabelKey } from "./helpers";
import { s } from "./styles";

export interface ReviewRunAccordionProps {
  review: ReviewRecord;
  prId: string;
  defaultOpen?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When this matches review.run_id, the accordion opens and scrolls into view
   *  (driven from the Timeline: clicking an agent name navigates here). */
  targetRunId?: string | null;
  targetNonce?: number;
}

export function ReviewRunAccordion({
  review,
  prId,
  defaultOpen = false,
  repoFullName,
  headSha,
  targetRunId = null,
  targetNonce = 0,
}: ReviewRunAccordionProps) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const bodyId = React.useId();
  const del = useDeleteReview(prId);
  const { confirm, dialog } = useConfirm();

  // Scroll sync with the Timeline (an external DOM effect, keyed by the nonce).
  React.useEffect(() => {
    if (review.run_id && review.run_id === targetRunId) {
      setOpen(true);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [targetRunId, targetNonce, review.run_id]);

  const findings = review.findings;
  const blockers = blockerCount(findings);
  const agentName = review.agent_name ?? t("runAccordion.agentFallback");
  const labelKey = verdictLabelKey(review.verdict);

  const onDelete = async () => {
    const ok = await confirm({
      title: t("detail.deleteReviewTitle", { agent: agentName }),
      body: t("detail.deleteReviewBody"),
    });
    if (ok) del.mutate(review.id);
  };

  return (
    <div ref={rootRef} id={review.run_id ? `review-run-${review.run_id}` : undefined} style={s.root}>
      <div style={s.header}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          style={s.toggle}
        >
          <Icon.Cpu size={15} style={s.muted} aria-hidden />
          <span style={s.agent}>{agentName}</span>
          {review.verdict && (
            <Badge color={verdictColor(review.verdict)} bg="transparent">
              {labelKey ? t(`verdict.${labelKey}`) : review.verdict}
            </Badge>
          )}
          <span style={s.counts}>
            {t("runAccordion.findings", { count: findings.length })}
            {blockers > 0 ? t("runAccordion.blockers", { count: blockers }) : ""}
          </span>
          <span style={s.spacer} />
          {review.score != null && (
            <Badge mono color="var(--text-secondary)">
              {review.score}
            </Badge>
          )}
          <span className="mono" style={s.when}>
            {formatWhen(review.created_at)}
          </span>
          <Icon.ChevronDown size={16} style={s.chevron(open)} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={del.isPending}
          title={t("runAccordion.deleteRun")}
          aria-label={t("runAccordion.deleteRun")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? s.spinning : undefined} aria-hidden />
        </button>
      </div>

      {open && (
        <div id={bodyId} style={s.body}>
          {review.verdict && (
            <div style={s.banner}>
              <VerdictBanner
                verdict={review.verdict as Verdict}
                summary={review.summary}
                score={review.score}
                findingsCount={findings.length}
                blockers={blockers}
                agentName={review.agent_name}
              />
            </div>
          )}
          <FindingsPanel findings={findings} prId={prId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      )}
      {dialog}
    </div>
  );
}

export default ReviewRunAccordion;
