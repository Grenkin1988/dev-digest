import type { Skill } from "@devdigest/shared";

/** Case-insensitive match over name, description and type. */
export function filterSkills(list: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return list;
  return list.filter((sk) => `${sk.name} ${sk.description} ${sk.type}`.toLowerCase().includes(q));
}
