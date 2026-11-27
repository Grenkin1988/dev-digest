# client — insights

Append-only: never overwrite this file. In-place edits are allowed only to add or refresh `file:line` evidence, or to fix an entry that the same session's change made wrong. Re-read it before adding an entry so you do not
duplicate one. Date each entry, cite the `path/file.ts:NN` (symbol) it is grounded in (the line number is mandatory), and record only
substantial findings (prefer "X times out after 30 items" over "X can be tricky").
Every entry belongs under one of the 7 sections below. Written by the
`engineering-insights` skill (`.claude/skills/engineering-insights/`).

## What Works

## What Doesn't Work
- **2026-11-21** — An absolutely positioned hover popover inside the PR list table or a run accordion gets clipped: `s.tableCard` and `ReviewRunAccordion`'s root both set `overflow: hidden`. Render the popover with `createPortal(…, document.body)` and `position: fixed`, placed from the anchor's `getBoundingClientRect()`, as `SeverityPopover` does. Evidence: `client/src/app/repos/[repoId]/pulls/styles.ts:86` (tableCard), `client/src/components/severity-counters/_components/SeverityPopover/SeverityPopover.tsx:26` (SeverityPopover).

## Codebase Patterns
- **2026-11-20** — Run cost UI goes through ONE component, `RunCostBadge`, with variants `compact` ("$0.014", PR list), `inline` ("9,119 tok · $0.0013", timeline) and `detailed` ("$0.014 8.2K→1.3K", Overview), plus `formatUsd` for the trace COST tile. "No data" must render "—", never "$0.00". The strings live in their own `runCost` namespace, so any component test that renders it (e.g. RunHistory) must pass `runCost` messages to `NextIntlClientProvider`, or next-intl throws missing-message errors. Evidence: `client/src/components/run-cost-badge/RunCostBadge.tsx:38` (RunCostBadge), `client/src/lib/format-cost.ts:13` (formatUsd).
- **2026-11-20** — The design's "PR BRIEF" card does not exist on the Overview tab (it only renders the PR body), so the PR cost rows live in `OverviewTab`. It reads `PrDetail.cost_usd/tokens_*` (total of all completed runs) and `latest_round_*` (latest round only) from the PR detail. That detail must be invalidated when a run settles, or the Overview cost stays stale. Since 2026-11-24 this happens in `useInvalidateAfterRun(prId).all`. Evidence: `client/src/lib/hooks/reviews.ts:68` (useInvalidateAfterRun), `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:23` (OverviewTab).
- **2026-11-21** (updated 2026-11-24) — Counting rule for severity counters: each agent's newest `kind='review'` review, non-dismissed findings only (the same rule as the header `blockers`).
  - PR list: counts arrive with the row as `PrMeta.severity_counts`, computed server-side by `severityCountsByPr`. The row fetches `["reviews", prId]` only when a popover first opens, so the list makes no request per row.
  - Run card and timeline: counts are still derived from the loaded `["reviews", prId]`.
  - `useFindingAction` invalidates both `["reviews", prId]` and the `["pulls"]` prefix, so accept/dismiss updates the list without a reload.
  - If you change the rule, change it on both sides.

  Evidence: `server/src/modules/pulls/helpers.ts:144` (severityCountsByPr), `client/src/components/severity-counters/helpers.ts:42` (latestReviewPerAgent), `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:70` (counts prop).
- **2026-11-24** — The PR detail screen reads the PR through `usePullByNumber`, keyed `["pull-by-number", repoId, number]`. It also seeds `["pull", prId]` with the result. Invalidating only `["pull", prId]` therefore does NOT refresh what the screen shows: the Overview cost stayed stale after a run until `useInvalidateAfterRun` also invalidated the `["pull-by-number"]` prefix. When two keys cache the same entity, invalidate both. `useInvalidateAfterRun.test.tsx` pins that. Evidence: `client/src/lib/hooks/core.ts:130` (usePullByNumber), `client/src/lib/hooks/reviews.ts:82` (byNumberAll).
- **2026-11-24** — The PR list GET re-syncs from GitHub only once per `PULL_SYNC_MIN_INTERVAL_MS` (server). So the list's Refresh button (`useRefreshRepo`) must also `POST /repos/:id/poll`, or new PRs don't show until the window passes. The poll is best-effort: it 4xx/5xxs without a GitHub token, so its error is swallowed. Evidence: `client/src/lib/hooks/core.ts:83` (useRefreshRepo), `server/src/modules/pulls/constants.ts:16` (PULL_SYNC_MIN_INTERVAL_MS).
- **2026-11-24** — The root layout already wraps `<Providers>{children}</Providers>` in `<Suspense fallback={null}>`. That's why the `"use client"` screens can call `useSearchParams` without `next build` failing on a missing Suspense boundary. Keep it. Route `loading.tsx` files give a real skeleton for segment loads. Evidence: `client/src/app/layout.tsx:29` (Suspense).
- **2026-11-21** — The contract `Severity` (`@devdigest/shared`) is only CRITICAL/WARNING/SUGGESTION, but the UI `SEV` token map also has `INFO`. A fixture with `severity: "INFO"` fails `pnpm typecheck` even though vitest passes, so iterate `SEVERITY_LEVELS` rather than `Object.keys(SEV)`. Evidence: `client/src/vendor/ui/primitives/tokens.ts:6` (SEV), `client/src/components/severity-counters/helpers.ts:4` (SEVERITY_LEVELS).

## Tool & Library Notes
- **2026-11-25** — jsdom's `File` has no `arrayBuffer()` (browsers do), so a component that reads an upload with `await file.arrayBuffer()` throws an unhandled rejection in tests. Define it on the test file with `Object.defineProperty(file, "arrayBuffer", …)`, and fire the change inside `await act(async () => …)` or React logs act() warnings. Evidence: `client/src/app/skills/_components/ImportSkillModal/ImportSkillModal.test.tsx:47` (arrayBuffer stub).
- **2026-11-25** — The `Icon` map in `@devdigest/ui` exports `Edit` (an alias of lucide's Pencil), not `Pencil`: `icon: "Pencil"` fails `pnpm typecheck` (vitest stays green). The shared `Donut` always renders values as dollars (`valuePrefix = "$"` + `toFixed(2)`), so a chart of plain counts needs its own SVG donut. Evidence: `client/src/vendor/ui/icons.tsx:147` (Edit: Pencil), `client/src/vendor/ui/charts/Donut.tsx:15` (valuePrefix), `client/src/app/skills/_components/SkillEditor/_components/CategoryDonut/CategoryDonut.tsx:11` (CategoryDonut).
- **2026-11-25** — In Vitest, `beforeEach(() => mock.mockReset())` breaks: the arrow returns the mock, and Vitest treats a returned function as a cleanup hook and calls it with no arguments. Use a block body (`beforeEach(() => { mock.mockReset(); })`). Evidence: `client/src/app/repos/[repoId]/conventions/_components/ConventionCard/ConventionCard.test.tsx:35` (beforeEach).
- **2026-11-27** — `@testing-library/user-event` is not a client dependency, so the RTL guide's `userEvent` examples fail to import. Use `fireEvent` from `@testing-library/react` (or add the package deliberately). Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/IntentCard.test.tsx:2` (fireEvent import).

## Recurring Errors & Fixes
- **2026-11-21** — React dev warning "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)". `borderColor` is itself a shorthand, so pairing it with `borderLeftColor` still mixes the two even though `border` isn't used. It fires when the value changes on a re-render (FindingCard's `focused` flips on j/k or when the severity filter resets focus). Fix: set `borderTopColor`/`borderRightColor`/`borderBottomColor` separately. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:5` (card).

## Session Notes

## Open Questions
