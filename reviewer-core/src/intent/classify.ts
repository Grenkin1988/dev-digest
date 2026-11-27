import type { ChatMessage, LLMProvider } from '@devdigest/shared';
import { IntentClassifierOutput } from './types.js';

export const MAX_SUMMARY_CHARS = 400;
export const MAX_LIST_ITEMS = 8;
export const MAX_ITEM_CHARS = 160;

function clampList(items: string[]): string[] {
  return items
    .map((s) => s.trim().slice(0, MAX_ITEM_CHARS))
    .filter((s) => s.length > 0)
    .slice(0, MAX_LIST_ITEMS);
}

/** Pure post-parse caps (the LLM schema has no `.max()`, see `types.ts`). */
export function clampIntent(out: IntentClassifierOutput): IntentClassifierOutput {
  return {
    summary: out.summary.trim().slice(0, MAX_SUMMARY_CHARS),
    in_scope: clampList(out.in_scope),
    out_of_scope: clampList(out.out_of_scope),
  };
}

export interface ClassifyIntentInput {
  llm: LLMProvider;
  model: string;
  prompt: ChatMessage[];
  sessionId?: string;
  maxRetries?: number;
}

export interface ClassifyIntentResult {
  output: IntentClassifierOutput;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  raw: string;
}

/** One structured LLM call, then clamping. No I/O beyond the injected provider. */
export async function classifyIntent(input: ClassifyIntentInput): Promise<ClassifyIntentResult> {
  const res = await input.llm.completeStructured<IntentClassifierOutput>({
    model: input.model,
    schema: IntentClassifierOutput,
    schemaName: 'IntentClassifierOutput',
    messages: input.prompt,
    maxRetries: input.maxRetries ?? 2,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });
  return {
    output: clampIntent(res.data),
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    raw: res.raw,
  };
}
