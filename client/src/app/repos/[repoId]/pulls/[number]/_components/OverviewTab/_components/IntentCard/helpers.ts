import type { PrIntentResponse } from "@devdigest/shared";
import { SHORT_SHA_LENGTH } from "./constants";

export type IntentViewState = "loading" | "not_derived" | "deriving" | "derived" | "stale" | "error";

export interface ViewStateInput {
  query: { isPending: boolean; isError: boolean; data?: PrIntentResponse | undefined };
  mutation: { isPending: boolean; isError: boolean };
  /** The PR's current head SHA (from the PR detail, which is the freshest view of it). */
  headSha: string;
}

/** Which of the card's regions to show; derived during render from query + mutation state. */
export function deriveViewState({ query, mutation, headSha }: ViewStateInput): IntentViewState {
  if (mutation.isPending) return "deriving";
  if (mutation.isError) return "error";
  if (query.isPending) return "loading";
  if (query.isError) return "error";
  const intent = query.data?.intent;
  if (!intent) return "not_derived";
  const stale = query.data?.stale === true || !intent.head_sha || intent.head_sha !== headSha;
  return stale ? "stale" : "derived";
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, SHORT_SHA_LENGTH) : "unknown";
}
