/**
 * Run cost attribution — pure helpers (no DB, no I/O, no model calls).
 *
 * New runs persist the cost reported by the engine (`agent_runs.cost_usd`:
 * OpenRouter's real `usage.cost`, else a price-book estimate). Runs stored
 * before cost tracking only have token counts, so on read we fall back to
 * tokens × price via the injected estimator. "No data" is always `null`
 * (rendered as "—"), never 0.
 */

/** USD estimator: (model, tokensIn, tokensOut) → cost, or null for unknown models. */
export type CostEstimator = (model: string, tokensIn: number, tokensOut: number) => number | null;

export interface RunUsageRow {
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

/** Stored cost wins; otherwise estimate from tokens. Zero tokens = no data. */
export function runCost(run: RunUsageRow, estimate: CostEstimator): number | null {
  if (run.costUsd != null) return run.costUsd;
  const tin = run.tokensIn ?? 0;
  const tout = run.tokensOut ?? 0;
  if (!run.model || tin + tout <= 0) return null;
  return estimate(run.model, tin, tout);
}

export interface RoundRunRow extends RunUsageRow {
  prId: string;
  batchId: string | null;
}

export interface RoundUsage {
  cost_usd: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
}

/**
 * Usage of each PR's LATEST review round, i.e. the runs launched together by
 * one "Run review" request (same `batchId`). Legacy runs without a batch id
 * are a round of one.
 *
 * `rows` must be COMPLETED runs only, ordered newest first: the newest
 * completed run picks the round, so a round still in flight keeps showing the
 * previous completed one. Tokens are summed over the round. Cost is summed over
 * the runs that have a cost; if none do, it is null (unknown, not $0).
 */
export function latestRoundUsage(
  rows: RoundRunRow[],
  estimate: CostEstimator,
): Map<string, RoundUsage> {
  const roundOf = new Map<string, { batchId: string | null; rows: RoundRunRow[] }>();
  for (const r of rows) {
    const round = roundOf.get(r.prId);
    if (!round) {
      roundOf.set(r.prId, { batchId: r.batchId, rows: [r] });
    } else if (round.batchId != null && r.batchId === round.batchId) {
      round.rows.push(r);
    }
  }

  const out = new Map<string, RoundUsage>();
  for (const [prId, { rows: runs }] of roundOf) out.set(prId, sumUsage(runs, estimate));
  return out;
}

/**
 * Usage of ALL of a PR's review rounds, i.e. what reviewing the PR has cost
 * so far. `rows` must be COMPLETED runs only, in any order. Uses the same sum
 * rules as `latestRoundUsage`.
 */
export function totalUsage(
  rows: RoundRunRow[],
  estimate: CostEstimator,
): Map<string, RoundUsage> {
  const runsOf = new Map<string, RoundRunRow[]>();
  for (const r of rows) {
    const runs = runsOf.get(r.prId);
    if (runs) runs.push(r);
    else runsOf.set(r.prId, [r]);
  }
  const out = new Map<string, RoundUsage>();
  for (const [prId, runs] of runsOf) out.set(prId, sumUsage(runs, estimate));
  return out;
}

/** Tokens summed; cost summed over runs that have one, else null (unknown, not $0). */
function sumUsage(runs: RunUsageRow[], estimate: CostEstimator): RoundUsage {
  let tokensIn = 0;
  let tokensOut = 0;
  let cost: number | null = null;
  for (const r of runs) {
    tokensIn += r.tokensIn ?? 0;
    tokensOut += r.tokensOut ?? 0;
    const c = runCost(r, estimate);
    if (c != null) cost = (cost ?? 0) + c;
  }
  const hasTokens = tokensIn + tokensOut > 0;
  return {
    cost_usd: cost,
    tokens_in: hasTokens ? tokensIn : null,
    tokens_out: hasTokens ? tokensOut : null,
  };
}
