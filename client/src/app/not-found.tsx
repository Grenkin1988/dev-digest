/* Unknown URL (or a notFound() call): a friendly screen instead of Next's default 404. */
"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import { ErrorBody } from "./_components/ErrorBody";

export default function NotFound() {
  const t = useTranslations("shell.errors");
  return <ErrorState fullScreen title={t("notFoundTitle")} body={<ErrorBody text={t("notFoundBody")} />} />;
}
