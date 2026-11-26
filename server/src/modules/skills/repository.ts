import { and, asc, desc, eq, gte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';
import type { StatsInput } from './helpers.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`; reads `agent_skills`,
 * `agents`, `agent_runs`, `reviews` and `findings` for the Stats tab.
 * Workspace-scoped throughout. The agent-side link table is written by the
 * agents repository.
 */
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  evidenceFiles?: string[];
  enabled?: boolean;
  /** Change note for version 1. */
  message: string;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.createdAt), asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async getByName(workspaceId: string, name: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row;
  }

  /** Insert a skill AND record version 1 in skill_versions. */
  async insert(v: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: v.workspaceId,
          name: v.name,
          description: v.description,
          type: v.type,
          source: v.source,
          body: v.body,
          ...(v.evidenceFiles !== undefined ? { evidenceFiles: v.evidenceFiles } : {}),
          enabled: v.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
        })
        .returning();
      await tx.insert(t.skillVersions).values({
        skillId: row!.id,
        version: INITIAL_SKILL_VERSION,
        body: v.body,
        description: v.description,
        message: v.message,
      });
      return row!;
    });
  }

  /**
   * Update a skill. When `bumpVersion` is set the version increments and the new
   * body/description is snapshotted into skill_versions with `message`.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
    bump: { message: string } | null,
  ): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
      if (!existing) return undefined;
      const nextVersion = bump ? existing.version + 1 : existing.version;
      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bump ? { version: nextVersion } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (bump && row) {
        await tx.insert(t.skillVersions).values({
          skillId: id,
          version: nextVersion,
          body: row.body,
          description: row.description,
          message: bump.message,
        });
      }
      return row;
    });
  }

  /** Delete a skill (scoped to workspace); versions and agent links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  // ---- skill_versions -----------------------------------------------------

  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  // ---- stats inputs -------------------------------------------------------

  /** Raw rows for the Stats maths (see `computeSkillStats`): links, done runs and findings since `since`. */
  async statsInput(workspaceId: string, since: Date): Promise<StatsInput> {
    const links = await this.db
      .select({
        skillId: t.agentSkills.skillId,
        agentId: t.agentSkills.agentId,
        agentName: t.agents.name,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.skills.workspaceId, workspaceId));

    const runs = await this.db
      .select({ agentId: t.agentRuns.agentId, prId: t.agentRuns.prId })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.status, 'done'),
          gte(t.agentRuns.ranAt, since),
        ),
      );

    const findings = await this.db
      .select({
        agentId: t.reviews.agentId,
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.workspaceId, workspaceId), gte(t.reviews.createdAt, since)));

    return { links, runs, findings };
  }
}
