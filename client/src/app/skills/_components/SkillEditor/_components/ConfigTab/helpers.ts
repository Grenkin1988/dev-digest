import type { Skill, SkillType } from "@devdigest/shared";
import type { UpdateSkillInput } from "@/lib/hooks/skills";

export interface ConfigForm {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  /** Change note for the next version (only sent when body/description changed). */
  message: string;
}

export type ConfigAction =
  | { type: "set"; field: keyof ConfigForm; value: ConfigForm[keyof ConfigForm] }
  | { type: "reset"; form: ConfigForm };

export function formFromSkill(skill: Skill | null): ConfigForm {
  return {
    name: skill?.name ?? "",
    description: skill?.description ?? "",
    type: skill?.type ?? "custom",
    body: skill?.body ?? "",
    enabled: skill?.enabled ?? true,
    message: "",
  };
}

export function configReducer(state: ConfigForm, action: ConfigAction): ConfigForm {
  if (action.type === "reset") return action.form;
  return { ...state, [action.field]: action.value };
}

/** Name, description and body are required; whitespace-only does not count. */
export function canSave(form: ConfigForm): boolean {
  return form.name.trim() !== "" && form.description.trim() !== "" && form.body.trim() !== "";
}

/** True when the form differs from the saved skill (the change note alone does not count). */
export function isDirty(form: ConfigForm, skill: Skill | null): boolean {
  const base = formFromSkill(skill);
  return (
    form.name !== base.name ||
    form.description !== base.description ||
    form.type !== base.type ||
    form.body !== base.body ||
    form.enabled !== base.enabled
  );
}

/** Only the changed fields; the note rides along only with a body/description change. */
export function toPatch(form: ConfigForm, skill: Skill): UpdateSkillInput["patch"] {
  const patch: UpdateSkillInput["patch"] = {};
  if (form.name.trim() !== skill.name) patch.name = form.name.trim();
  if (form.description.trim() !== skill.description) patch.description = form.description.trim();
  if (form.type !== skill.type) patch.type = form.type;
  if (form.body !== skill.body) patch.body = form.body;
  if (form.enabled !== skill.enabled) patch.enabled = form.enabled;
  const content = patch.description !== undefined || patch.body !== undefined;
  if (content && form.message.trim()) patch.message = form.message.trim();
  return patch;
}
