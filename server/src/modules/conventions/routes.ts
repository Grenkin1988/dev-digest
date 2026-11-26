import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionList, ConventionView, PatchConventionBody } from './schemas.js';

/**
 * Conventions module.
 *   GET   /repos/:id/conventions          -> saved candidates + last scan time
 *   POST  /repos/:id/conventions/extract  -> one scan (one LLM call), returns the new list
 *   PATCH /conventions/:id                -> status (accept/reject/pending) and/or edited rule
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.conventionsService;

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, response: { 200: ConventionList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams, response: { 200: ConventionList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionBody, response: { 200: ConventionView } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.patch(workspaceId, req.params.id, req.body);
    },
  );
}
