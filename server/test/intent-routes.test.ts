import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrIntentResponse } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { fakeAuth } from './fake-auth.js';
import { HEAD, PR_ID, makeHarness } from './helpers/intent-harness.js';

/**
 * Hermetic route tests via app.inject(). `ContainerOverrides.intentService`
 * injects a real IntentService over in-memory deps (mock LLM, mock GitHub,
 * MockRepoFileAtRef), so routing, the zod serializer and the global error handler
 * are the real ones while no database is touched.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let app: FastifyInstance;
let harness: ReturnType<typeof makeHarness>;

beforeEach(async () => {
  harness = makeHarness();
  app = await buildApp({ config, overrides: { auth: fakeAuth, intentService: harness.service } });
});

afterEach(async () => {
  await app.close();
  vi.restoreAllMocks();
});

describe('GET /pulls/:id/intent', () => {
  it('no intent yet → { intent: null, stale: false } with the current head sha', async () => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ intent: null, current_head_sha: HEAD, stale: false });
  });

  it('unknown pull → 404 envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/pulls/22222222-2222-4222-8222-222222222222/intent' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('non-uuid id → 422 validation_error', async () => {
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/intent' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });
});

describe('POST /pulls/:id/intent/derive', () => {
  it('derives, stores and returns a record that satisfies PrIntentResponse; a later GET returns it', async () => {
    const res = await app.inject({ method: 'POST', url: `/pulls/${PR_ID}/intent/derive` });
    expect(res.statusCode).toBe(200);
    const body = PrIntentResponse.parse(res.json());
    expect(body.stale).toBe(false);
    expect(body.current_head_sha).toBe(HEAD);
    expect(body.intent).toMatchObject({
      pr_id: PR_ID,
      mode: 'author_description',
      confidence: 'medium',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      head_sha: HEAD,
    });
    expect(body.intent?.sources?.map((s) => s.kind)).toEqual(['title', 'body', 'files', 'hunks', 'commits']);

    const again = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/intent` });
    expect(again.json().intent.intent).toBe(body.intent?.intent);
  });

  it('unknown pull → 404, no model call', async () => {
    const res = await app.inject({ method: 'POST', url: '/pulls/22222222-2222-4222-8222-222222222222/intent/derive' });
    expect(res.statusCode).toBe(404);
    expect(harness.llm.calls).toHaveLength(0);
  });

  it('a failing model → 502 external_service_error', async () => {
    harness.llm.completeStructured = async () => {
      throw new Error('upstream down');
    };
    const res = await app.inject({ method: 'POST', url: `/pulls/${PR_ID}/intent/derive` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('external_service_error');
  });
});
