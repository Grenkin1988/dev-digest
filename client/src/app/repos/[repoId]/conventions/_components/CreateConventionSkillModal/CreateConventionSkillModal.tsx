/* CreateConventionSkillModal — turns the accepted conventions into one
   `convention`/`extracted` skill. The body is rebuilt from the checked rules
   until the user edits it by hand. A 409 name clash is shown inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, Modal, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill } from "@/lib/hooks/skills";
import type { ConventionView } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { BODY_ROWS, DEFAULT_SKILL_NAME } from "./constants";
import { buildSkillBody, defaultDescription, evidenceLabel, isSlug } from "./helpers";
import { s } from "./styles";

interface Props {
  fullName: string;
  /** Accepted conventions only. */
  conventions: ConventionView[];
  onClose: () => void;
  onCreated?: (skill: Skill) => void;
}

export function CreateConventionSkillModal({ fullName, conventions, onClose, onCreated }: Props) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const create = useCreateSkill();
  const [name, setName] = React.useState(DEFAULT_SKILL_NAME);
  const [description, setDescription] = React.useState(() => defaultDescription(conventions.length, fullName));
  const [enabled, setEnabled] = React.useState(false);
  const [included, setIncluded] = React.useState<Set<string>>(() => new Set(conventions.map((c) => c.id)));
  const [customBody, setCustomBody] = React.useState<string | null>(null);
  const [taken, setTaken] = React.useState(false);

  const body = customBody ?? buildSkillBody(conventions, name.trim(), included);
  const chosen = conventions.filter((c) => included.has(c.id));
  const slugOk = isSlug(name.trim());
  const canSave = slugOk && description.trim() !== "" && chosen.length > 0 && body.trim() !== "" && !create.isPending;

  const toggle = (id: string, on: boolean) => {
    const next = new Set(included);
    if (on) next.add(id);
    else next.delete(id);
    setIncluded(next);
  };

  const save = () => {
    create.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        type: "convention",
        source: "extracted",
        body,
        enabled,
        evidence_files: [...new Set(chosen.map((c) => c.evidence_path))],
      },
      {
        onSuccess: (skill) => {
          toast.success(t("modal.created", { name: skill.name }));
          onCreated?.(skill);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === 409) setTaken(true);
        },
      },
    );
  };

  return (
    <Modal
      width={760}
      title={t("modal.title")}
      subtitle={t("modal.subtitle", { count: conventions.length, repo: fullName })}
      onClose={onClose}
    >
      <div style={s.body}>
        <div>
          <div style={s.label}>{t("modal.include")}</div>
          <div style={s.includeList}>
            {conventions.map((c) => (
              <Checkbox
                key={c.id}
                checked={included.has(c.id)}
                onChange={(on) => toggle(c.id, on)}
                label={
                  <span>
                    {c.rule}{" "}
                    <span className="mono" style={s.path}>
                      {evidenceLabel(c)}
                    </span>
                  </span>
                }
              />
            ))}
          </div>
        </div>
        <FormField label={t("modal.name")} required hint={t("modal.nameHint")}>
          <TextInput
            value={name}
            onChange={(v) => {
              setName(v);
              setTaken(false);
            }}
          />
          {taken && (
            <p style={s.error} role="alert">
              {t("modal.nameTaken")}
            </p>
          )}
          {!taken && name.trim() !== "" && !slugOk && <p style={s.error}>{t("modal.nameInvalid")}</p>}
        </FormField>
        <FormField label={t("modal.description")} required>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
          <Toggle on={enabled} onChange={setEnabled} />
        </FormField>
        <FormField label={t("modal.body")} required>
          <Textarea mono rows={BODY_ROWS} value={body} onChange={setCustomBody} />
        </FormField>
      </div>
      <div style={s.footer}>
        <Button kind="secondary" onClick={onClose}>
          {t("modal.cancel")}
        </Button>
        <Button kind="primary" icon="Sparkles" onClick={save} disabled={!canSave}>
          {create.isPending ? t("modal.creating") : t("modal.create")}
        </Button>
      </div>
    </Modal>
  );
}
