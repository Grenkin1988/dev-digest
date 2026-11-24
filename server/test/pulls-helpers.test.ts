/**
 * Pulls domain helpers (`modules/pulls/helpers.ts`): the PR-list severity
 * rollup, the sync gate and the row → DTO mappers. Pure — no DB, no mocks.
 */
import { describe, it, expect } from 'vitest';
import {
  isSyncDue,
  needsDiffStats,
  severityCountsByPr,
  toPrDetail,
  toPrMeta,
  type PullRowLike,
  type ReviewFindingLike,
} from '../src/modules/pulls/helpers.js';
import { PULL_SYNC_MIN_INTERVAL_MS } from '../src/modules/pulls/constants.js';

const at = (iso: string) => new Date(iso);

function finding(over: Partial<ReviewFindingLike>): ReviewFindingLike {
  return {
    prId: 'pr1',
    reviewId: 'rv1',
    agentId: 'a1',
    createdAt: at('2026-11-01T00:00:00Z'),
    severity: 'WARNING',
    dismissedAt: null,
    ...over,
  };
}

describe('severityCountsByPr', () => {
  it('counts only the newest review per agent, so re-runs do not double-count', () => {
    const counts = severityCountsByPr([
      finding({ reviewId: 'old', createdAt: at('2026-11-01T00:00:00Z'), severity: 'CRITICAL' }),
      finding({ reviewId: 'old', createdAt: at('2026-11-01T00:00:00Z'), severity: 'CRITICAL' }),
      finding({ reviewId: 'new', createdAt: at('2026-11-02T00:00:00Z'), severity: 'WARNING' }),
    ]);
    expect(counts.get('pr1')).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
  });

  it('sums the latest reviews of different agents', () => {
    const counts = severityCountsByPr([
      finding({ agentId: 'a1', reviewId: 'r1', severity: 'CRITICAL' }),
      finding({ agentId: 'a2', reviewId: 'r2', severity: 'CRITICAL' }),
      finding({ agentId: 'a2', reviewId: 'r2', severity: 'SUGGESTION' }),
    ]);
    expect(counts.get('pr1')).toEqual({ CRITICAL: 2, WARNING: 0, SUGGESTION: 1 });
  });

  it('skips dismissed findings and unknown severities', () => {
    const counts = severityCountsByPr([
      finding({ severity: 'CRITICAL', dismissedAt: at('2026-11-03T00:00:00Z') }),
      finding({ severity: 'INFO' }),
      finding({ severity: 'SUGGESTION' }),
    ]);
    expect(counts.get('pr1')).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 1 });
  });

  it('gives a reviewed PR with no findings all-zero counts, and an unreviewed PR no entry', () => {
    const counts = severityCountsByPr([finding({ prId: 'clean', severity: null })]);
    expect(counts.get('clean')).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(counts.has('never-reviewed')).toBe(false);
  });

  it('keys agent-less reviews by review id', () => {
    const counts = severityCountsByPr([
      finding({ agentId: null, reviewId: 'x', severity: 'WARNING' }),
      finding({ agentId: null, reviewId: 'y', severity: 'WARNING' }),
    ]);
    expect(counts.get('pr1')?.WARNING).toBe(2);
  });
});

describe('isSyncDue', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  it('is due when the repo was never polled', () => {
    expect(isSyncDue(null, now)).toBe(true);
  });
  it('is not due inside the window, due at its end', () => {
    expect(isSyncDue(new Date(now - 1000), now)).toBe(false);
    expect(isSyncDue(new Date(now - PULL_SYNC_MIN_INTERVAL_MS), now)).toBe(true);
  });
});

const row: PullRowLike = {
  id: 'pr1',
  number: 482,
  title: 'Add rate limiting',
  author: 'marisa',
  branch: 'feat/rl',
  base: 'main',
  headSha: 'abc',
  lastReviewedSha: null,
  additions: 3,
  deletions: 1,
  filesCount: 2,
  status: 'open',
  body: 'body',
  openedAt: at('2026-11-01T00:00:00Z'),
  updatedAt: null,
};

describe('mappers', () => {
  it('toPrMeta derives the review status and renders "no data" as null', () => {
    const meta = toPrMeta(row, { score: undefined, usage: undefined, severity: undefined, now: 0 });
    expect(meta.status).toBe('needs_review');
    expect(meta.score).toBeNull();
    expect(meta.cost_usd).toBeNull();
    expect(meta.severity_counts).toBeNull();
    expect(meta.opened_at).toBe('2026-11-01T00:00:00.000Z');
  });

  it('toPrDetail keeps the GitHub merge state and maps files/commits', () => {
    const detail = toPrDetail(
      { ...row, status: 'merged' },
      [{ path: 'a.ts', additions: 1, deletions: 0, patch: null }],
      [{ sha: 's', message: 'm', author: 'x', committedAt: null }],
      { total: { cost_usd: 0.5, tokens_in: 10, tokens_out: 2 }, latestRound: undefined },
    );
    expect(detail.status).toBe('merged');
    expect(detail.files).toHaveLength(1);
    expect(detail.commits[0]!.committed_at).toBeNull();
    expect(detail.cost_usd).toBe(0.5);
    expect(detail.latest_round_cost_usd).toBeNull();
  });

  it('needsDiffStats flags only the zeroed stats of a list-only import', () => {
    expect(needsDiffStats({ additions: 0, deletions: 0, filesCount: 0 })).toBe(true);
    expect(needsDiffStats({ additions: 0, deletions: 0, filesCount: 1 })).toBe(false);
  });
});
