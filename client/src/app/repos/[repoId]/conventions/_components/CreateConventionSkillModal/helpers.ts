/* Pure helpers for CreateConventionSkillModal. */
import type { ConventionView } from "@/lib/hooks/conventions";
import { FALLBACK_CATEGORY, SLUG_RE } from "./constants";

export function isSlug(name: string): boolean {
  return SLUG_RE.test(name);
}

export function defaultDescription(count: number, fullName: string): string {
  return `${count} house ${count === 1 ? "convention" : "conventions"} extracted from ${fullName}`;
}

/** `path:L1-L2` (or `path:L1` / bare `path` when lines are unknown). */
export function evidenceLabel(c: Pick<ConventionView, "evidence_path" | "start_line" | "end_line">): string {
  if (c.start_line == null) return c.evidence_path;
  if (c.end_line == null || c.end_line === c.start_line) return `${c.evidence_path}:L${c.start_line}`;
  return `${c.evidence_path}:L${c.start_line}-L${c.end_line}`;
}

/**
 * Markdown body grouped by category. Rejected candidates and (when `included`
 * is given) unchecked ones are left out.
 */
export function buildSkillBody(
  conventions: ConventionView[],
  name: string,
  included?: ReadonlySet<string>,
): string {
  const used = conventions.filter((c) => c.status !== "rejected" && (!included || included.has(c.id)));
  const groups = new Map<string, ConventionView[]>();
  for (const c of used) {
    const cat = c.category?.trim() || FALLBACK_CATEGORY;
    groups.set(cat, [...(groups.get(cat) ?? []), c]);
  }
  const out = [`# ${name || "conventions"}`];
  for (const [cat, items] of groups) {
    out.push("", `## ${cat}`, "");
    for (const c of items) out.push(`- ${c.rule}`, `  Detected in \`${evidenceLabel(c)}\``);
  }
  return out.join("\n") + "\n";
}
