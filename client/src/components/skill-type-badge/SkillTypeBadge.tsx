/* SkillTypeBadge — the coloured type chip (rubric / convention / security /
   custom) shown on skill cards, the editor header and the agent Skills tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { typeColors } from "./helpers";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  const { color, bg } = typeColors(type);
  return (
    <Badge color={color} bg={bg}>
      {t(`type.${type}`)}
    </Badge>
  );
}
