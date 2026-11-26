/* ConventionCard — one extracted candidate: rule (inline-editable), category and
   status badges, the grounded evidence (GitHub link + snippet) and confidence.
   Accept / Reject are toggles: clicking the active one returns to pending. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, MonoLink, PercentProgress, Textarea } from "@devdigest/ui";
import { useUpdateConvention, type ConventionView } from "@/lib/hooks/conventions";
import { githubBlobUrl } from "@/lib/github-urls";
import { evidenceLabel } from "../CreateConventionSkillModal/helpers";
import { s } from "./styles";

interface Props {
  repoId: string;
  convention: ConventionView;
  fullName: string;
  branch: string;
}

export function ConventionCard({ repoId, convention: c, fullName, branch }: Props) {
  const t = useTranslations("conventions");
  const update = useUpdateConvention(repoId);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(c.rule);

  const toggleStatus = (target: "accepted" | "rejected") =>
    update.mutate({ id: c.id, patch: { status: c.status === target ? "pending" : target } });

  const saveRule = () => {
    const rule = draft.trim();
    if (!rule) return;
    update.mutate({ id: c.id, patch: { rule } });
    setEditing(false);
  };

  const href = githubBlobUrl(fullName, branch, c.evidence_path, c.start_line ?? undefined, c.end_line ?? undefined);

  return (
    <article style={s.card(c.status)} data-status={c.status}>
      <div style={s.top}>
        {editing ? (
          <div style={s.editWrap}>
            <Textarea value={draft} onChange={setDraft} rows={3} />
            <div style={s.editActions}>
              <Button kind="primary" size="sm" onClick={saveRule} disabled={!draft.trim()}>
                {t("card.save")}
              </Button>
              <Button
                kind="secondary"
                size="sm"
                onClick={() => {
                  setDraft(c.rule);
                  setEditing(false);
                }}
              >
                {t("card.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <p style={s.rule}>{c.rule}</p>
        )}
        <div style={s.actions}>
          <Button
            kind={c.status === "accepted" ? "primary" : "secondary"}
            size="sm"
            icon="Check"
            active={c.status === "accepted"}
            aria-pressed={c.status === "accepted"}
            onClick={() => toggleStatus("accepted")}
          >
            {t("card.accept")}
          </Button>
          <Button
            kind={c.status === "rejected" ? "danger" : "secondary"}
            size="sm"
            icon="X"
            active={c.status === "rejected"}
            aria-pressed={c.status === "rejected"}
            onClick={() => toggleStatus("rejected")}
          >
            {t("card.reject")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="Edit"
            aria-label={t("card.edit")}
            title={t("card.edit")}
            onClick={() => {
              setDraft(c.rule);
              setEditing(true);
            }}
          />
        </div>
      </div>

      <div style={s.badges}>
        <Badge>{c.category ?? t("card.uncategorised")}</Badge>
        {c.status === "accepted" && (
          <Badge color="var(--ok)" bg="var(--ok-bg)">
            {t("card.accepted")}
          </Badge>
        )}
        {c.status === "rejected" && (
          <Badge color="var(--crit)" bg="var(--crit-bg)">
            {t("card.rejected")}
          </Badge>
        )}
      </div>

      <div style={s.evidence}>
        <div style={s.evidenceHead}>
          <MonoLink href={href}>{evidenceLabel(c)} ↗</MonoLink>
        </div>
        <pre className="mono" style={s.snippet}>
          {c.evidence_snippet}
        </pre>
      </div>

      <PercentProgress value={c.confidence * 100} label={t("card.confidence")} />
    </article>
  );
}
