import type { SkillType } from "@devdigest/shared";
import { TYPE_COLORS } from "./constants";

/** Badge foreground + a soft tint of the same colour for the background. */
export function typeColors(type: SkillType): { color: string; bg: string } {
  const color = TYPE_COLORS[type] ?? TYPE_COLORS.custom;
  return { color, bg: `color-mix(in srgb, ${color} 14%, transparent)` };
}
