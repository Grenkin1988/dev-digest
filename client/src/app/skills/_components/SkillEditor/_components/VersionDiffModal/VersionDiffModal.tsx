/* VersionDiffModal — line diff of an older version's body against the current
   body (red = in the old version only, green = in the current text only). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { isSameText, lineDiff } from "../../helpers";
import { s } from "./styles";

export function VersionDiffModal({
  version,
  oldBody,
  currentBody,
  onClose,
}: {
  version: number;
  oldBody: string;
  currentBody: string;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const diff = React.useMemo(() => lineDiff(oldBody, currentBody), [oldBody, currentBody]);
  return (
    <Modal
      width={820}
      title={t("versions.diffTitle", { version })}
      onClose={onClose}
      footer={
        <Button kind="secondary" onClick={onClose}>
          {t("diff.close")}
        </Button>
      }
    >
      {isSameText(diff) ? (
        <p style={s.same}>{t("versions.diffSame")}</p>
      ) : (
        <pre className="mono" style={s.pre}>
          {diff.map((l, i) => (
            <div key={i} style={s.line(l.kind)}>
              <span style={s.sign} aria-hidden>
                {l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}
              </span>
              {l.text || " "}
            </div>
          ))}
        </pre>
      )}
    </Modal>
  );
}
