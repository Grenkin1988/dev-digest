import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

const PollResult = z.object({ synced: z.number().int(), reviewTriggered: z.literal(false) });

/**
 * Polling module. MANUAL refresh that ONLY syncs the PR list (new/updated PRs
 * appear, head_sha updates) through PullsService. It never triggers a review:
 * review is manual (Run Review, owned by the reviews module).
 *
 *   POST /repos/:id/poll  → sync PR list from GitHub, bump last_polled_at
 */
export default async function pollingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.post(
    '/repos/:id/poll',
    { schema: { params: IdParams, response: { 200: PollResult } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const { synced } = await container.pullsService.syncFromGitHub(workspaceId, req.params.id);
      return { synced, reviewTriggered: false as const };
    },
  );
}
