/* Root — sends the user to the first repo's PR list, or onboarding if no repos. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, Button, Skeleton } from "@devdigest/ui";
import { useRepos } from "@/lib/hooks/core";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { s } from "./styles";

export default function HomePage() {
  const t = useTranslations("shell.home");
  const router = useRouter();
  const { data: repos, isLoading } = useRepos();
  const first = repos?.[0];

  // Navigation is a side effect of the loaded data, so it runs after render.
  React.useEffect(() => {
    if (first) router.replace(`/repos/${first.id}/pulls`);
  }, [first, router]);

  return (
    <AppShell crumb={[{ label: t("crumb") }]}>
      <PageContainer title={t("title")} subtitle={t("subtitle")}>
        {isLoading || first ? (
          // Loading, or about to redirect: a skeleton instead of a flash of content.
          <div style={s.skeleton} aria-busy="true">
            <Skeleton height={20} width={240} />
            <Skeleton height={48} />
            <Skeleton height={48} />
            {first && (
              <div>
                <p style={s.redirecting}>{t("redirecting")}</p>
                <Button kind="primary" onClick={() => router.push(`/repos/${first.id}/pulls`)}>
                  {t("open", { name: first.full_name })}
                </Button>
              </div>
            )}
          </div>
        ) : (
          // Not loading and no first repo: none yet, or the list failed to load.
          <EmptyState
            icon="GitBranch"
            title={t("emptyTitle")}
            body={t("emptyBody")}
            cta={t("emptyCta")}
            onCta={() => router.push("/onboarding")}
          />
        )}
      </PageContainer>
    </AppShell>
  );
}
