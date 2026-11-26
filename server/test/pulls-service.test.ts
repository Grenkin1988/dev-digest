/**
 * PullsService (application layer) with a fake repository and a counting
 * GitHub mock — no Postgres. Pins the local-first rules:
 *   - list syncs from GitHub only when a sync is due, else it is a pure read;
 *   - a sync imports the whole list in ONE batched upsert;
 *   - detail refreshes from GitHub at most once per TTL, then serves Postgres;
 *   - an offline / tokenless GitHub never fails a read.
 */
import { describe, it, expect } from 'vitest';
import type { PrDetail, PrMeta, RepoRef } from '@devdigest/shared';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { PullsService } from '../src/modules/pulls/service.js';
import type { PullsRepository, PullRow, RepoRow } from '../src/modules/pulls/repository.js';
import { DETAIL_REFRESH_TTL_MS, PULL_SYNC_MIN_INTERVAL_MS } from '../src/modules/pulls/constants.js';

class CountingGitHub extends MockGitHubClient {
  listCalls = 0;
  detailCalls = 0;
  override async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    this.listCalls += 1;
    return super.listPullRequests(repo);
  }
  override async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    this.detailCalls += 1;
    return super.getPullRequest(repo, n);
  }
}

const NOW = Date.parse('2026-11-24T12:00:00Z');

function pullRow(over: Partial<PullRow> = {}): PullRow {
  return {
    id: 'pr1',
    workspaceId: 'ws',
    repoId: 'repo1',
    number: 482,
    title: 't',
    author: 'a',
    branch: 'b',
    base: 'main',
    headSha: 'h',
    lastReviewedSha: null,
    additions: 1,
    deletions: 1,
    filesCount: 1,
    status: 'open',
    body: null,
    openedAt: null,
    updatedAt: null,
    ...over,
  };
}

function setup(opts: { lastPolledAt: Date | null; github?: CountingGitHub | null }) {
  const calls = { upsertMany: 0, replaceDetail: 0, touchPolled: 0 };
  const repoRow = {
    id: 'repo1',
    workspaceId: 'ws',
    owner: 'acme',
    name: 'api',
    lastPolledAt: opts.lastPolledAt,
  } as RepoRow;
  const fakeRepo = {
    getRepoForWorkspace: async (ws: string, id: string) =>
      ws === 'ws' && id === 'repo1' ? repoRow : undefined,
    getPrWithRepo: async (ws: string, id: string) =>
      ws === 'ws' && id === 'pr1' ? { pr: pullRow(), repo: repoRow } : undefined,
    getPrByNumber: async (_ws: string, _repo: string, n: number) =>
      n === 482 ? pullRow() : undefined,
    listForRepo: async () => [pullRow()],
    upsertMany: async () => {
      calls.upsertMany += 1;
    },
    touchPolled: async () => {
      calls.touchPolled += 1;
    },
    updateDiffStats: async () => {},
    latestScores: async () => new Map(),
    listReviewFindings: async () => [],
    listFiles: async () => [],
    listCommits: async () => [],
    replaceDetail: async () => {
      calls.replaceDetail += 1;
    },
  } as unknown as PullsRepository;

  let clock = NOW;
  const gh = opts.github === undefined ? new CountingGitHub() : opts.github;
  const service = new PullsService({
    repo: fakeRepo,
    usageForPulls: async () => ({ total: new Map(), latestRound: new Map() }),
    github: async () => {
      if (!gh) throw new Error('GITHUB_TOKEN is not configured');
      return gh;
    },
    estimate: () => null,
    log: { warn: () => {} },
    now: () => clock,
  });
  return { service, gh, calls, advance: (ms: number) => (clock += ms) };
}

describe('PullsService.list', () => {
  it('syncs once (one batched upsert) when the repo was never polled', async () => {
    const { service, gh, calls } = setup({ lastPolledAt: null });
    const list = await service.list('ws', 'repo1');
    expect(list).toHaveLength(1);
    expect(gh!.listCalls).toBe(1);
    expect(calls.upsertMany).toBe(1);
    expect(calls.touchPolled).toBe(1);
  });

  it('is a pure read inside the sync window: no GitHub call, no writes', async () => {
    const { service, gh, calls } = setup({ lastPolledAt: new Date(NOW - 1000) });
    await service.list('ws', 'repo1');
    expect(gh!.listCalls).toBe(0);
    expect(calls.upsertMany).toBe(0);
    expect(calls.touchPolled).toBe(0);
  });

  it('syncs again once the window has passed', async () => {
    const { service, gh } = setup({ lastPolledAt: new Date(NOW - PULL_SYNC_MIN_INTERVAL_MS) });
    await service.list('ws', 'repo1');
    expect(gh!.listCalls).toBe(1);
  });

  it('serves persisted PRs when GitHub is not configured', async () => {
    const { service, calls } = setup({ lastPolledAt: null, github: null });
    await expect(service.list('ws', 'repo1')).resolves.toHaveLength(1);
    expect(calls.upsertMany).toBe(0);
  });

  it('404s a repo from another workspace', async () => {
    const { service } = setup({ lastPolledAt: null });
    await expect(service.list('other-ws', 'repo1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('PullsService.detail', () => {
  it('refreshes from GitHub at most once per TTL, then serves Postgres', async () => {
    const { service, gh, calls, advance } = setup({ lastPolledAt: new Date(NOW) });
    await service.detail('ws', 'pr1');
    await service.detail('ws', 'pr1');
    expect(gh!.detailCalls).toBe(1);
    expect(calls.replaceDetail).toBe(1);

    advance(DETAIL_REFRESH_TTL_MS);
    await service.detail('ws', 'pr1');
    expect(gh!.detailCalls).toBe(2);
  });

  it('serves persisted detail when GitHub is offline', async () => {
    const { service, calls } = setup({ lastPolledAt: new Date(NOW), github: null });
    const detail = await service.detail('ws', 'pr1');
    expect(detail.id).toBe('pr1');
    expect(calls.replaceDetail).toBe(0);
  });

  it('resolves a PR by its GitHub number', async () => {
    const { service } = setup({ lastPolledAt: new Date(NOW) });
    const detail = await service.detailByNumber('ws', 'repo1', 482);
    expect(detail.id).toBe('pr1');
    await expect(service.detailByNumber('ws', 'repo1', 9999)).rejects.toMatchObject({ statusCode: 404 });
  });
});
