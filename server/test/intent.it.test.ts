import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { PrIntentResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { IntentRepository, type DerivedIntent } from '../src/modules/intent/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const derived = (over: Partial<DerivedIntent> = {}): DerivedIntent => ({
  intent: 'Adds rate limiting to the comments endpoint.',
  inScope: ['comments route', '429 body'],
  outOfScope: ['auth'],
  mode: 'inferred_from_changes',
  confidence: 'medium',
  sources: [
    { kind: 'title', ref: 'title', chars: 20, truncated: false },
    { kind: 'added_lines', ref: '3 lines', chars: 40, truncated: false },
  ],
  missingContext: [{ ref: 'https://linear.app/acme/issue/ACM-12', reason: 'host_not_allowlisted' }],
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  headSha: 'a1b2c3d',
  tokensIn: 1200,
  tokensOut: 90,
  costUsd: 0.0004,
  ...over,
});

d('Intent layer: pr_intent (Testcontainers pg)', () => {
  let pg: PgFixture;
  let prId: string;
  let headSha: string;

  beforeAll(async () => {
    // startPg runs every migration, so 0013_intent_layer is applied here.
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).limit(1);
    prId = pr!.id;
    headSha = pr!.headSha;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('the migration added the new columns with their defaults', async () => {
    const rows = (await pg.handle.db.execute(
      sql`select column_name, is_nullable from information_schema.columns where table_name = 'pr_intent'`,
    )) as unknown as { column_name: string; is_nullable: string }[];
    const cols = new Map(rows.map((r) => [r.column_name, r]));
    for (const c of [
      'mode', 'confidence', 'sources', 'missing_context', 'provider', 'model',
      'head_sha', 'derived_at', 'tokens_in', 'tokens_out', 'cost_usd',
    ]) {
      expect(cols.has(c), `column ${c}`).toBe(true);
    }
    expect(cols.get('mode')!.is_nullable).toBe('NO');
    expect(cols.get('confidence')!.is_nullable).toBe('NO');
  });

  it('upsert/read round-trips every new column and the enum values', async () => {
    const repo = new IntentRepository(pg.handle.db);
    expect(await repo.getForPull(prId)).toBeUndefined();

    const saved = await repo.upsertDerived(prId, derived());
    const read = await repo.getForPull(prId);
    expect(read).toEqual(saved);
    expect(read).toMatchObject({
      pr_id: prId,
      intent: 'Adds rate limiting to the comments endpoint.',
      in_scope: ['comments route', '429 body'],
      out_of_scope: ['auth'],
      mode: 'inferred_from_changes',
      confidence: 'medium',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      head_sha: 'a1b2c3d',
      cost_usd: 0.0004,
    });
    expect(read!.sources).toEqual(derived().sources);
    expect(read!.missing_context).toEqual(derived().missingContext);
    expect(new Date(read!.derived_at!).toString()).not.toBe('Invalid Date');

    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    expect(row).toMatchObject({ tokensIn: 1200, tokensOut: 90 });
  });

  it('a second upsert replaces the row (one row per PR)', async () => {
    const repo = new IntentRepository(pg.handle.db);
    await repo.upsertDerived(prId, derived({ mode: 'author_description', confidence: 'high', costUsd: null, headSha }));
    const rows = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mode: 'author_description', confidence: 'high', costUsd: null });
  });

  it('GET /pulls/:id/intent serializes the stored record through PrIntentResponse and reports freshness', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const fresh = await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` });
    expect(fresh.statusCode).toBe(200);
    const body = PrIntentResponse.parse(fresh.json());
    expect(body.intent?.mode).toBe('author_description');
    expect(body.intent?.confidence).toBe('high');
    expect(body.current_head_sha).toBe(headSha);
    expect(body.stale).toBe(false);

    await new IntentRepository(pg.handle.db).upsertDerived(prId, derived({ headSha: 'old-sha' }));
    const stale = await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` });
    expect(stale.json().stale).toBe(true);
    await app.close();
  });
});
