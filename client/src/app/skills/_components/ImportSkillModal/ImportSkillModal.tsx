/* ImportSkillModal — two steps. 1) pick a .md or .zip: the server parses it and
   returns the skill core + the archive files it ignored (nothing is saved).
   2) preview: trust warning, editable name/description/type, the rendered body.
   The skill is only created when the user confirms with Save. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, Markdown, Modal, SearchableSelect, TextInput } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview, type ImportPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "@/components/skill-type-badge";
import { ACCEPT } from "./constants";
import { canSaveImport, checkFile, formFromPreview, toBase64, type ImportForm } from "./helpers";
import { s } from "./styles";

export function ImportSkillModal({ onClose, onSaved }: { onClose: () => void; onSaved: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [filename, setFilename] = React.useState("");
  const [parsed, setParsed] = React.useState<ImportPreview | null>(null);
  const [form, setForm] = React.useState<ImportForm | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const check = checkFile(file);
    if (check !== "ok") {
      setError(t(`import.${check}`));
      return;
    }
    setError(null);
    const content_base64 = toBase64(await file.arrayBuffer());
    preview.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (p) => {
          setFilename(file.name);
          setParsed(p);
          setForm(formFromPreview(p));
        },
      },
    );
  };

  const save = () => {
    if (!parsed || !form) return;
    create.mutate(
      {
        name: form.name.trim(),
        description: form.description.trim(),
        type: form.type,
        body: parsed.body,
        source: "imported_url",
        message: `Imported from ${filename}`,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("import.savedToast", { name: skill.name }));
          onSaved(skill);
        },
      },
    );
  };

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }));

  return (
    <Modal width={760} title={t("import.title")} subtitle={t("import.subtitle")} onClose={onClose}>
      {!parsed || !form ? (
        <div style={s.body}>
          <div style={s.drop}>
            <Icon.Upload size={22} aria-hidden />
            <Button
              kind="primary"
              icon="Upload"
              onClick={() => fileRef.current?.click()}
              disabled={preview.isPending}
            >
              {preview.isPending ? t("import.reading") : t("import.choose")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              hidden
              data-testid="skill-file-input"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <p style={s.hint}>{t("import.hint")}</p>
          </div>
          {error && (
            <p style={s.error} role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div style={s.body}>
          <div style={s.trust} role="note">
            <Icon.AlertTriangle size={18} style={s.trustIcon} aria-hidden />
            <div>
              <div style={s.trustTitle}>{t("import.trustTitle")}</div>
              <div style={s.trustBody}>{t("import.trustBody")}</div>
            </div>
          </div>
          {parsed.warnings.map((w) => (
            <p key={w} style={s.notice("warn")}>
              {w}
            </p>
          ))}
          {parsed.name_conflict && <p style={s.notice("crit")}>{t("import.conflict", { name: parsed.name })}</p>}
          <FormField label={t("config.name")} required>
            <TextInput value={form.name} onChange={(name) => setForm({ ...form, name })} />
          </FormField>
          <FormField label={t("config.description")} required hint={t("config.descriptionHint")}>
            <TextInput value={form.description} onChange={(description) => setForm({ ...form, description })} />
          </FormField>
          <FormField label={t("config.type")}>
            <SearchableSelect
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v as SkillType })}
              options={typeOptions}
              placeholder={t("config.typeSearch")}
            />
          </FormField>
          <div style={s.label}>{t("import.previewLabel")}</div>
          <div style={s.rendered}>
            <Markdown>{parsed.body}</Markdown>
          </div>
          {parsed.ignored_files.length > 0 && (
            <>
              <div style={s.label}>{t("import.ignoredTitle")}</div>
              <ul className="mono" style={s.ignored}>
                {parsed.ignored_files.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {parsed && form && (
        <div style={s.footer}>
          <Button
            kind="secondary"
            onClick={() => {
              setParsed(null);
              setForm(null);
            }}
          >
            {t("import.back")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} disabled={create.isPending || !canSaveImport(form)}>
            {create.isPending ? t("import.saving") : t("import.save")}
          </Button>
        </div>
      )}
    </Modal>
  );
}
