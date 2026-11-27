import { describe, it, expect } from "vitest";
import type { PrIntentResponse } from "@devdigest/shared";
import { deriveViewState, shortSha } from "./helpers";

const HEAD = "a1b2c3d4e5f6";
const idle = { isPending: false, isError: false };
const record = (over: Partial<NonNullable<PrIntentResponse["intent"]>> = {}) => ({
  pr_id: "p1",
  intent: "summary",
  in_scope: ["a"],
  out_of_scope: [],
  head_sha: HEAD,
  ...over,
});
const loaded = (data: PrIntentResponse) => ({ isPending: false, isError: false, data });

describe("deriveViewState", () => {
  it("maps query + mutation state to one view", () => {
    const fresh: PrIntentResponse = { intent: record(), current_head_sha: HEAD, stale: false };
    expect(deriveViewState({ query: { isPending: true, isError: false }, mutation: idle, headSha: HEAD })).toBe("loading");
    expect(deriveViewState({ query: loaded({ intent: null, current_head_sha: HEAD, stale: false }), mutation: idle, headSha: HEAD })).toBe("not_derived");
    expect(deriveViewState({ query: loaded(fresh), mutation: idle, headSha: HEAD })).toBe("derived");
    expect(deriveViewState({ query: loaded(fresh), mutation: { isPending: true, isError: false }, headSha: HEAD })).toBe("deriving");
    expect(deriveViewState({ query: loaded(fresh), mutation: { isPending: false, isError: true }, headSha: HEAD })).toBe("error");
    expect(deriveViewState({ query: { isPending: false, isError: true }, mutation: idle, headSha: HEAD })).toBe("error");
  });

  it("deriving wins over a previous error and over loading", () => {
    expect(deriveViewState({ query: { isPending: true, isError: false }, mutation: { isPending: true, isError: true }, headSha: HEAD })).toBe("deriving");
  });

  it("stale when the server says so, when the head moved, or when no head sha was recorded", () => {
    expect(deriveViewState({ query: loaded({ intent: record(), current_head_sha: HEAD, stale: true }), mutation: idle, headSha: HEAD })).toBe("stale");
    expect(deriveViewState({ query: loaded({ intent: record(), current_head_sha: HEAD, stale: false }), mutation: idle, headSha: "f00ba12" })).toBe("stale");
    expect(deriveViewState({ query: loaded({ intent: record({ head_sha: null }), current_head_sha: HEAD, stale: false }), mutation: idle, headSha: HEAD })).toBe("stale");
  });

  it("shortSha shortens to 7 chars and tolerates a missing sha", () => {
    expect(shortSha(HEAD)).toBe("a1b2c3d");
    expect(shortSha(null)).toBe("unknown");
  });
});
