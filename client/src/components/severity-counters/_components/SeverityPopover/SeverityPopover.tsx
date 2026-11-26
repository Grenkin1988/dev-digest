/* SeverityPopover — the hover/focus card of one SeverityCounters level: its
   count and the most confident findings. Portalled + position:fixed so the
   overflow:hidden PR table / run accordion can't clip it (client/INSIGHTS.md). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { findingLocation, topFindings, type CounterSeverity } from "../../helpers";
import { POPOVER_FLIP_SPACE } from "../../constants";
import { s } from "../../styles";

export interface SeverityPopoverProps {
  id: string;
  anchor: DOMRect;
  findings: FindingRecord[];
  /** True while the findings behind `count` are still being fetched. */
  loading?: boolean;
  severity: CounterSeverity;
  count: number;
  hint: string | null;
}

export function SeverityPopover({ id, anchor, findings, loading, severity, count, hint }: SeverityPopoverProps) {
  const t = useTranslations("prReview.severityCounters");
  const meta = SEV[severity];
  const I = Icon[meta.icon];
  const { top, more } = topFindings(findings, severity);
  const flip = anchor.bottom + POPOVER_FLIP_SPACE > window.innerHeight;
  const position: React.CSSProperties = flip
    ? { left: anchor.left, bottom: window.innerHeight - anchor.top + 6 }
    : { left: anchor.left, top: anchor.bottom + 6 };
  return createPortal(
    <div id={id} role="tooltip" style={{ ...s.popover, ...position }} onClick={(e) => e.stopPropagation()}>
      <div style={s.popoverTitle(meta.c)}>
        <I size={13} aria-hidden />
        {count > 0
          ? t("popoverTitle", { count, level: meta.label })
          : t("none", { level: meta.label.toLowerCase() })}
      </div>
      {loading && count > 0 && <div style={s.muted}>{t("loading")}</div>}
      {top.length > 0 && (
        <ul style={s.popoverList}>
          {top.map((f) => (
            <li key={f.id}>
              <div style={s.findingTitle}>{f.title}</div>
              <div className="mono" style={s.findingLoc}>
                {findingLocation(f)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <div style={s.moreLine}>{t("more", { count: more })}</div>}
      {hint && <div style={s.hint}>{hint}</div>}
    </div>,
    document.body,
  );
}
