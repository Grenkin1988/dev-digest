"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

/** Error/not-found body: the explanation plus a way back to the repositories. */
export function ErrorBody({ text }: { text: string }) {
  const t = useTranslations("shell.errors");
  const router = useRouter();
  return (
    <div style={s.wrap}>
      <p style={s.text}>{text}</p>
      <Button kind="ghost" size="sm" onClick={() => router.push("/")}>
        {t("home")}
      </Button>
    </div>
  );
}
