# server — insights

Append-only: never overwrite this file. Re-read it before adding an entry so you do not
duplicate one. Date each entry, cite the file it is grounded in, and record only
substantial findings (prefer "X times out after 30 items" over "X can be tricky").
Every entry belongs under one of the 7 sections below. Written by the
`engineering-insights` skill (`.claude/skills/engineering-insights/`).

## What Works

## What Doesn't Work

## Codebase Patterns
- **2026-11-20** — Run cost: `agent_runs.cost_usd` was deliberately removed in commit d45ab0d (migration 0009) and re-added in 0010 together with `batch_id`. The PR-level cost (list + detail) is the sum over the LATEST REVIEW ROUND, meaning the done runs sharing the newest done run's `batch_id`, set once per `runReview` call. A legacy run with a null batch is a round of one. Runs with no stored cost are estimated on read (tokens × `container.priceBook`), and "no data" is `null`, never 0. Reuse `runCost`/`latestRoundUsage`; don't re-derive this. Evidence: `server/src/modules/reviews/cost.ts:51` (latestRoundUsage), `server/src/modules/reviews/service.ts` (runReview batchId).

## Tool & Library Notes
- **2026-11-20** — Most `src/**/*.ts` (incl. `src/vendor/shared/contracts/*`) use CRLF line endings. Scripted find/replace with `\n` anchors silently misses, so normalize EOLs first or use the Edit tool. `npx tsc` inside `server/` resolves a bogus `D:\Workspace\dev-digest\typescript\bin\tsc`; use `pnpm typecheck`. Evidence: `server/src/vendor/shared/contracts/trace.ts`, `server/package.json` (typecheck script).

## Recurring Errors & Fixes
- **2026-11-20** — On Windows, `pnpm test` has 8 PRE-EXISTING failures: `test/git-adapter-safety.test.ts` (expects `/tmp/...` paths and `hello\n`, gets `D:\tmp\...` and CRLF) and `test/indexer-pipeline.test.ts` (ENOENT on temp fixture files). They fail identically on a clean tree, so they are not regressions; judge a change by the other suites. Evidence: `server/test/git-adapter-safety.test.ts` (clonePathFor), `server/test/indexer-pipeline.test.ts` (runFullIndex).

## Session Notes

## Open Questions
