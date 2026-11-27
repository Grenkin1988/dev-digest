import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Intent module (PR intent + scope).
 *   GET  /pulls/:id/intent         -> stored intent, current head SHA, staleness (no LLM call)
 *   POST /pulls/:id/intent/derive  -> derive now (one cheap-model call), save, return it
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.intentService;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  // Tight per-route limit: each call is an LLM call plus GitHub reads.
  app.post(
    '/pulls/:id/intent/derive',
    {
      schema: { params: IdParams, response: { 200: PrIntentResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.derive(workspaceId, req.params.id);
    },
  );
}
