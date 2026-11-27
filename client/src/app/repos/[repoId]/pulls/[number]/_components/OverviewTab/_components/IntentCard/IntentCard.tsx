"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { useDeriveIntent, usePrIntent } from "@/lib/hooks/intent";
import { CONFIDENCE_TONE } from "./constants";
import { deriveViewState, shortSha } from "./helpers";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | null | undefined;
  /** The PR's current head SHA (staleness is judged against it). */
  headSha: string;
}

/** Overview "INTENT" card: the derived intent of the PR, with Derive / Re-derive. */
export function IntentCard({ prId, headSha }: IntentCardProps) {
  const t = useTranslations("intent");
  const query = usePrIntent(prId);
  const mutation = useDeriveIntent(prId);
  const view = deriveViewState({ query, mutation, headSha });
  const intent = query.data?.intent ?? null;
  const settled = view === "derived" || view === "stale";
  const buttonLabel =
    view === "deriving"
      ? t("deriving")
      : view === "error"
        ? t("retry")
        : settled
          ? t("rederive")
          : t("derive");

  return (
    <section style={s.card} aria-live="polite" data-testid="intent-card" data-state={view}>
      <div style={s.header}>
        <span style={s.title}>{t("title")}</span>
        {view === "stale" && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("stale")}
          </Badge>
        )}
        {settled && intent?.mode === "inferred_from_changes" && <Badge>{t("inferredBadge")}</Badge>}
        {settled && intent?.confidence && (
          <Badge
            dot
            color={CONFIDENCE_TONE[intent.confidence].color}
            bg={CONFIDENCE_TONE[intent.confidence].bg}
          >
            {t("confidenceLabel", { level: t(`confidence.${intent.confidence}`) })}
          </Badge>
        )}
        {view !== "loading" && (
          <Button
            size="sm"
            kind="secondary"
            icon={settled ? "RefreshCw" : undefined}
            loading={view === "deriving"}
            onClick={() => mutation.mutate()}
          >
            {buttonLabel}
          </Button>
        )}
      </div>

      {view === "loading" && <p style={s.muted}>{t("loading")}</p>}
      {view === "not_derived" && (
        <p style={s.muted}>
          {t("notDerived")} {t("notDerivedHint")}
        </p>
      )}
      {view === "deriving" && <p style={s.muted}>{t("derivingHint")}</p>}
      {view === "error" && (
        <p style={s.error} role="alert">
          {t("error", { message: (mutation.error ?? query.error)?.message ?? "" })}
        </p>
      )}
      {settled && intent && <IntentBody intent={intent} stale={view === "stale"} headSha={headSha} />}
    </section>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div style={s.notice}>
      <Icon.AlertTriangle size={14} />
      <span>{text}</span>
    </div>
  );
}

function ScopeList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <div style={s.colTitle}>{title}</div>
      {items.length > 0 ? (
        <ul style={s.list}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p style={s.muted}>{empty}</p>
      )}
    </div>
  );
}

function IntentBody({
  intent,
  stale,
  headSha,
}: {
  intent: PrIntentRecord;
  stale: boolean;
  headSha: string;
}) {
  const t = useTranslations("intent");
  const missing = intent.missing_context ?? [];
  const sources = intent.sources ?? [];
  return (
    <>
      {intent.mode === "inferred_from_changes" && <Notice text={t("inferredBanner")} />}
      {stale && (
        <Notice
          text={`${t("staleHint", { derived: shortSha(intent.head_sha), head: shortSha(headSha) })} ${t("staleReviewNote")}`}
        />
      )}
      {!stale && intent.confidence === "low" && <Notice text={t("lowConfidenceHint")} />}
      <p style={s.summary}>“{intent.intent}”</p>
      <div style={s.columns}>
        <ScopeList title={t("inScope")} items={intent.in_scope} empty={t("noItems")} />
        <ScopeList title={t("outOfScope")} items={intent.out_of_scope} empty={t("noItems")} />
      </div>
      {missing.length > 0 && (
        <div>
          <Notice text={t("missingTitle")} />
          <ul style={s.missingList}>
            {missing.map((m) => (
              <li key={`${m.reason}:${m.ref}`}>
                {m.ref} — {t(`missingReason.${m.reason}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={s.footer}>
        <span>
          {t("sources")}: {sources.map((src) => t(`sourceKind.${src.kind}`, { ref: src.ref })).join(" · ")}
        </span>
        {intent.model && <span>{t("model", { model: intent.model.split("/").pop() ?? intent.model })}</span>}
      </div>
    </>
  );
}
