import { describe, it, expect } from "vitest";
import { resolveTab } from "./helpers";

describe("resolveTab", () => {
  it("keeps a known tab and falls back to config otherwise", () => {
    expect(resolveTab("config")).toBe("config");
    expect(resolveTab("skills")).toBe("skills");
    expect(resolveTab("evals")).toBe("config");
    expect(resolveTab(null)).toBe("config");
  });
});
