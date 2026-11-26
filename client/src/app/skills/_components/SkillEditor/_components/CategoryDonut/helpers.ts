export const CATEGORY_COLORS: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "#8b5cf6",
  style: "var(--accent)",
};

/** Used for categories with no fixed colour, picked by position. */
const FALLBACK_COLORS = ["#14b8a6", "#ec4899", "#84cc16", "#f97316", "#64748b"];

export function colorFor(category: string, index: number): string {
  return CATEGORY_COLORS[category] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]!;
}

export interface Arc {
  category: string;
  count: number;
  color: string;
  /** Visible length of the arc along the circle. */
  length: number;
  /** Distance from the start of the circle to the start of this arc. */
  start: number;
}

/** Turn counts into consecutive arcs of a circle with the given circumference. */
export function buildArcs(items: { category: string; count: number }[], circumference: number): Arc[] {
  const total = items.reduce((n, i) => n + i.count, 0);
  if (total === 0) return [];
  let start = 0;
  return items.map((item, i) => {
    const length = (item.count / total) * circumference;
    const arc: Arc = { category: item.category, count: item.count, color: colorFor(item.category, i), length, start };
    start += length;
    return arc;
  });
}
