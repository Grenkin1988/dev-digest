import { describe, it, expect } from "vitest";
import { withParam } from "./helpers";

describe("withParam", () => {
  it("sets, replaces and removes a query param, keeping the others", () => {
    expect(withParam("/p", "", "tab", "diff")).toBe("/p?tab=diff");
    expect(withParam("/p", "tab=overview&trace=r1", "tab", "diff")).toBe("/p?tab=diff&trace=r1");
    expect(withParam("/p", "trace=r1", "trace", null)).toBe("/p");
  });
});
