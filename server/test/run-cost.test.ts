import { describe, it, expect } from 'vitest';
import {
  latestRoundUsage,
  runCost,
  totalUsage,
  type RoundRunRow,
} from '../src/modules/reviews/cost.js';

// $1 per 1k tokens in, $2 per 1k out — only 'known' has a price.
const estimate = (model: string, tin: number, tout: number) =>
  model === 'known' ? tin / 1000 + (tout * 2) / 1000 : null;

const row = (o: Partial<RoundRunRow>): RoundRunRow => ({
  prId: 'pr1',
  batchId: null,
  model: 'known',
  tokensIn: 1000,
  tokensOut: 500,
  costUsd: null,
  ...o,
});

describe('runCost', () => {
  it('prefers the stored cost over an estimate', () => {
    expect(runCost(row({ costUsd: 0.5 }), estimate)).toBe(0.5);
  });

  it('estimates from tokens x price when no cost is stored (pre-tracking runs)', () => {
    expect(runCost(row({}), estimate)).toBe(2);
  });

  it('returns null (not 0) with no tokens or an unknown model', () => {
    expect(runCost(row({ tokensIn: 0, tokensOut: 0 }), estimate)).toBeNull();
    expect(runCost(row({ tokensIn: null, tokensOut: null }), estimate)).toBeNull();
    expect(runCost(row({ model: 'mystery' }), estimate)).toBeNull();
    expect(runCost(row({ model: null }), estimate)).toBeNull();
  });
});

describe('latestRoundUsage', () => {
  it('sums only the newest round (same batch id) per PR', () => {
    const usage = latestRoundUsage(
      [
        row({ batchId: 'b2', costUsd: 0.01, tokensIn: 100, tokensOut: 10 }),
        row({ batchId: 'b2', costUsd: 0.02, tokensIn: 200, tokensOut: 20 }),
        row({ batchId: 'b1', costUsd: 9, tokensIn: 9999, tokensOut: 9999 }), // older round
        row({ prId: 'pr2', batchId: 'x', costUsd: 0.5 }),
      ],
      estimate,
    );
    expect(usage.get('pr1')!.cost_usd).toBeCloseTo(0.03);
    expect(usage.get('pr1')).toMatchObject({ tokens_in: 300, tokens_out: 30 });
    expect(usage.get('pr2')!.cost_usd).toBe(0.5);
  });

  it('treats a legacy run without a batch id as a round of one', () => {
    const usage = latestRoundUsage(
      [row({ batchId: null, costUsd: 0.1 }), row({ batchId: null, costUsd: 0.2 })],
      estimate,
    );
    expect(usage.get('pr1')!.cost_usd).toBe(0.1);
  });

  it('reports null cost (not $0) when no run in the round has cost data', () => {
    const usage = latestRoundUsage(
      [row({ batchId: 'b', model: 'mystery' }), row({ batchId: 'b', model: 'mystery' })],
      estimate,
    );
    expect(usage.get('pr1')).toEqual({ cost_usd: null, tokens_in: 2000, tokens_out: 1000 });
  });

  it('skips unknown-cost runs but still sums the known ones', () => {
    const usage = latestRoundUsage(
      [row({ batchId: 'b', costUsd: 0.25 }), row({ batchId: 'b', model: 'mystery' })],
      estimate,
    );
    expect(usage.get('pr1')!.cost_usd).toBe(0.25);
  });
});

describe('totalUsage', () => {
  it('sums every round of a PR (all batches + legacy null-batch runs)', () => {
    const usage = totalUsage(
      [
        row({ batchId: 'b2', costUsd: 0.01, tokensIn: 100, tokensOut: 10 }),
        row({ batchId: 'b1', costUsd: 0.5, tokensIn: 1000, tokensOut: 100 }),
        row({ batchId: null, costUsd: 0.25, tokensIn: 10, tokensOut: 1 }),
        row({ prId: 'pr2', batchId: 'x', costUsd: 0.5 }),
      ],
      estimate,
    );
    expect(usage.get('pr1')!.cost_usd).toBeCloseTo(0.76);
    expect(usage.get('pr1')).toMatchObject({ tokens_in: 1110, tokens_out: 111 });
    expect(usage.get('pr2')!.cost_usd).toBe(0.5);
  });

  it('estimates legacy runs without a stored cost', () => {
    const usage = totalUsage([row({ costUsd: 0.5 }), row({})], estimate);
    expect(usage.get('pr1')!.cost_usd).toBe(2.5);
  });

  it('reports null cost (not $0) when no run has cost data', () => {
    const usage = totalUsage([row({ model: 'mystery' }), row({ model: 'mystery' })], estimate);
    expect(usage.get('pr1')).toEqual({ cost_usd: null, tokens_in: 2000, tokens_out: 1000 });
  });

  it('skips unknown-cost runs but still sums the known ones', () => {
    const usage = totalUsage([row({ costUsd: 0.25 }), row({ model: 'mystery' })], estimate);
    expect(usage.get('pr1')!.cost_usd).toBe(0.25);
  });
});
