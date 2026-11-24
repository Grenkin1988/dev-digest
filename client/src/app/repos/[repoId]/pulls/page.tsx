/* PR list route — /repos/:repoId/pulls. Routing only: the screen is
   PullsListView (status filter in ?status). */
"use client";

import { useParams } from "next/navigation";
import { PullsListView } from "./_components/PullsListView";

export default function PullsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <PullsListView repoId={repoId} />;
}
