/* RunCostBadge — cost (+ tokens) of an agent run or a review round.
 *
 * Variants:
 *   compact  → "$0.014"                 (PR list column, trace COST tile)
 *   inline   → "9,119 tok · $0.0013"    (Agent runs timeline, total tokens)
 *   detailed → "$0.014  8.2K→1.3K"      (PR Overview, in→out tokens)
 * With no usage data at all it renders "—" (never "$0.00"). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  NO_DATA,
  formatTokensCompact,
  formatTokensFull,
  formatUsd,
  hasUsage,
} from "@/lib/format-cost";

export type RunCostBadgeVariant = "compact" | "inline" | "detailed";

export interface RunCostBadgeProps {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: RunCostBadgeVariant;
  style?: React.CSSProperties;
}

const base: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};
const muted: React.CSSProperties = { color: "var(--text-muted)" };

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
  style,
}: RunCostBadgeProps) {
  const t = useTranslations("runCost");
  const tin = tokensIn ?? 0;
  const tout = tokensOut ?? 0;
  const empty = variant === "compact" ? costUsd == null : !hasUsage(costUsd, tin, tout);

  if (empty) {
    return (
      <span className="mono" data-testid="run-cost" style={{ ...base, ...muted, ...style }} title={t("noData")}>
        {NO_DATA}
      </span>
    );
  }

  const cost = formatUsd(costUsd);
  const title = t("title", {
    cost,
    tokensIn: formatTokensFull(tin),
    tokensOut: formatTokensFull(tout),
  });

  let body: React.ReactNode = cost;
  if (variant === "inline") {
    body = (
      <>
        {t("tokens", { count: formatTokensFull(tin + tout) })}
        <span style={muted}> · </span>
        {cost}
      </>
    );
  } else if (variant === "detailed") {
    body = (
      <>
        {cost}
        {tin + tout > 0 && (
          <span style={{ ...muted, marginLeft: 8 }}>
            {formatTokensCompact(tin)}→{formatTokensCompact(tout)}
          </span>
        )}
      </>
    );
  }

  return (
    <span className="mono" data-testid="run-cost" style={{ ...base, ...style }} title={title}>
      {body}
    </span>
  );
}

export default RunCostBadge;
