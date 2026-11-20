"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel } from "@devdigest/ui";
import type { PrDetail } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { s } from "./styles";

interface OverviewTabProps {
  pr: Pick<PrDetail, "body" | "cost_usd" | "tokens_in" | "tokens_out">;
}

export function OverviewTab({ pr }: OverviewTabProps) {
  const t = useTranslations("runCost");
  return (
    <>
      {/* Latest review round's usage — "—" until a run with usage data completes. */}
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
      {pr.body && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{pr.body}</div>
        </section>
      )}
    </>
  );
}
