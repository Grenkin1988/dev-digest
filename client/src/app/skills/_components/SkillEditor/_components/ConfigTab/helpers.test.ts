import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { canSave, configReducer, formFromSkill, isDirty, toPatch } from "./helpers";

const skill: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating PR quality.",
  type: "rubric",
  source: "manual",
  body: "# Rubric",
  enabled: true,
  version: 5,
};

describe("config form", () => {
  it("starts from the skill (or sensible defaults for a new one)", () => {
    expect(formFromSkill(skill)).toMatchObject({ name: "pr-quality-rubric", type: "rubric", enabled: true });
    expect(formFromSkill(null)).toMatchObject({ name: "", type: "custom", enabled: true, body: "" });
  });

  it("requires name, description and body", () => {
    expect(canSave(formFromSkill(null))).toBe(false);
    expect(canSave({ ...formFromSkill(skill), body: "  " })).toBe(false);
    expect(canSave(formFromSkill(skill))).toBe(true);
  });

  it("reducer sets a field and resets to a form", () => {
    const f = configReducer(formFromSkill(skill), { type: "set", field: "body", value: "x" });
    expect(f.body).toBe("x");
    expect(configReducer(f, { type: "reset", form: formFromSkill(skill) }).body).toBe("# Rubric");
  });

  it("isDirty ignores the change note", () => {
    const f = formFromSkill(skill);
    expect(isDirty({ ...f, message: "note" }, skill)).toBe(false);
    expect(isDirty({ ...f, body: "changed" }, skill)).toBe(true);
    expect(isDirty(formFromSkill(null), null)).toBe(false);
  });

  it("toPatch sends only what changed, and the note only with a content change", () => {
    const f = formFromSkill(skill);
    expect(toPatch({ ...f, enabled: false, message: "ignored" }, skill)).toEqual({ enabled: false });
    expect(toPatch({ ...f, body: "new", message: " Tightened " }, skill)).toEqual({
      body: "new",
      message: "Tightened",
    });
  });
});
