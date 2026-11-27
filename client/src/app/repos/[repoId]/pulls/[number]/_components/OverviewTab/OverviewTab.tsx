"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel } from "@devdigest/ui";
import type { PrDetail } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { IntentCard } from "./_components/IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  pr: Pick<
    PrDetail,
    | "id"
    | "head_sha"
    | "body"
    | "cost_usd"
    | "tokens_in"
    | "tokens_out"
    | "latest_round_cost_usd"
    | "latest_round_tokens_in"
    | "latest_round_tokens_out"
  >;
}

export function OverviewTab({ pr }: OverviewTabProps) {
  const t = useTranslations("runCost");
  return (
    <>
      {/* Brief row: the Intent card first; the grid leaves room for the Blast radius card. */}
      <div style={s.briefRow}>
        <IntentCard prId={pr.id} headSha={pr.head_sha} />
      </div>
      {/* Total of all completed runs, then the latest round alone — "—" until
          a run with usage data completes. */}
      <div style={s.costRow} title={t("overviewHint")} data-testid="overview-cost">
        <Icon.DollarSign size={12} />
        <span>{t("overviewLabel")}</span>
        <RunCostBadge
          variant="detailed"
          costUsd={pr.cost_usd}
          tokensIn={pr.tokens_in}
          tokensOut={pr.tokens_out}
        />
      </div>
      <div
        style={s.costRow}
        title={t("overviewLatestHint")}
        data-testid="overview-cost-latest-round"
      >
        <span>{t("overviewLatestLabel")}</span>
        <RunCostBadge
          variant="detailed"
          costUsd={pr.latest_round_cost_usd}
          tokensIn={pr.latest_round_tokens_in}
          tokensOut={pr.latest_round_tokens_out}
        />
      </div>
      {pr.body && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{pr.body}</div>
        </section>
      )}
    </>
  );
}
