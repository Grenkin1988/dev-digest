/* SeverityCounters — per-severity finding counters (icon + count, coloured via
   SEV). Hover/focus reveals the top findings of that level. When `onSelect` is
   given each counter is a toggle button (used as a severity filter); the active
   one is highlighted with its SEV colour and the rest fade. Counts are derived
   from findings already in memory — nothing here talks to the server. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import {
  SEVERITY_LEVELS,
  countBySeverity,
  topFindings,
  type CounterSeverity,
} from "./helpers";
import { s } from "./styles";

export interface SeverityCountersProps {
  findings: FindingRecord[];
  /** Show levels with 0 findings (run body) vs. only non-empty levels (PR list). */
  showZero?: boolean;
  /** Currently selected filter level, if any. */
  active?: CounterSeverity | null;
  /** Makes counters clickable toggles; receives the clicked level. */
  onSelect?: (severity: CounterSeverity) => void;
}

/** Room the popover needs below its anchor before it flips above. */
const POPOVER_FLIP_SPACE = 220;

function location(f: FindingRecord): string {
  return f.end_line && f.end_line !== f.start_line
    ? `${f.file}:${f.start_line}–${f.end_line}`
    : `${f.file}:${f.start_line}`;
}

export function SeverityCounters({
  findings,
  showZero = false,
  active = null,
  onSelect,
}: SeverityCountersProps) {
  const t = useTranslations("prReview.severityCounters");
  const [hover, setHover] = React.useState<{ sev: CounterSeverity; rect: DOMRect } | null>(null);
  const baseId = React.useId();
  const counts = React.useMemo(() => countBySeverity(findings), [findings]);
  const levels = SEVERITY_LEVELS.filter((sev) => showZero || counts[sev] > 0);

  const show = (sev: CounterSeverity) => (e: React.SyntheticEvent<HTMLElement>) =>
    setHover({ sev, rect: e.currentTarget.getBoundingClientRect() });
  const hide = () => setHover(null);

  if (levels.length === 0) {
    return (
      <span data-testid="severity-counters" style={s.empty}>
        —
      </span>
    );
  }

  return (
    <div data-testid="severity-counters" role="group" aria-label={t("groupLabel")} style={s.group}>
      {levels.map((sev) => {
        const meta = SEV[sev];
        const I = Icon[meta.icon];
        const count = counts[sev];
        const isActive = active === sev;
        const clickable = !!onSelect;
        const popoverId = `${baseId}-${sev}`;
        const open = hover?.sev === sev;
        const common = {
          "aria-label": t("ariaLabel", { count, level: meta.label }),
          "aria-describedby": open ? popoverId : undefined,
          "data-severity": sev,
          style: s.counter(meta.c, meta.bg, {
            active: isActive,
            faded: active != null && !isActive,
            clickable,
          }),
          onFocus: show(sev),
          onBlur: hide,
        };
        const content = (
          <>
            <I size={12.5} aria-hidden />
            <span className="tnum" style={s.count(meta.c)}>
              {count}
            </span>
          </>
        );
        return (
          <span key={sev} style={s.item} onMouseEnter={show(sev)} onMouseLeave={hide}>
            {clickable ? (
              <button
                type="button"
                aria-pressed={isActive}
                {...common}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(sev);
                }}
              >
                {content}
              </button>
            ) : (
              <span tabIndex={0} {...common}>
                {content}
              </span>
            )}
            {open && (
              <SeverityPopover
                id={popoverId}
                anchor={hover.rect}
                findings={findings}
                severity={sev}
                count={count}
                hint={
                  clickable
                    ? isActive
                      ? t("clearHint")
                      : t("filterHint", { level: meta.label.toLowerCase() })
                    : null
                }
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

function SeverityPopover({
  id,
  anchor,
  findings,
  severity,
  count,
  hint,
}: {
  id: string;
  anchor: DOMRect;
  findings: FindingRecord[];
  severity: CounterSeverity;
  count: number;
  hint: string | null;
}) {
  const t = useTranslations("prReview.severityCounters");
  const meta = SEV[severity];
  const I = Icon[meta.icon];
  const { top, more } = topFindings(findings, severity);
  // Portalled + fixed so overflow:hidden ancestors (PR table, run accordion)
  // can't clip it; flips above the counter near the viewport bottom.
  const flip = anchor.bottom + POPOVER_FLIP_SPACE > window.innerHeight;
  const position: React.CSSProperties = flip
    ? { left: anchor.left, bottom: window.innerHeight - anchor.top + 6 }
    : { left: anchor.left, top: anchor.bottom + 6 };
  return createPortal(
    <div
      id={id}
      role="tooltip"
      style={{ ...s.popover, ...position }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={s.popoverTitle(meta.c)}>
        <I size={13} aria-hidden />
        {count > 0
          ? t("popoverTitle", { count, level: meta.label })
          : t("none", { level: meta.label.toLowerCase() })}
      </div>
      {top.length > 0 && (
        <ul style={s.popoverList}>
          {top.map((f) => (
            <li key={f.id}>
              <div style={s.findingTitle}>{f.title}</div>
              <div className="mono" style={s.findingLoc}>
                {location(f)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <div style={{ ...s.muted, marginTop: 6 }}>{t("more", { count: more })}</div>}
      {hint && <div style={s.hint}>{hint}</div>}
    </div>,
    document.body,
  );
}

export default SeverityCounters;
