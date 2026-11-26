import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
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

const b64 = (s: string | Uint8Array) => Buffer.from(typeof s === 'string' ? s : s).toString('base64');

/**
 * Skills module: CRUD + version history, the import preview (persists nothing,
 * never reads anything but SKILL.md), workspace-scoped linking, and the end-to-end
 * path into a review prompt (enabled+linked ⇒ present, disabled/unlinked ⇒ absent).
 */
d('skills (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const llm = new MockLLMProvider('openai', { structured: EMPTY_REVIEW });

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
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: DIFF }), llm: { openai: llm } },
    });

  it('creates, edits (version bump only on body/description), restores and deletes', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'crud-skill', description: 'Do X.', type: 'rubric', body: 'v1 body' },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ version: 1, enabled: true, source: 'manual' });

    // toggling enabled / renaming does NOT bump
    const toggled = (await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } })).json();
    expect(toggled).toMatchObject({ version: 1, enabled: false });

    // a body edit does, and records the change note
    const edited = (
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'v2 body', message: 'Tightened' } })
    ).json();
    expect(edited.version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].message).toBe('Tightened');
    expect(versions[1].message).toBe('Initial version');

    // restore v1 → NEW version 3 with the old body; history is kept
    const restored = (await app.inject({ method: 'POST', url: `/skills/${skill.id}/versions/1/restore` })).json();
    expect(restored).toMatchObject({ version: 3, body: 'v1 body' });
    const after = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(after[0].message).toBe('Restored from v1');
    expect(after).toHaveLength(3);

    // name must be unique within the workspace
    const dup = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'crud-skill', description: 'dup', type: 'custom', body: 'x' },
    });
    expect(dup.statusCode).toBe(409);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('import preview parses md and zip, lists ignored files, and saves nothing', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;

    const md = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'rule.md', content_base64: b64('---\nname: imported-md\ndescription: Be strict.\n---\n# Rule\nbody') },
    });
    expect(md.statusCode).toBe(200);
    expect(md.json()).toMatchObject({ name: 'imported-md', description: 'Be strict.', type: 'custom', ignored_files: [], name_conflict: false });

    const zip = zipSync({
      'flaky/SKILL.md': strToU8('---\nname: branch-coverage-gate\ndescription: d\n---\nbody'),
      'flaky/scripts/run.sh': strToU8('rm -rf /'),
    });
    const z = (
      await app.inject({ method: 'POST', url: '/skills/import/preview', payload: { filename: 'pack.zip', content_base64: b64(zip) } })
    ).json();
    expect(z.ignored_files).toEqual(['flaky/scripts/run.sh']);
    expect(z.name_conflict).toBe(true); // seeded skill with that name exists
    expect(z.warnings.join(' ')).toMatch(/never read or run/);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.exe', content_base64: b64('MZ') },
    });
    expect(bad.statusCode).toBe(422);

    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);
    await app.close();
  });

  it('rejects linking an unknown skill id to an agent', async () => {
    const app = await makeApp();
    const agent = (await app.inject({ method: 'GET', url: '/agents' })).json()[0];
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: ['00000000-0000-4000-8000-000000000000'] },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('puts enabled+linked skills in the prompt, trace and log — in link order — and nothing else', async () => {
    const app = await makeApp();
    const mk = async (name: string, body: string) =>
      (await app.inject({ method: 'POST', url: '/skills', payload: { name, description: `${name} desc`, type: 'rubric', body } })).json();
    const first = await mk('order-a', 'FIRST-BODY');
    const second = await mk('order-b', 'SECOND-BODY');
    const off = await mk('order-off', 'DISABLED-BODY');
    await app.inject({ method: 'PUT', url: `/skills/${off.id}`, payload: { enabled: false } });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sys' },
      })
    ).json();
    const linked = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [second.id, off.id, first.id] },
    });
    expect(linked.statusCode).toBe(200);

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-repo', fullName: 'acme/skills-repo' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 7, title: 'Add key', author: 'a', branch: 'f', base: 'main',
        headSha: 'abc', additions: 1, deletions: 0, filesCount: 1, status: 'needs_review', body: 'b',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    llm.calls.length = 0;
    const run = (await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } })).json();
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });

    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const user = (call.req as { messages: { role: string; content: string }[] }).messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('## Skills / rules');
    expect(user).toContain('### Skill: order-b');
    expect(user.indexOf('SECOND-BODY')).toBeLessThan(user.indexOf('FIRST-BODY')); // link order
    expect(user).not.toContain('DISABLED-BODY');

    const trace = (await app.inject({ method: 'GET', url: `/runs/${run.runs[0].run_id}/trace` })).json();
    expect(trace.prompt_assembly.skills).toContain('### Skill: order-a');
    expect(trace.prompt_assembly.skills).not.toContain('DISABLED-BODY');
    const lines: string[] = trace.log.map((l: { msg: string }) => l.msg);
    expect(lines.some((m) => /^skills: 2 attached — order-b, order-a/.test(m))).toBe(true);

    // Disable one of the two → the next run has a one-skill block; none → no section/log line.
    await app.inject({ method: 'PUT', url: `/skills/${first.id}`, payload: { enabled: false } });
    await app.inject({ method: 'PUT', url: `/skills/${second.id}`, payload: { enabled: false } });
    llm.calls.length = 0;
    const run2 = (await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } })).json();
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 2 });
    const user2 = (llm.calls.find((c) => c.method === 'completeStructured')!.req as { messages: { role: string; content: string }[] })
      .messages.find((m) => m.role === 'user')!.content;
    expect(user2).not.toContain('## Skills / rules');
    const trace2 = (await app.inject({ method: 'GET', url: `/runs/${run2.runs[0].run_id}/trace` })).json();
    expect(trace2.prompt_assembly.skills ?? null).toBeNull();
    expect(trace2.log.some((l: { msg: string }) => l.msg.startsWith('skills:'))).toBe(false);
    await app.close();
  });

  it('serves card and tab stats', async () => {
    const app = await makeApp();
    const all = (await app.inject({ method: 'GET', url: '/skills/stats' })).json();
    const seeded = (await app.inject({ method: 'GET', url: '/skills' })).json().find((s: { name: string }) => s.name === 'branch-coverage-gate');
    expect(all[seeded.id]).toMatchObject({ agents: 1 });
    const one = (await app.inject({ method: 'GET', url: `/skills/${seeded.id}/stats` })).json();
    expect(one.used_by.map((u: { name: string }) => u.name)).toEqual(['Test Quality Reviewer']);
    expect(Array.isArray(one.by_category)).toBe(true);
    await app.close();
  });
});
