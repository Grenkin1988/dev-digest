/* FindingsPanel — severity counters/filter + hide-low-confidence + j/k
   navigation + FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { SeverityCounters, type CounterSeverity } from "@/components/severity-counters";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "@/lib/hooks/reviews";
import { useFindingShortcuts } from "./useFindingShortcuts";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<CounterSeverity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severity),
    [findings, hideLow, severity],
  );

  // One level at a time: clicking the active level clears the filter, any
  // other level replaces it. Purely client-side over the loaded findings.
  const toggleSeverity = React.useCallback((sev: CounterSeverity) => {
    setSeverity((prev) => (prev === sev ? null : sev));
    setFocusIdx(0);
  }, []);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  useFindingShortcuts({
    items: shown,
    focusIdx,
    setFocusIdx,
    onAction: (f, kind) => action.mutate({ findingId: f.id, action: kind, prId }),
  });

  return (
    <div>
      <div style={s.toolbar}>
        <SeverityCounters
          findings={findings}
          showZero
          active={severity}
          onSelect={toggleSeverity}
        />
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
