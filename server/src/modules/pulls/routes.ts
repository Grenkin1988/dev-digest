import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PrCommentInput, PrDetail, PrMeta, PrReviewComment } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

const PrByNumberParams = z.object({
  id: z.string().uuid(),
  number: z.coerce.number().int().positive(),
});

/**
 * Pulls module — transport only; all logic lives in PullsService.
 *   GET  /repos/:id/pulls                    → PR list (synced from GitHub at most
 *                                               once per PULL_SYNC_MIN_INTERVAL_MS)
 *   GET  /repos/:id/pulls/by-number/:number  → PR detail by its GitHub number
 *   GET  /pulls/:id                          → PR detail (files, commits, body, usage)
 *   GET  /pulls/:id/comments                 → inline review comments (live from GitHub)
 *   POST /pulls/:id/comments                 → post an inline review comment
 *
 * Review trigger is MANUAL and owned by the reviews module.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.pullsService;

  app.get(
    '/repos/:id/pulls',
    { schema: { params: IdParams, response: { 200: z.array(PrMeta) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/pulls/by-number/:number',
    { schema: { params: PrByNumberParams, response: { 200: PrDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.detailByNumber(workspaceId, req.params.id, req.params.number);
    },
  );

  app.get(
    '/pulls/:id',
    { schema: { params: IdParams, response: { 200: PrDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.detail(workspaceId, req.params.id);
    },
  );

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams, response: { 200: z.array(PrReviewComment) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listComments(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput, response: { 200: PrReviewComment } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.createComment(workspaceId, req.params.id, req.body);
    },
  );
}
