import { and, desc, eq, max } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow } from '../../db/rows.js';

/**
 * Conventions data-access. Owns the `conventions` table. Workspace-scoped.
 */
export type { ConventionRow };

export interface InsertConvention {
  rule: string;
  category: string;
  evidencePath: string;
  evidenceSnippet: string;
  startLine: number;
  endLine: number;
  confidence: number;
}

export interface UpdateConvention {
  status?: 'pending' | 'accepted' | 'rejected';
  rule?: string;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), desc(t.conventions.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async update(workspaceId: string, id: string, patch: UpdateConvention): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.status !== undefined
          ? { status: patch.status, accepted: patch.status === 'accepted' }
          : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** In one transaction: drop this repo's `pending` rows, then insert the new candidates. */
  async replacePending(repoId: string, workspaceId: string, inserts: InsertConvention[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (inserts.length === 0) return;
      await tx.insert(t.conventions).values(
        inserts.map((c) => ({
          workspaceId,
          repoId,
          rule: c.rule,
          category: c.category,
          evidencePath: c.evidencePath,
          evidenceSnippet: c.evidenceSnippet,
          startLine: c.startLine,
          endLine: c.endLine,
          confidence: c.confidence,
          status: 'pending' as const,
          accepted: false,
        })),
      );
    });
  }

  /** Newest `created_at` among this repo's candidates (the last scan), or null. */
  async lastScanAt(workspaceId: string, repoId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: max(t.conventions.createdAt) })
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
    return row?.at ?? null;
  }
}
