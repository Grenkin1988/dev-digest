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
- **2026-11-24** — Layering: routes no longer touch `container.db`, and services no longer take the `Container`. Every service is built once in the composition root from a narrow deps interface (`reviews/deps.ts`, `repo-intel/deps.ts`, `PullsServiceDeps`). `pnpm lint` turns a Drizzle / `db/schema` / repository import in `routes.ts`, and a `fastify` / Drizzle / Container import in a service, into errors. If you need another module's data, inject a function from the Container: that's how pulls gets `usageForPulls`. Don't deep-import the module's repository. Evidence: `server/src/platform/container.ts:153` (pullsService), `server/src/modules/pulls/service.ts:26` (usageForPulls dep), `server/eslint.config.mjs:44` (routes rule).
- **2026-11-24** — `GET /repos/:id/pulls` re-syncs from GitHub only when `repos.last_polled_at` is older than `PULL_SYNC_MIN_INTERVAL_MS`, so the 60 s client poll is a pure Postgres read. Before this change, every call did one upsert per PR plus up to 10 `getPullRequest` back-fills. `GET /pulls/:id` re-fetches from GitHub at most once per `DETAIL_REFRESH_TTL_MS` per PR. That TTL is an in-memory `Map` per API process (there's no column for it), so a restart refreshes once more. The files/commits replace runs in one transaction. Tests that expect a fresh import on GET only work while `last_polled_at` is null. Use `POST /repos/:id/poll` to force a sync. Evidence: `server/src/modules/pulls/service.ts:52` (isSyncDue gate), `server/src/modules/pulls/service.ts:42` (detailRefreshedAt), `server/src/modules/pulls/repository.ts:166` (replaceDetail transaction).
- **2026-11-24** — The `schema.response` contracts are enforced at runtime: fastify-type-provider-zod's serializer parses the reply. A DB value outside a contract enum is no longer passed through; the route answers 500 (`response serialization failed`). `GET /pulls/:id/reviews` deliberately has no response schema, because `reviews.verdict` is free text in Postgres. Before you add a response schema to a read of loosely typed columns, check that the DTO type matches the contract under `pnpm typecheck` (tsc caught `verdict: string`), and run the `*.it.test.ts`. Evidence: `server/src/modules/reviews/routes.ts:131` (no response schema), `server/src/app.ts:129` (setErrorHandler).

## Tool & Library Notes
- **2026-11-20** — Most `src/**/*.ts` (incl. `src/vendor/shared/contracts/*`) use CRLF line endings. Scripted find/replace with `\n` anchors silently misses, so normalize EOLs first or use the Edit tool. `npx tsc` inside `server/` resolves a bogus `D:\Workspace\dev-digest\typescript\bin\tsc`; use `pnpm typecheck`. Evidence: `server/src/vendor/shared/contracts/trace.ts:66` (cost_usd), `server/package.json:11` (typecheck script).
- **2026-11-24** — `npx eslint` resolves the same bogus `D:\Workspace\dev-digest\eslint\bin\eslint.js` as `npx tsc`, in both `server/` and `client/`; use `pnpm lint`. A `--stdin --stdin-filename src/modules/demo/routes.ts` run (`pnpm exec eslint`) is the quick way to check that a per-ring `no-restricted-imports` block really applies to a path. Flat-config `files` globs are matched relative to the package. Evidence: `server/package.json:12` (lint script), `server/eslint.config.mjs:44` (routes block).

## Recurring Errors & Fixes
- **2026-11-20** (fixed 2026-11-24) — Up to 2026-11-24, 8 server tests failed on Windows. The causes:
  - `git-adapter-safety` compared the clone path to a POSIX literal; the adapter resolves it to `D:\tmp\...`.
  - It also compared the README to `hello\n`, but git checks it out with CRLF.
  - `indexer-pipeline`'s `writeFileAt` found the parent directory with `lastIndexOf('/')`, which never matches the backslashes `join()` emits. The fixture dirs were never created, hence ENOENT.

  They now use `resolve()`, `\r\n` normalisation and `dirname()`. The whole suite passes on Windows, so any red test is a real regression. Evidence: `server/test/git-adapter-safety.test.ts:47` (resolve), `server/test/indexer-pipeline.test.ts:143` (dirname).

## Session Notes

## Open Questions
