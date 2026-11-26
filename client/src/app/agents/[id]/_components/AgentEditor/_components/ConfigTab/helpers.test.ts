import { describe, it, expect } from "vitest";
import type { Agent } from "@devdigest/shared";
import { configReducer, formFromAgent, toPatch } from "./helpers";

const agent = {
  id: "a1",
  name: "Security",
  description: "d",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "p",
  strategy: "single_pass",
  ci_fail_on: "never",
  repo_intel: true,
  enabled: true,
} as unknown as Agent;

describe("ConfigTab form state", () => {
  it("starts from the editable fields of the agent only", () => {
    const form = formFromAgent(agent);
    expect(form).not.toHaveProperty("id");
    expect(form.name).toBe("Security");
  });

  it("updates one field at a time without touching the others", () => {
    const next = configReducer(formFromAgent(agent), { field: "model", value: "gpt-5" });
    expect(next.model).toBe("gpt-5");
    expect(next.name).toBe("Security");
  });

  it("sends every editable field in the patch", () => {
    expect(Object.keys(toPatch(formFromAgent(agent))).sort()).toEqual([
      "ci_fail_on",
      "description",
      "enabled",
      "model",
      "name",
      "provider",
      "repo_intel",
      "strategy",
      "system_prompt",
    ]);
  });
});
