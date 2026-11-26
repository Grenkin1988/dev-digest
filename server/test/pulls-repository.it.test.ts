/**
 * PullsRepository on real Postgres (Testcontainers): the batched list upsert is
 * idempotent, and `replaceDetail` is atomic: a failing write rolls back, so a
 * PR never ends up with its files deleted and nothing put back.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PrDetail, PrMeta } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { PullsRepository } from '../src/modules/pulls/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const meta = (number: number, title: string): PrMeta => ({
  number,
  title,
  author: 'a',
  branch: 'b',
  base: 'main',
  head_sha: `sha-${number}`,
  additions: 0,
  deletions: 0,
  files_count: 0,
  status: 'open',
});

d('PullsRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: PullsRepository;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'pulls-repo', fullName: 'acme/pulls-repo' })
      .returning();
    repoId = r!.id;
    repo = new PullsRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('upsertMany is idempotent and updates each row from its own values', async () => {
    await repo.upsertMany(workspaceId, repoId, [meta(1, 'one'), meta(2, 'two')]);
    await repo.upsertMany(workspaceId, repoId, [meta(1, 'one v2'), meta(2, 'two v2')]);
    const rows = await repo.listForRepo(repoId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.title).sort()).toEqual(['one v2', 'two v2']);
  });

  it('replaceDetail rolls back when a write fails', async () => {
    const pr = (await repo.getPrByNumber(workspaceId, repoId, 1))!;
    await pg.handle.db.insert(t.prFiles).values({ prId: pr.id, path: 'keep.ts', additions: 1, deletions: 0 });

    const broken = {
      files: [{ path: 'new.ts', additions: 1, deletions: 0, patch: null }],
      // NOT NULL violation on pr_commits.message → the transaction must abort.
      commits: [{ sha: 's', message: null, author: 'x', committed_at: null }],
      body: 'new body',
      additions: 1,
      deletions: 0,
      files_count: 1,
    } as unknown as PrDetail;
    await expect(repo.replaceDetail(pr.id, broken)).rejects.toThrow();

    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    expect(files.map((f) => f.path)).toEqual(['keep.ts']);
    const [after] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr.id));
    expect(after!.body).toBeNull();
  });
});
