/**
 * ConventionsService with an in-memory repository, MockGitClient and
 * MockLLMProvider: one LLM call per scan, mechanical grounding of every
 * candidate, line numbers, re-scan semantics and the feature-model override.
 */
import { describe, it, expect } from 'vitest';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ConventionsService } from '../src/modules/conventions/service.js';
import type { ConventionRow, ConventionsRepository, InsertConvention } from '../src/modules/conventions/repository.js';

const WS = 'ws';
const REPO = { id: 'repo1', owner: 'acme', name: 'api', clonePath: '/mock/clones/acme/api' };

const SERVICE_TS = ['import x from "x";', '', 'export class Foo {', '  run() {', '    return 1;', '  }', '}', ''].join('\n');
const FILES = {
  'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
  'src/foo.ts': SERVICE_TS,
  'src/bar.ts': 'export const bar = 1;\n',
};

class FakeRepo {
  rows: ConventionRow[] = [];
  private n = 0;
  async listByRepo(_ws: string, repoId: string) {
    return this.rows.filter((r) => r.repoId === repoId);
  }
  async getById(_ws: string, id: string) {
    return this.rows.find((r) => r.id === id);
  }
  async update(_ws: string, id: string, patch: { status?: ConventionRow['status']; rule?: string }) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return undefined;
    if (patch.rule !== undefined) row.rule = patch.rule;
    if (patch.status !== undefined) {
      row.status = patch.status;
      row.accepted = patch.status === 'accepted';
    }
    return row;
  }
  async replacePending(repoId: string, workspaceId: string, inserts: InsertConvention[]) {
    this.rows = this.rows.filter((r) => !(r.repoId === repoId && r.status === 'pending'));
    for (const c of inserts) {
      this.rows.push({
        id: `c${++this.n}`, workspaceId, repoId, rule: c.rule, category: c.category,
        evidencePath: c.evidencePath, evidenceSnippet: c.evidenceSnippet, startLine: c.startLine,
        endLine: c.endLine, confidence: c.confidence, accepted: false, status: 'pending',
        createdAt: new Date('2026-11-25T10:00:00Z'),
      });
    }
  }
  async lastScanAt(_ws: string, repoId: string) {
    const rs = this.rows.filter((r) => r.repoId === repoId);
    return rs.length ? rs[0]!.createdAt : null;
  }
}

const cand = (over: Record<string, unknown>) => ({
  rule: 'Classes are exported by name',
  category: 'Naming',
  evidence_path: 'src/foo.ts',
  evidence_snippet: 'export class Foo {\n  run() {',
  confidence: 0.8,
  ...over,
});

function setup(fixture: unknown, opts: { clonePath?: string | null; model?: { provider: 'openai' | 'anthropic'; model: string } } = {}) {
  const repo = new FakeRepo();
  const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: fixture } });
  const git = new MockGitClient({ files: FILES });
  const modelCalls: string[] = [];
  const service = new ConventionsService({
    repo: repo as unknown as ConventionsRepository,
    getRepo: async (_ws, id) => (id === REPO.id ? { ...REPO, clonePath: opts.clonePath === undefined ? REPO.clonePath : opts.clonePath } : undefined),
    samples: async () => ['src/foo.ts', 'src/bar.ts', 'src/missing.ts'],
    readFile: (ref, path) => git.readFile(ref, path),
    model: async (ws) => {
      modelCalls.push(ws);
      return opts.model ?? { provider: 'openai', model: 'override-model' };
    },
    llm: async () => llm,
  });
  return { repo, llm, service, modelCalls };
}

describe('ConventionsService.extract', () => {
  it('makes exactly one LLM call with config + sample files, using the feature model', async () => {
    const { llm, service, modelCalls } = setup({ conventions: [cand({})] });
    await service.extract(WS, REPO.id);
    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as { model: string; schemaName: string; messages: { role: string; content: string }[] };
    expect(req.schemaName).toBe('ConventionExtraction');
    expect(req.model).toBe('override-model');
    expect(modelCalls).toEqual([WS]);
    const user = req.messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('config:tsconfig.json');
    expect(user).toContain('file:src/foo.ts');
    expect(user).toContain('file:src/bar.ts');
    expect(user).not.toContain('src/missing.ts');
  });

  it('drops fake-snippet and unknown-path candidates, and computes line numbers', async () => {
    const { service } = setup({
      conventions: [
        cand({}),
        cand({ rule: 'Fake snippet', evidence_snippet: 'this is not in the file' }),
        cand({ rule: 'Unknown path', evidence_path: 'src/nope.ts' }),
        cand({ rule: 'Not a provided file', evidence_path: 'README.md' }),
      ],
    });
    const out = await service.extract(WS, REPO.id);
    expect(out.conventions).toHaveLength(1);
    expect(out.conventions[0]).toMatchObject({
      rule: 'Classes are exported by name',
      category: 'naming',
      evidence_path: 'src/foo.ts',
      start_line: 3,
      end_line: 4,
      status: 'pending',
      accepted: false,
    });
    expect(out.last_scan_at).toBe('2026-11-25T10:00:00.000Z');
  });

  it('re-scan keeps accepted rows and does not duplicate them', async () => {
    const { service, repo } = setup({
      conventions: [cand({}), cand({ rule: 'Return early', evidence_snippet: 'return 1;' })],
    });
    const first = await service.extract(WS, REPO.id);
    expect(first.conventions).toHaveLength(2);
    await service.patch(WS, first.conventions[0]!.id, { status: 'accepted' });
    await service.patch(WS, first.conventions[1]!.id, { status: 'rejected' });

    const second = await service.extract(WS, REPO.id);
    expect(second.conventions).toHaveLength(2); // both decided rows kept, no new pending duplicates
    expect(repo.rows.filter((r) => r.status === 'pending')).toHaveLength(0);
    expect(second.conventions.map((c) => c.status).sort()).toEqual(['accepted', 'rejected']);
  });

  it('wraps LLM failures as extraction_failed (502)', async () => {
    const { service } = setup({ conventions: 'not-an-array' });
    await expect(service.extract(WS, REPO.id)).rejects.toMatchObject({ code: 'extraction_failed', statusCode: 502 });
  });

  it('404 for an unknown repo, 409 when not cloned', async () => {
    const { service } = setup({ conventions: [] });
    await expect(service.extract(WS, 'nope')).rejects.toMatchObject({ statusCode: 404 });
    const { service: s2 } = setup({ conventions: [] }, { clonePath: null });
    await expect(s2.extract(WS, REPO.id)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('ConventionsService.patch', () => {
  it('edits status and rule; 404 for an unknown row', async () => {
    const { service } = setup({ conventions: [cand({})] });
    const [c] = (await service.extract(WS, REPO.id)).conventions;
    const edited = await service.patch(WS, c!.id, { status: 'accepted', rule: 'Edited rule' });
    expect(edited).toMatchObject({ status: 'accepted', accepted: true, rule: 'Edited rule' });
    const back = await service.patch(WS, c!.id, { status: 'pending' });
    expect(back).toMatchObject({ status: 'pending', accepted: false, rule: 'Edited rule' });
    await expect(service.patch(WS, 'ghost', { status: 'accepted' })).rejects.toMatchObject({ statusCode: 404 });
  });
});
