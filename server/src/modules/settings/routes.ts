import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ConnTestRequest,
  ConnTestResult,
  SecretsStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';

/**
 * Settings module — transport only; logic in SettingsService.
 *   GET  /settings                 → current non-secret prefs
 *   GET  /settings/secrets-status  → which provider keys are configured (booleans only)
 *   PUT  /settings                 → upsert prefs (key/value rows)
 *   POST /settings/test-connection → verify a provider key, persist it only if it works
 *
 * Secrets are NOT stored in Postgres — only non-secret prefs.
 */
export default async function settingsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.settingsService;

  app.get('/settings', { schema: { response: { 200: Settings } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId);
  });

  app.get('/settings/secrets-status', { schema: { response: { 200: SecretsStatus } } }, async (req) => {
    await getContext(container, req);
    return service.secretsStatus();
  });

  app.put(
    '/settings',
    { schema: { body: SettingsUpdate, response: { 200: Settings } } },
    async (req) => {
      const { workspaceId, userId } = await getContext(container, req);
      return service.update(workspaceId, userId, req.body);
    },
  );

  app.post(
    '/settings/test-connection',
    {
      schema: { body: ConnTestRequest, response: { 200: ConnTestResult } },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req) => {
      await getContext(container, req);
      return service.testConnection(req.body);
    },
  );
}
