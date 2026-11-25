import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Skill, SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { IMPORT_BODY_LIMIT } from './constants.js';

/**
 * Skills module.
 *   GET    /skills                              → list (workspace-scoped)
 *   GET    /skills/stats                        → card-footer stats, keyed by skill id
 *   GET    /skills/:id                          → one skill
 *   POST   /skills                              → create (manual, or confirmed import)
 *   PUT    /skills/:id                          → update / toggle enabled (body/description → new version)
 *   DELETE /skills/:id                          → delete (agent links cascade)
 *   GET    /skills/:id/versions                 → version history (newest first)
 *   POST   /skills/:id/versions/:version/restore → restore a snapshot as a new version
 *   GET    /skills/:id/stats                    → Stats tab
 *   POST   /skills/import/preview               → parse a .md/.zip; persists nothing
 *
 * Linking skills to an agent lives in the agents module (`/agents/:id/skills`).
 */

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const CreateSkillBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  type: SkillType,
  body: z.string().min(1),
  /** Only manual creation or a confirmed import can be requested by a client. */
  source: SkillSource.extract(['manual', 'imported_url']).optional(),
  enabled: z.boolean().optional(),
  message: z.string().max(200).optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  message: z.string().max(200).optional(),
});

const ImportPreviewBody = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1),
});

const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  description: z.string().nullable(),
  message: z.string().nullable(),
  created_at: z.string(),
});

const SkillCardStats = z.object({
  agents: z.number().int(),
  pull_pct: z.number().nullable(),
  accept_pct: z.number().nullable(),
});

const SkillStatsResponse = SkillCardStats.extend({
  findings: z.number().int(),
  used_by: z.array(z.object({ id: z.string(), name: z.string() })),
  by_category: z.array(z.object({ category: z.string(), count: z.number().int() })),
});

const ImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  ignored_files: z.array(z.string()),
  warnings: z.array(z.string()),
  name_conflict: z.boolean(),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.skillsService;

  app.get('/skills', { schema: { response: { 200: z.array(Skill) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/stats', { schema: { response: { 200: z.record(z.string(), SkillCardStats) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.statsAll(workspaceId);
  });

  app.post(
    '/skills/import/preview',
    { bodyLimit: IMPORT_BODY_LIMIT, schema: { body: ImportPreviewBody, response: { 200: ImportPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.importPreview(workspaceId, req.body.filename, req.body.content_base64);
    },
  );

  app.get('/skills/:id', { schema: { params: IdParams, response: { 200: Skill } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody, response: { 201: Skill } } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams, response: { 200: z.array(SkillVersion) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const versions = await service.listVersions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError('Skill not found');
      return versions;
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.get(
    '/skills/:id/stats',
    { schema: { params: IdParams, response: { 200: SkillStatsResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const stats = await service.stats(workspaceId, req.params.id);
      if (!stats) throw new NotFoundError('Skill not found');
      return stats;
    },
  );
}
