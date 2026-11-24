/* Route error boundary for every screen under the root layout. Next renders it
   when a component below throws during render; `reset` re-renders the segment.
   Event-handler / async errors don't land here: they surface through the
   query/mutation error toasts (lib/providers.tsx). */
"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import { ErrorBody } from "./_components/ErrorBody";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("shell.errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState fullScreen title={t("title")} body={<ErrorBody text={t("body")} />} onRetry={reset} />;
}
