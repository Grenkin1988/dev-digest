/* Config tab: name / description / type / body / enabled + an optional change
   note. `skill` is null on /skills/new (create). The editor is keyed by skill
   id, so switching skills remounts this tab; after a save the form is reset to
   the saved values so "unsaved" clears. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, SearchableSelect, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "@/components/skill-type-badge";
import { useConfirmDeleteSkill } from "../../../../_hooks/useConfirmDeleteSkill";
import { BodyEditor } from "../BodyEditor";
import { canSave, configReducer, formFromSkill, isDirty, toPatch, type ConfigForm } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill | null }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const del = useConfirmDeleteSkill();
  const [form, dispatch] = React.useReducer(configReducer, skill, formFromSkill);
  const set =
    <K extends keyof ConfigForm>(field: K) =>
    (value: ConfigForm[K]) =>
      dispatch({ type: "set", field, value });

  const dirty = isDirty(form, skill);
  const patch = skill ? toPatch(form, skill) : {};
  const contentChanged = "body" in patch || "description" in patch;
  const pending = create.isPending || update.isPending;
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }));

  const save = () => {
    if (!skill) {
      create.mutate(
        {
          name: form.name.trim(),
          description: form.description.trim(),
          type: form.type,
          body: form.body,
          enabled: form.enabled,
          ...(form.message.trim() ? { message: form.message.trim() } : {}),
        },
        {
          onSuccess: (created) => {
            toast.success(t("config.createdToast", { name: created.name }));
            router.replace(`/skills/${created.id}?tab=config`);
          },
        },
      );
      return;
    }
    update.mutate(
      { id: skill.id, patch },
      {
        onSuccess: (saved) => {
          toast.success(t("config.savedToast", { version: saved.version }));
          dispatch({ type: "reset", form: formFromSkill(saved) });
        },
      },
    );
  };

  const remove = () => {
    if (skill) void del.remove(skill, () => router.replace("/skills"));
  };

  const cancel = () => {
    if (skill) dispatch({ type: "reset", form: formFromSkill(skill) });
    else router.push("/skills");
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        {skill && (
          <Badge color="var(--text-secondary)" mono icon="GitCommit">
            {t("editor.version", { version: skill.version })}
          </Badge>
        )}
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={form.enabled} onChange={set("enabled")} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={form.name} onChange={set("name")} placeholder={t("config.namePlaceholder")} />
      </FormField>
      <FormField label={t("config.description")} required hint={t("config.descriptionHint")}>
        <TextInput
          value={form.description}
          onChange={set("description")}
          placeholder={t("config.descriptionPlaceholder")}
        />
      </FormField>
      <FormField label={t("config.type")}>
        <SearchableSelect
          value={form.type}
          onChange={(v) => set("type")(v as SkillType)}
          options={typeOptions}
          placeholder={t("config.typeSearch")}
        />
      </FormField>
      <FormField label={t("config.body")} required>
        <BodyEditor value={form.body} onChange={set("body")} fileName={form.name.trim() || "skill"} dirty={dirty} />
      </FormField>
      {(contentChanged || (!skill && form.body !== "")) && (
        <FormField label={t("config.changeNote")} hint={t("config.changeNoteHint")}>
          <TextInput
            value={form.message}
            onChange={set("message")}
            placeholder={t("config.changeNotePlaceholder")}
          />
        </FormField>
      )}
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={pending || !canSave(form) || (!!skill && !dirty)}>
          {pending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="secondary" onClick={cancel} disabled={pending}>
          {t("config.cancel")}
        </Button>
        <span style={s.spacer} />
        {skill && (
          <Button kind="danger" icon="Trash" onClick={remove} disabled={del.isPending}>
            {t("config.delete")}
          </Button>
        )}
      </div>
      {del.dialog}
    </div>
  );
}
