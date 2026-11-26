"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore } from "@devdigest/ui";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { SeverityCounters } from "@/components/severity-counters";
import { outcomeOf, showsUsage } from "../../helpers";
import { s } from "../../styles";

export interface RunRowProps {
  run: RunSummary;
  /** This run's loaded findings (from the PR's reviews), for severity counters. */
  findings?: FindingRecord[];
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}

/** One agent run in the PR timeline: outcome, score, findings, usage, actions. */
export function RunRow({ run: r, findings, onOpenTrace, onGoToReview, onDelete }: RunRowProps) {
  const t = useTranslations("prReview");
  const o = outcomeOf(r);
  const settled = r.status === "done";
  return (
    <div style={s.runRow}>
      <Badge color={o.color} bg={o.bg} icon={o.icon}>
        {t(`runStatus.${o.key}`)}
      </Badge>
      {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
      <div style={s.runBody}>
        <div style={s.runTitle}>
          <button
            type="button"
            onClick={() => onGoToReview?.(r.run_id)}
            title={t("timeline.goToReview")}
            style={s.agentLink(!!onGoToReview)}
          >
            {r.agent_name ?? t("timeline.agentFallback")}
          </button>{" "}
          <span className="mono" style={s.model}>
            {r.provider}/{r.model}
          </span>
        </div>
        {r.status === "failed" && r.error && (
          <div style={s.error} title={r.error}>
            {r.error}
          </div>
        )}
        {settled && (
          <div style={s.findings}>
            {/* Per-severity counters when this run's review is loaded;
                otherwise (or with no findings) the plain count. */}
            {findings?.length ? (
              <SeverityCounters findings={findings} />
            ) : (
              t("runStatus.findings", { count: r.findings_count ?? 0 })
            )}
            {(r.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: r.blockers ?? 0 }) : ""}
          </div>
        )}
      </div>
      <div style={s.aside}>
        {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
        {showsUsage(r) && (
          <RunCostBadge
            variant="inline"
            costUsd={r.cost_usd}
            tokensIn={r.tokens_in}
            tokensOut={r.tokens_out}
            style={s.costBadge}
          />
        )}
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(r.run_id)}
        style={s.iconBtn}
      >
        <Icon.FileText size={13} aria-hidden />
      </button>
      {onDelete && r.status !== "running" && (
        <button
          type="button"
          aria-label={t("timeline.deleteRun")}
          title={t("timeline.deleteRun")}
          onClick={() => onDelete(r.run_id)}
          style={s.deleteBtn}
        >
          <Icon.Trash size={13} aria-hidden />
        </button>
      )}
    </div>
  );
}
