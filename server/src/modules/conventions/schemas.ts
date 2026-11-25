import { z } from 'zod';
import { ConventionCandidate } from '@devdigest/shared';
import { MAX_CANDIDATES } from './constants.js';

/**
 * Route-local schemas. They extend the vendor `ConventionCandidate` contract
 * rather than editing it.
 */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionView = ConventionCandidate.extend({
  status: ConventionStatus,
  category: z.string().nullable(),
  start_line: z.number().int().nullable(),
  end_line: z.number().int().nullable(),
});
export type ConventionView = z.infer<typeof ConventionView>;

export const ConventionList = z.object({
  conventions: z.array(ConventionView),
  last_scan_at: z.string().nullable(),
});
export type ConventionList = z.infer<typeof ConventionList>;

export const PatchConventionBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((b) => b.status !== undefined || b.rule !== undefined, {
    message: 'Provide at least one of: status, rule',
  });
export type PatchConventionBody = z.infer<typeof PatchConventionBody>;

/** What the model must return (one structured call). */
export const ConventionExtraction = z.object({
  conventions: z
    .array(
      z.object({
        rule: z.string().min(1),
        category: z.string().min(1),
        evidence_path: z.string().min(1),
        evidence_snippet: z.string().min(1),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(MAX_CANDIDATES),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;
