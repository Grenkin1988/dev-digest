import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { formatSkillBlock } from '../src/modules/skills/helpers.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
const FOO = ['import x from "x";', '', 'export class Foo {', '  run() {', '    return 1;', '  }', '}', ''].join('\n');

const EXTRACTION = {
  conventions: [
    { rule: 'Export classes by name', category: 'naming', evidence_path: 'src/foo.ts', evidence_snippet: 'export class Foo {\n  run() {', confidence: 0.9 },
    { rule: 'Invented rule', category: 'naming', evidence_path: 'src/foo.ts', evidence_snippet: 'nothing like this', confidence: 0.9 },
  ],
};

/** Conventions: extract -> list -> patch -> skill (source extracted) -> agent link -> review prompt. */
d('conventions (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const llm = new MockLLMProvider('openai', {
    structured: EMPTY_REVIEW,
    structuredBySchema: { ConventionExtraction: EXTRACTION },
  });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF, files: { 'src/foo.ts': FOO } }),
        llm: { openai: llm },
      },
    });

  it('extracts, lists, patches, creates an extracted skill and feeds it into a review prompt', async () => {
    const app = await makeApp();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'conv-repo', fullName: 'acme/conv-repo', clonePath: '/mock/clones/acme/conv-repo' })
      .returning();
    await pg.handle.db.insert(t.fileRank).values({
      repoId: repo!.id, filePath: 'src/foo.ts', pagerank: 1, hotness: 0, rank: 1, percentile: 99,
    });

    // empty before the first scan
    const empty = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/conventions` });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ conventions: [], last_scan_at: null });

    // extract: the ungrounded candidate is dropped
    llm.calls.length = 0;
    const ext = await app.inject({ method: 'POST', url: `/repos/${repo!.id}/conventions/extract` });
    expect(ext.statusCode).toBe(200);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    const body = ext.json();
    expect(body.conventions).toHaveLength(1);
    expect(body.last_scan_at).toEqual(expect.any(String));
    const conv = body.conventions[0];
    expect(conv).toMatchObject({
      rule: 'Export classes by name', category: 'naming', evidence_path: 'src/foo.ts',
      start_line: 3, end_line: 4, status: 'pending', accepted: false,
    });
    expect((await app.inject({ method: 'GET', url: `/repos/${repo!.id}/conventions` })).json().conventions).toHaveLength(1);

    // patch: accept, edit, reject, empty body
    const acc = await app.inject({ method: 'PATCH', url: `/conventions/${conv.id}`, payload: { status: 'accepted', rule: 'Edited rule' } });
    expect(acc.json()).toMatchObject({ status: 'accepted', accepted: true, rule: 'Edited rule' });
    expect((await app.inject({ method: 'PATCH', url: `/conventions/${conv.id}`, payload: { status: 'rejected' } })).json()).toMatchObject({ status: 'rejected', accepted: false });
    expect((await app.inject({ method: 'PATCH', url: `/conventions/${conv.id}`, payload: {} })).statusCode).toBe(422);
    expect((await app.inject({ method: 'PATCH', url: '/conventions/00000000-0000-4000-8000-000000000000', payload: { status: 'accepted' } })).statusCode).toBe(404);
    await app.inject({ method: 'PATCH', url: `/conventions/${conv.id}`, payload: { status: 'accepted' } });

    // re-scan: the accepted row is not duplicated
    const again = (await app.inject({ method: 'POST', url: `/repos/${repo!.id}/conventions/extract` })).json();
    expect(again.conventions).toHaveLength(1);
    expect(again.conventions[0].status).toBe('accepted');

    // skill from accepted conventions
    const skillRes = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: 'conv-repo-conventions', description: '1 house convention', type: 'convention', source: 'extracted',
        body: '# conv-repo-conventions\n\n- Edited rule', evidence_files: ['src/foo.ts'],
      },
    });
    expect(skillRes.statusCode).toBe(201);
    const skill = skillRes.json();
    expect(skill).toMatchObject({ type: 'convention', source: 'extracted', evidence_files: ['src/foo.ts'] });

    // link to an agent and run a review: the skill reaches the prompt
    const agent = (
      await app.inject({ method: 'POST', url: '/agents', payload: { name: 'Conv agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sys' } })
    ).json();
    expect((await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill.id] } })).statusCode).toBe(200);
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 9, title: 'x', author: 'a', branch: 'f', base: 'main',
        headSha: 'abc', additions: 1, deletions: 0, filesCount: 1, status: 'needs_review', body: 'b',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    llm.calls.length = 0;
    await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });
    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const user = (call.req as { messages: { role: string; content: string }[] }).messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('## Skills / rules');
    expect(user).toContain(formatSkillBlock({ name: skill.name, description: skill.description, body: skill.body }));
    await app.close();
  });

  it('409 when the repo is not cloned, 404 for an unknown repo', async () => {
    const app = await makeApp();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'no-clone', fullName: 'acme/no-clone' })
      .returning();
    expect((await app.inject({ method: 'POST', url: `/repos/${repo!.id}/conventions/extract` })).statusCode).toBe(409);
    expect((await app.inject({ method: 'GET', url: '/repos/00000000-0000-4000-8000-000000000000/conventions' })).statusCode).toBe(404);
    await app.close();
  });
});
