# client — insights

Append-only: never overwrite this file. Re-read it before adding an entry so you do not
duplicate one. Date each entry, cite the file it is grounded in, and record only
substantial findings (prefer "X times out after 30 items" over "X can be tricky").
Every entry belongs under one of the 7 sections below. Written by the
`engineering-insights` skill (`.claude/skills/engineering-insights/`).

## What Works

## What Doesn't Work
- **2026-11-21** — An absolutely positioned hover popover inside the PR list table or a run accordion gets clipped: `s.tableCard` and `ReviewRunAccordion`'s root both set `overflow: hidden`. Render the popover with `createPortal(…, document.body)` and `position: fixed`, placed from the anchor's `getBoundingClientRect()`, as `SeverityPopover` does. Evidence: `client/src/app/repos/[repoId]/pulls/styles.ts` (tableCard), `client/src/components/severity-counters/SeverityCounters.tsx` (SeverityPopover).

## Codebase Patterns
- **2026-11-20** — Run cost UI goes through ONE component, `RunCostBadge`, with variants `compact` ("$0.014", PR list), `inline` ("9,119 tok · $0.0013", timeline) and `detailed` ("$0.014 8.2K→1.3K", Overview), plus `formatUsd` for the trace COST tile. "No data" must render "—", never "$0.00". The strings live in their own `runCost` namespace, so any component test that renders it (e.g. RunHistory) must pass `runCost` messages to `NextIntlClientProvider`, or next-intl throws missing-message errors. Evidence: `client/src/components/run-cost-badge/RunCostBadge.tsx`, `client/src/lib/format-cost.ts` (formatUsd).
- **2026-11-20** — The design's "PR BRIEF" card does not exist on the Overview tab (it only renders the PR body), so the PR cost row lives in `OverviewTab`. It reads `PrDetail.cost_usd/tokens_*` from `usePullDetail` (["pull", prId]), which `page.tsx` `onRunDone` must invalidate, or the Overview cost stays stale after a run. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (onRunDone).
- **2026-11-21** — Severity counters always derive from the `["reviews", prId]` query cache and never fetch. Each PR list row calls `usePrReviews(pr.id)` (PrMeta carries no findings; the server deliberately leaves the breakdown off the list) and sums `latestReviewPerAgent`. `useFindingAction` invalidates that key, so accept/dismiss updates both the list and the run counters with no reload. Counters skip dismissed findings, the same rule as the header `blockers`. Evidence: `client/src/components/severity-counters/helpers.ts`, `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`.
- **2026-11-21** — The contract `Severity` (`@devdigest/shared`) is only CRITICAL/WARNING/SUGGESTION, but the UI `SEV` token map also has `INFO`. A fixture with `severity: "INFO"` fails `pnpm typecheck` even though vitest passes, so iterate `SEVERITY_LEVELS` rather than `Object.keys(SEV)`. Evidence: `client/src/vendor/ui/primitives/tokens.ts` (SEV), `client/src/components/severity-counters/helpers.ts` (SEVERITY_LEVELS).

## Tool & Library Notes

## Recurring Errors & Fixes
- **2026-11-21** — React dev warning "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)". `borderColor` is itself a shorthand, so pairing it with `borderLeftColor` still mixes the two even though `border` isn't used. It fires when the value changes on a re-render (FindingCard's `focused` flips on j/k or when the severity filter resets focus). Fix: set `borderTopColor`/`borderRightColor`/`borderBottomColor` separately. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts` (card).

## Session Notes

## Open Questions
