import type { Skill } from "@devdigest/shared";

export interface SkillRowModel {
  skill: Skill;
  linked: boolean;
}

/**
 * Rows for the tab: the agent's linked skills first, in link order (that order
 * is the order of blocks in the prompt), then every other workspace skill.
 * A link to a skill that no longer exists is dropped.
 */
export function orderRows(all: Skill[], linkedIds: string[]): SkillRowModel[] {
  const byId = new Map(all.map((sk) => [sk.id, sk]));
  const linked: SkillRowModel[] = [];
  for (const id of linkedIds) {
    const skill = byId.get(id);
    if (skill) linked.push({ skill, linked: true });
  }
  const linkedSet = new Set(linkedIds);
  const rest = all.filter((sk) => !linkedSet.has(sk.id)).map((skill) => ({ skill, linked: false }));
  return [...linked, ...rest];
}

/** A copy of `arr` with the item at `from` moved to `to` (clamped; out-of-range `from` is a no-op). */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length) return arr;
  const target = Math.max(0, Math.min(arr.length - 1, to));
  if (target === from) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}

/** Detach when linked, otherwise append at the end of the order. */
export function toggleLink(linkedIds: string[], id: string): string[] {
  return linkedIds.includes(id) ? linkedIds.filter((x) => x !== id) : [...linkedIds, id];
}

/** Case-insensitive filter over name, description and type. */
export function filterRows(rows: SkillRowModel[], search: string): SkillRowModel[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(({ skill }) => `${skill.name} ${skill.description} ${skill.type}`.toLowerCase().includes(q));
}
