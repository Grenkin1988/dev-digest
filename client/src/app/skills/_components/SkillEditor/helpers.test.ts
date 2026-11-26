import { describe, it, expect } from "vitest";
import { estimateTokens, formatDate, isSameText, lineDiff, resolveTab } from "./helpers";

describe("resolveTab", () => {
  it("accepts the four tabs and falls back to config", () => {
    expect(resolveTab("versions")).toBe("versions");
    expect(resolveTab("evals")).toBe("config");
    expect(resolveTab(null)).toBe("config");
  });
});

describe("estimateTokens / formatDate", () => {
  it("rounds up at about 4 chars per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });
  it("cuts the date part", () => {
    expect(formatDate("2026-05-30T10:11:12.000Z")).toBe("2026-05-30");
  });
});

describe("lineDiff", () => {
  it("marks removed and added lines and keeps shared ones", () => {
    const d = lineDiff("a\nb\nc", "a\nB\nc\nd");
    expect(d).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });
  it("reports identical text, ignoring CRLF", () => {
    expect(isSameText(lineDiff("x\r\ny", "x\ny"))).toBe(true);
    expect(isSameText(lineDiff("x", "y"))).toBe(false);
  });
});
