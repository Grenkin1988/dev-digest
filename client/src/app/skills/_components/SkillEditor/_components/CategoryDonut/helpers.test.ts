import { describe, it, expect } from "vitest";
import { buildArcs, colorFor } from "./helpers";

describe("buildArcs", () => {
  it("splits the circle proportionally and chains the arcs", () => {
    const arcs = buildArcs(
      [
        { category: "security", count: 3 },
        { category: "bug", count: 1 },
      ],
      100,
    );
    expect(arcs.map((a) => [a.category, a.length, a.start])).toEqual([
      ["security", 75, 0],
      ["bug", 25, 75],
    ]);
  });

  it("returns nothing for an empty or all-zero list", () => {
    expect(buildArcs([], 100)).toEqual([]);
    expect(buildArcs([{ category: "bug", count: 0 }], 100)).toEqual([]);
  });

  it("uses fixed colours for known categories and a fallback for others", () => {
    expect(colorFor("security", 0)).toBe("var(--crit)");
    expect(colorFor("docs", 0)).not.toBe(colorFor("docs", 1));
  });
});
