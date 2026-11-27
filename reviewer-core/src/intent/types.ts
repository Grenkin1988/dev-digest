import { z } from 'zod';
import type { IntentMode } from '@devdigest/shared';

/**
 * LLM output of the intent classifier. Deliberately NO `.max()` constraints:
 * strict `json_schema` support for them varies by provider, so caps are
 * applied in code afterwards by `clampIntent()`. Confidence and mode are never
 * asked of the model; the server computes them.
 */
export const IntentClassifierOutput = z.object({
  summary: z
    .string()
    .describe('One or two sentences: what this pull request intends to change and why.'),
  in_scope: z
    .array(z.string())
    .describe('Concrete areas or behaviours the pull request changes.'),
  out_of_scope: z
    .array(z.string())
    .describe(
      'Only things the sources explicitly exclude, or clearly adjacent areas the pull request leaves untouched.',
    ),
});
export type IntentClassifierOutput = z.infer<typeof IntentClassifierOutput>;

export interface IntentIssueInput {
  number: number;
  title: string;
  body: string;
}

export interface IntentDocInput {
  path: string;
  content: string;
}

export interface IntentCommitInput {
  subject: string;
  body?: string;
}

export interface IntentFileInput {
  path: string;
  /** 'added' | 'deleted' | 'modified' | 'unknown' */
  status: string;
  additions: number;
  deletions: number;
  /** Hunk headers (`@@ … @@ funcname`), already capped by the caller. */
  hunks: string[];
}

/** Everything the classifier prompt is built from (all strings are untrusted). */
export interface IntentPromptInput {
  mode: IntentMode;
  title: string;
  /** Omitted/ignored in `inferred_from_changes` mode. */
  body?: string;
  issues: IntentIssueInput[];
  docs: IntentDocInput[];
  commits: IntentCommitInput[];
  files: IntentFileInput[];
  /** Number of changed files that did not fit the file cap ("+N more files"). */
  moreFiles?: number;
  /** Small-PR `+` lines excerpt (changes-only mode only). */
  addedLines?: string[];
}

/** Intent handed to the review engine: rendered section text + the filter switch. */
export interface ReviewIntent {
  /** Rendered, human-readable intent (mode, confidence, summary, scope lists). */
  text: string;
  /** Out-of-scope filtering enabled (decided by the caller, never by the model). */
  filter: boolean;
}
