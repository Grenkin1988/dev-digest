import { eq } from 'drizzle-orm';
import type { IntentConfidence, IntentMode, IntentSource, MissingContext, PrIntentRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Everything `derive` persists for one PR (the row's PK is the PR id). */
export interface DerivedIntent {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  mode: IntentMode;
  confidence: IntentConfidence;
  sources: IntentSource[];
  missingContext: MissingContext[];
  provider: string;
  model: string;
  headSha: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

type PrIntentRow = typeof t.prIntent.$inferSelect;

function toRecord(row: PrIntentRow): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    mode: row.mode,
    confidence: row.confidence,
    sources: row.sources,
    missing_context: row.missingContext,
    provider: row.provider,
    model: row.model,
    head_sha: row.headSha,
    derived_at: row.derivedAt.toISOString(),
    cost_usd: row.costUsd,
  };
}

/**
 * Intent data access. Owns `pr_intent`. The caller (IntentService) has already
 * proven the PR belongs to the workspace, so queries are keyed by the PK.
 */
export class IntentRepository {
  constructor(private db: Db) {}

  async getForPull(prId: string): Promise<PrIntentRecord | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row ? toRecord(row) : undefined;
  }

  async upsertDerived(prId: string, d: DerivedIntent): Promise<PrIntentRecord> {
    const values = {
      intent: d.intent,
      inScope: d.inScope,
      outOfScope: d.outOfScope,
      mode: d.mode,
      confidence: d.confidence,
      sources: d.sources,
      missingContext: d.missingContext,
      provider: d.provider,
      model: d.model,
      headSha: d.headSha,
      derivedAt: new Date(),
      tokensIn: d.tokensIn,
      tokensOut: d.tokensOut,
      costUsd: d.costUsd,
    };
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId, ...values })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: values })
      .returning();
    return toRecord(row!);
  }
}
