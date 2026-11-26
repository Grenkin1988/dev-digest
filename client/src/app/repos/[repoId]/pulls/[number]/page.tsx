/* PR Detail route — /repos/:repoId/pulls/:number. Routing only: the screen is
   PrDetailView (tabs in ?tab, open run trace in ?trace). */
"use client";

import { useParams } from "next/navigation";
import { PrDetailView } from "./_components/PrDetailView";

export default function PRDetailPage() {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  return <PrDetailView repoId={repoId} number={number} />;
}
