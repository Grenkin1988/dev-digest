import { DEFAULT_TAB, MAX_DIFF_CELLS, TAB_KEYS, type SkillTab } from "./constants";

/** The editor tab from `?tab`, falling back to Config for unknown values. */
export function resolveTab(raw: string | null): SkillTab {
  return raw && (TAB_KEYS as readonly string[]).includes(raw) ? (raw as SkillTab) : DEFAULT_TAB;
}

/** Rough token estimate (about 4 chars per token) — the same rule the server run log uses. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** `2026-05-30` from an ISO timestamp. */
export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}

/** Line diff (LCS) of `before` to `after`. Falls back to delete-all/add-all for huge inputs. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  if (a.length * b.length > MAX_DIFF_CELLS) {
    return [
      ...a.map((text): DiffLine => ({ kind: "del", text })),
      ...b.map((text): DiffLine => ({ kind: "add", text })),
    ];
  }
  // lcs[i][j] = LCS length of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i++]! });
    } else {
      out.push({ kind: "add", text: b[j++]! });
    }
  }
  while (i < a.length) out.push({ kind: "del", text: a[i++]! });
  while (j < b.length) out.push({ kind: "add", text: b[j++]! });
  return out;
}

/** True when the diff contains no added or removed lines. */
export function isSameText(diff: DiffLine[]): boolean {
  return diff.every((l) => l.kind === "same");
}
