/**
 * repo-intel HTTP module.
 *
 *   GET  /repos/:id/index-state  → IndexState (always works; degraded on missing data)
 *   POST /repos/:id/resync       → enqueues a RESYNC_JOB_KIND job (202 + job id):
 *                                  fetch latest from origin + incremental reindex.
 *
 * This plugin runs once at boot and registers the INDEX / REFRESH / RESYNC job
 * handlers on the container-built indexer, so jobs enqueued by `repos` (after a
 * clone / on refresh) have a handler. Mirrors `RepoService.registerCloneJobHandler()`.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import type { IndexState } from './types.js';

export default async function repoIntelRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const indexer = container.repoIntelService.indexer;
  indexer.registerJobHandlers();

  /** The facade is tenant-agnostic, so check the repo belongs to the caller's workspace. */
  async function requireRepo(workspaceId: string, repoId: string): Promise<void> {
    if (!(await container.reposService.belongsToWorkspace(workspaceId, repoId))) {
      throw new NotFoundError('Repo not found');
    }
  }

  app.get(
    '/repos/:id/index-state',
    { schema: { params: IdParams } },
    async (req): Promise<IndexState> => {
      const { workspaceId } = await getContext(container, req);
      await requireRepo(workspaceId, req.params.id);
      return container.repoIntel.getIndexState(req.params.id);
    },
  );

  app.post(
    '/repos/:id/resync',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      await requireRepo(workspaceId, req.params.id);
      // 202 even when enqueue fails, so the UI can keep polling /index-state;
      // the outcome lands in `repo_index_state` once the worker runs.
      const jobId = await indexer.enqueueResync(workspaceId, req.params.id);
      reply.code(202);
      return jobId
        ? { status: 'accepted', jobId }
        : { status: 'accepted', degraded: true, reason: 'no_handler' };
    },
  );
}
