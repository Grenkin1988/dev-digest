/* useFindingsTabRuns — the run wiring of the Findings tab: which runs are live,
   the run history, cancel / delete (behind a confirm dialog), and refreshing
   every dependent query once a live run settles. Keeps FindingsTab itself to
   layout. */
"use client";

import { useTranslations } from "next-intl";
import {
  useCancelRun,
  useDeleteRun,
  useInvalidateAfterRun,
  usePrActiveRuns,
  usePrRuns,
} from "@/lib/hooks/reviews";
import { useConfirm } from "@/components/confirm-dialog";

export function useFindingsTabRuns(prId: string | null) {
  const t = useTranslations("prReview.detail");
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const cancel = useCancelRun();
  const deleteRun = useDeleteRun(prId);
  const invalidate = useInvalidateAfterRun(prId);
  const { confirm, dialog } = useConfirm();

  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);

  return {
    liveRunIds,
    prRuns: prRuns ?? [],
    cancelPending: cancel.isPending,
    cancelAll: () => liveRunIds.forEach((id) => cancel.mutate(id)),
    deleteRun: async (runId: string) => {
      if (await confirm({ title: t("deleteRunTitle"), body: t("deleteRunBody") })) {
        deleteRun.mutate(runId);
      }
    },
    /** A live run settled (done / failed / cancelled): refresh everything it touches. */
    onRunDone: invalidate.all,
    confirmDialog: dialog,
  };
}
