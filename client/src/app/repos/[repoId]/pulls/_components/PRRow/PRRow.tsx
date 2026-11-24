/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";
import { RunCostBadge } from "@/components/run-cost-badge";
import { SeverityCounters, latestReviewPerAgent } from "@/components/severity-counters";
import { usePrReviews } from "@/lib/hooks/reviews";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  // Counts come with the row (`severity_counts`, server-side rollup), so the
  // list makes no per-row request. The findings behind them are fetched only
  // when a popover first opens; it's the same ["reviews", prId] cache as the
  // PR detail page.
  const [wantFindings, setWantFindings] = React.useState(false);
  const { data: reviews, isLoading: findingsLoading } = usePrReviews(pr.id, {
    enabled: wantFindings,
  });
  const findings = latestReviewPerAgent(reviews ?? []).flatMap((r) => r.findings);
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div>
        <SeverityCounters
          counts={pr.severity_counts}
          findings={findings}
          findingsLoading={wantFindings && findingsLoading}
          onPopoverOpen={() => setWantFindings(true)}
        />
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div>
        <RunCostBadge variant="compact" costUsd={pr.cost_usd} />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
