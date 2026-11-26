import { eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SettingsRow } from './helpers.js';

/** Settings data access (non-secret prefs, key/value rows). Workspace-scoped. */
export class SettingsRepository {
  constructor(private db: Db) {}

  listForWorkspace(workspaceId: string): Promise<SettingsRow[]> {
    return this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
  }

  /** Upsert every key of `values` for this user in one statement. */
  async upsertMany(workspaceId: string, userId: string, values: Record<string, unknown>): Promise<void> {
    const rows = Object.entries(values).map(([key, value]) => ({ workspaceId, userId, key, value }));
    if (rows.length === 0) return;
    await this.db
      .insert(t.settings)
      .values(rows)
      .onConflictDoUpdate({
        target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
        set: { value: sqlExcludedValue },
      });
  }
}

// Each row updates from its own proposed value.
const sqlExcludedValue = sql`excluded.value`;
