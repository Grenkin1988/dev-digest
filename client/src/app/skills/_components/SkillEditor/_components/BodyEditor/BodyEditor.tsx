/* BodyEditor — a code-style markdown editor: `<name>.md` file bar with an
   "unsaved" badge and a token estimate, line-number gutter, auto-growing
   monospace textarea (wrap off so line numbers always line up). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { estimateTokens } from "../../helpers";
import { s } from "./styles";

const MIN_LINES = 12;

export function BodyEditor({
  value,
  onChange,
  fileName,
  dirty,
}: {
  value: string;
  onChange: (v: string) => void;
  fileName: string;
  dirty: boolean;
}) {
  const t = useTranslations("skills");
  const lines = Math.max(MIN_LINES, value.split("\n").length + 1);
  const gutter = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  return (
    <div style={s.box}>
      <div style={s.bar}>
        <Icon.FileText size={13} aria-hidden />
        <span className="mono" style={s.fileName}>
          {fileName}.md
        </span>
        {dirty && <Badge color="var(--warn)">{t("config.unsaved")}</Badge>}
        <span style={s.tokens}>{t("config.tokens", { count: estimateTokens(value) })}</span>
      </div>
      <div style={s.editor}>
        <div className="mono" style={s.gutter} aria-hidden>
          {gutter}
        </div>
        <textarea
          className="mono"
          aria-label={t("config.body")}
          value={value}
          rows={lines}
          wrap="off"
          spellCheck={false}
          placeholder={t("config.bodyPlaceholder")}
          onChange={(e) => onChange(e.target.value)}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
