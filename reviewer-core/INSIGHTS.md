# reviewer-core — insights

Append-only: never overwrite this file. In-place edits are allowed only to add or refresh `file:line` evidence, or to fix an entry that the same session's change made wrong. Re-read it before adding an entry so you do not
duplicate one. Date each entry, cite the `path/file.ts:NN` (symbol) it is grounded in (the line number is mandatory), and record only
substantial findings (prefer "X times out after 30 items" over "X can be tricky").
Every entry belongs under one of the 7 sections below. Written by the
`engineering-insights` skill (`.claude/skills/engineering-insights/`).

## What Works

## What Doesn't Work

## Codebase Patterns
- **2026-11-24** — reviewer-core tests aren't self-contained:
  - `run.test.ts` borrows the server's mocks, and `grounding.test.ts` (moved here from `server/test`) borrows the server's unified-diff parser, both by relative path.
  - `@devdigest/shared` resolves to `server/src/vendor/shared` (vitest alias).

  So `pnpm test` here needs the `server/` tree next to it, but not its node_modules. `OpenRouterProvider` (the one `openai` SDK import) stays in the engine on purpose: the CI agent-runner uses reviewer-core without the server's adapters. Evidence: `reviewer-core/test/grounding.test.ts:5` (parseUnifiedDiff import), `reviewer-core/test/run.test.ts:3` (server mocks), `reviewer-core/vitest.config.ts:9` (shared alias), `reviewer-core/src/llm/openrouter.ts:1` (openai import).
- **2026-11-27** — With an intent the engine requests `ScopedReview` (a local schema; the shared `Finding` contract is unchanged), then runs `groundFindings` → `applyScopeFilter` → score. `scope` is nullish and only an explicit `"out"` can be dropped, so a model that omits the tag (or a one-fixture mock) never loses findings. `groundFindings` and `reduceReviews` became generic over the finding type so the tag survives to the filter. Evidence: `reviewer-core/src/review/scope.ts:13` (ScopedFinding), `reviewer-core/src/review/run.ts:173` (scoped switch).

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
