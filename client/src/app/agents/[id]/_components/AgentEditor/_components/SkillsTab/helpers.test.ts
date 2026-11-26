import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterRows, moveItem, orderRows, toggleLink } from "./helpers";

const mk = (id: string, type: Skill["type"] = "rubric"): Skill => ({
  id,
  name: id,
  description: `${id} desc`,
  type,
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
});
const all = [mk("a"), mk("b"), mk("c", "security"), mk("d")];

describe("orderRows", () => {
  it("puts linked skills first in link order, then the rest", () => {
    const rows = orderRows(all, ["c", "a"]);
    expect(rows.map((r) => [r.skill.id, r.linked])).toEqual([
      ["c", true],
      ["a", true],
      ["b", false],
      ["d", false],
    ]);
  });
  it("drops links to skills that no longer exist", () => {
    expect(orderRows(all, ["gone", "b"]).map((r) => r.skill.id)).toEqual(["b", "a", "c", "d"]);
  });
});

describe("moveItem", () => {
  it("moves an item and never mutates the input", () => {
    const src = ["a", "b", "c"];
    expect(moveItem(src, 0, 2)).toEqual(["b", "c", "a"]);
    expect(src).toEqual(["a", "b", "c"]);
  });
  it("clamps the target and ignores a bad source", () => {
    expect(moveItem(["a", "b"], 1, 9)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, -3)).toEqual(["b", "a"]);
    expect(moveItem(["a"], 4, 0)).toEqual(["a"]);
  });
});

describe("toggleLink / filterRows", () => {
  it("appends a new link and removes an existing one", () => {
    expect(toggleLink(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleLink(["a", "b"], "a")).toEqual(["b"]);
  });
  it("filters by name, description or type", () => {
    const rows = orderRows(all, []);
    expect(filterRows(rows, "SECURITY").map((r) => r.skill.id)).toEqual(["c"]);
    expect(filterRows(rows, "b desc").map((r) => r.skill.id)).toEqual(["b"]);
    expect(filterRows(rows, "")).toHaveLength(4);
  });
});
