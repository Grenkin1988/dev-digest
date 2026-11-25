/* The key VALUES are a contract between screens (one screen reads a key,
   another invalidates it). Pin them so a refactor cannot silently split a cache. */
import { describe, it, expect } from "vitest";
import { agentKeys, pullKeys, repoKeys, reviewKeys, settingsKeys, skillKeys } from "./keys";

describe("query keys", () => {
  it("keep the values other screens and tests depend on", () => {
    expect(pullKeys.detail("p1")).toEqual(["pull", "p1"]);
    expect(pullKeys.list("r1")).toEqual(["pulls", "r1"]);
    expect(reviewKeys.forPr("p1")).toEqual(["reviews", "p1"]);
    expect(reviewKeys.activeRuns("p1")).toEqual(["pr-active-runs", "p1"]);
    expect(reviewKeys.runs("p1")).toEqual(["pr-runs", "p1"]);
    expect(reviewKeys.trace("run1")).toEqual(["run-trace", "run1"]);
    expect(agentKeys.detail("a1")).toEqual(["agent", "a1"]);
    expect(agentKeys.skills("a1")).toEqual(["agent-skills", "a1"]);
    expect(skillKeys.all).toEqual(["skills"]);
    expect(skillKeys.detail("s1")).toEqual(["skill", "s1"]);
    expect(skillKeys.versions("s1")).toEqual(["skill-versions", "s1"]);
    expect(repoKeys.all).toEqual(["repos"]);
    expect(settingsKeys.secretsStatus).toEqual(["secrets-status"]);
  });

  it("prefix keys are prefixes of their per-item keys (so invalidation reaches them)", () => {
    expect(pullKeys.list("r1").slice(0, pullKeys.lists.length)).toEqual([...pullKeys.lists]);
    expect(agentKeys.providerModels("openai").slice(0, 1)).toEqual([...agentKeys.providerModelsAll]);
  });
});
