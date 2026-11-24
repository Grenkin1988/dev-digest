import { PrDetailSkeleton } from "./_components/PrDetailView";

/** Route-level fallback while the PR detail segment loads. */
export default function Loading() {
  return <PrDetailSkeleton />;
}
