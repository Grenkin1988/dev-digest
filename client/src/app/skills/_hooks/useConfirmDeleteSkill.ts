/* useConfirmDeleteSkill — "Delete <name>?" confirm, then delete + toast.
   Shared by the skill card (list) and the Config tab (editor) so both delete
   paths ask the same question and say the same thing afterwards. Render the
   returned `dialog` once in the caller. */
"use client";

import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/components/confirm-dialog";

export function useConfirmDeleteSkill() {
  const t = useTranslations("skills");
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const del = useDeleteSkill();

  const remove = async (skill: Pick<Skill, "id" | "name">, onDeleted?: () => void) => {
    const ok = await confirm({ title: t("config.deleteTitle", { name: skill.name }), body: t("config.deleteBody") });
    if (!ok) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deletedToast"));
        onDeleted?.();
      },
    });
  };

  return { remove, dialog, isPending: del.isPending, pendingId: del.isPending ? del.variables : undefined };
}
