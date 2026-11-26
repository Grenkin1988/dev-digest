import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills } from "./helpers";

const mk = (name: string, description: string, type: Skill["type"]): Skill => ({
  id: name,
  name,
  description,
  type,
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
});

const list = [
  mk("secret-leakage-gate", "Detects sk_live keys", "security"),
  mk("no-then-chains", "Always use async/await", "convention"),
];

describe("filterSkills", () => {
  it("returns everything for a blank search", () => {
    expect(filterSkills(list, "  ")).toHaveLength(2);
  });
  it("matches name, description and type, case-insensitively", () => {
    expect(filterSkills(list, "LEAKAGE").map((s) => s.name)).toEqual(["secret-leakage-gate"]);
    expect(filterSkills(list, "async").map((s) => s.name)).toEqual(["no-then-chains"]);
    expect(filterSkills(list, "convention").map((s) => s.name)).toEqual(["no-then-chains"]);
    expect(filterSkills(list, "zzz")).toEqual([]);
  });
});
