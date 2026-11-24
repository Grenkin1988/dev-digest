# server — insights

Append-only: never overwrite this file. In-place edits are allowed only to add or refresh `file:line` evidence, or to fix an entry that the same session's change made wrong. Re-read it before adding an entry so you do not
duplicate one. Date each entry, cite the `path/file.ts:NN` (symbol) it is grounded in (the line number is mandatory), and record only
substantial findings (prefer "X times out after 30 items" over "X can be tricky").
Every entry belongs under one of the 7 sections below. Written by the
`engineering-insights` skill (`.claude/skills/engineering-insights/`).

## What Works

## What Doesn't Work

## Codebase Patterns
- **2026-11-20** — Run cost: `agent_runs.cost_usd` was deliberately removed in commit d45ab0d (migration 0009) and re-added in 0010 together with `batch_id`. The PR-level `cost_usd/tokens_*` (list + detail) is the sum over ALL done runs of the PR (`totalUsage`). The detail endpoint also returns `latest_round_*`: the done runs sharing the newest done run's `batch_id`, which is set once per `runReview` call. A legacy run with a null batch is a round of one. Runs with no stored cost are estimated on read (tokens × `container.priceBook`), and "no data" is `null`, never 0. Reuse `runCost`/`totalUsage`/`latestRoundUsage` via `usageForPulls` (one query, both maps); don't re-derive this. Evidence: `server/src/modules/reviews/cost.ts:75` (totalUsage), `server/src/modules/reviews/cost.ts:51` (latestRoundUsage), `server/src/modules/reviews/repository/run.repo.ts:92` (usageForPulls), `server/src/modules/reviews/service.ts:123` (runReview batchId).
- **2026-11-24** — Layering drift: `pulls/routes.ts` and `polling/routes.ts` run Drizzle queries on `container.db` straight from the route, and `pulls/routes.ts` deep-imports `usageForPulls` from `reviews/repository/run.repo.ts`. Every service also takes the whole `Container` and does `new XRepository(container.db)` itself (service locator). These aren't the pattern to copy. `repos/routes.ts` is the thin-route reference. New and changed code follows the `onion-architecture` skill (`.claude/skills/onion-architecture/SKILL.md`, §6 lists the deviations). Evidence: `server/src/modules/pulls/routes.ts:34` (container.db select), `server/src/modules/pulls/routes.ts:11` (usageForPulls import), `server/src/modules/polling/routes.ts:22` (container.db), `server/src/modules/repos/service.ts:33` (new RepoRepository), `server/src/modules/repos/routes.ts:19` (reposRoutes).
- **2026-11-24** — `GET /repos/:id/pulls` is not a pure read: with a GitHub token it upserts every PR one row at a time and backfills diff stats with up to 10 more `getPullRequest` calls. The client polls it every 60 s (`usePulls`) and also calls it on the PR detail page just to resolve number → uuid, so each open tab spends GitHub quota and DB writes every minute. `GET /pulls/:id` likewise deletes and re-inserts `pr_files`/`pr_commits` on every view, with no transaction. Move the sync into a service/job (or `POST /repos/:id/poll`, which duplicates the same upsert loop) before you add more readers. Evidence: `server/src/modules/pulls/routes.ts:49` (list sync loop), `server/src/modules/pulls/routes.ts:93` (BACKFILL_LIMIT), `server/src/modules/pulls/routes.ts:206` (delete prFiles), `server/src/modules/polling/routes.ts:30` (duplicate upsert loop), `client/src/lib/hooks/core.ts:109` (refetchInterval).

## Tool & Library Notes
- **2026-11-20** — Most `src/**/*.ts` (incl. `src/vendor/shared/contracts/*`) use CRLF line endings. Scripted find/replace with `\n` anchors silently misses, so normalize EOLs first or use the Edit tool. `npx tsc` inside `server/` resolves a bogus `D:\Workspace\dev-digest\typescript\bin\tsc`; use `pnpm typecheck`. Evidence: `server/src/vendor/shared/contracts/trace.ts:66` (cost_usd), `server/package.json:11` (typecheck script).

## Recurring Errors & Fixes
- **2026-11-20** — On Windows, `pnpm test` has 8 PRE-EXISTING failures: `test/git-adapter-safety.test.ts` (expects `/tmp/...` paths and `hello\n`, gets `D:\tmp\...` and CRLF) and `test/indexer-pipeline.test.ts` (ENOENT on temp fixture files). They fail identically on a clean tree, so they are not regressions; judge a change by the other suites. Evidence: `server/test/git-adapter-safety.test.ts:41` (clonePathFor), `server/test/indexer-pipeline.test.ts:151` (runFullIndex).

## Session Notes

## Open Questions
