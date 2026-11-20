# client — insights

Append-only: never overwrite this file. Re-read it before adding an entry so you do not
duplicate one. Date each entry, cite the file it is grounded in, and record only
substantial findings (prefer "X times out after 30 items" over "X can be tricky").
Every entry belongs under one of the 7 sections below. Written by the
`engineering-insights` skill (`.claude/skills/engineering-insights/`).

## What Works

## What Doesn't Work

## Codebase Patterns
- **2026-11-20** — Run cost UI goes through ONE component, `RunCostBadge`, with variants `compact` ("$0.014", PR list), `inline` ("9,119 tok · $0.0013", timeline) and `detailed` ("$0.014 8.2K→1.3K", Overview), plus `formatUsd` for the trace COST tile. "No data" must render "—", never "$0.00". The strings live in their own `runCost` namespace, so any component test that renders it (e.g. RunHistory) must pass `runCost` messages to `NextIntlClientProvider`, or next-intl throws missing-message errors. Evidence: `client/src/components/run-cost-badge/RunCostBadge.tsx`, `client/src/lib/format-cost.ts` (formatUsd).
- **2026-11-20** — The design's "PR BRIEF" card does not exist on the Overview tab (it only renders the PR body), so the PR cost row lives in `OverviewTab`. It reads `PrDetail.cost_usd/tokens_*` from `usePullDetail` (["pull", prId]), which `page.tsx` `onRunDone` must invalidate, or the Overview cost stays stale after a run. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (onRunDone).

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
