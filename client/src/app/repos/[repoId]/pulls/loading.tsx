import { PullsListSkeleton } from "./_components/PullsListView";

/** Route-level fallback while the PR list segment loads. */
export default function Loading() {
  return <PullsListSkeleton />;
}
