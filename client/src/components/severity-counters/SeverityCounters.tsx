/* SeverityCounters — per-severity finding counters (icon + count, coloured via
   SEV). Hover/focus reveals the top findings of that level. When `onSelect` is
   given each counter is a toggle button (used as a severity filter); the active
   one is highlighted with its SEV colour and the rest fade.

   Presentational: data comes in through props, nothing here talks to the server.
   Counts are derived from `findings`, unless the caller already has them
   (`counts`, e.g. the PR list's server-side rollup) — then `findings` only
   feed the popover and may arrive later (`findingsLoading` + `onPopoverOpen`). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import {
  SEVERITY_LEVELS,
  countBySeverity,
  type CounterSeverity,
  type SeverityCounts,
} from "./helpers";
import { SeverityPopover } from "./_components/SeverityPopover";
import { s } from "./styles";

export interface SeverityCountersProps {
  findings: FindingRecord[];
  /** Precomputed counts; when given they win over counting `findings`. */
  counts?: SeverityCounts | null;
  /** The popover's findings are still loading (lazy callers). */
  findingsLoading?: boolean;
  /** Called the first time a popover opens, so a caller can fetch findings lazily. */
  onPopoverOpen?: () => void;
  /** Show levels with 0 findings (run body) vs. only non-empty levels (PR list). */
  showZero?: boolean;
  /** Currently selected filter level, if any. */
  active?: CounterSeverity | null;
  /** Makes counters clickable toggles; receives the clicked level. */
  onSelect?: (severity: CounterSeverity) => void;
}

export function SeverityCounters({
  findings,
  counts: givenCounts,
  findingsLoading = false,
  onPopoverOpen,
  showZero = false,
  active = null,
  onSelect,
}: SeverityCountersProps) {
  const t = useTranslations("prReview.severityCounters");
  const [hover, setHover] = React.useState<{ sev: CounterSeverity; rect: DOMRect } | null>(null);
  const baseId = React.useId();
  const counts = givenCounts ?? countBySeverity(findings);
  const levels = SEVERITY_LEVELS.filter((sev) => showZero || counts[sev] > 0);

  const show = (sev: CounterSeverity) => (e: React.SyntheticEvent<HTMLElement>) => {
    onPopoverOpen?.();
    setHover({ sev, rect: e.currentTarget.getBoundingClientRect() });
  };
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
                loading={findingsLoading}
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

export default SeverityCounters;
