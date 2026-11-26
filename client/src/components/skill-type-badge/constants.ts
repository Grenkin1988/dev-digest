import type { SkillType } from "@devdigest/shared";

/** Every skill type, in the order shown in selects. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Accent per skill type (kept in one place so the list, editor and agent tab agree). */
export const TYPE_COLORS: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};
