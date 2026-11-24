# Project profile: DevDigest `client/`

How the general rules in `SKILL.md` map onto `client/src` (Next.js 15 App Router, React 19,
TanStack Query, next-intl). Read this before creating or moving files in `client/`. Inside this
repo, where this profile and `SKILL.md` differ, the profile wins.

Verified against the code on 2026-11-24 (skill v1.1.0). If a path below no longer exists,
trust the code and update this file.

## Layout mapping

| Generic (SKILL.md) | DevDigest | Notes |
|--------------------|-----------|-------|
| `app/<route>/_components/` | `src/app/<route>/_components/<Name>/` | Route-private UI. `client/docs/architecture.md:19` |
| route-level constants/helpers | `src/app/repos/[repoId]/pulls/{constants,helpers,styles}.ts` | Next to `page.tsx` |
| `components/` (shared UI) | `src/components/<kebab-name>/` | e.g. `severity-counters`, `diff-viewer`, `app-shell` |
| UI kit / primitives | `@devdigest/ui` → `src/vendor/ui/` | **Do not edit** (coordinate first) |
| contract types / enums | `@devdigest/shared` → `src/vendor/shared/`, re-exported by `src/lib/types.ts` | **Do not edit**. Never redeclare contract types in UI |
| `lib/` infra | `src/lib/api.ts` (client), `src/lib/providers.tsx`, `theme.tsx`, `toast.tsx`, `repo-context.tsx` | |
| data layer (request + hook + key) | `src/lib/hooks/<domain>.ts` (`agents`, `reviews`, `core`, `trace`, `repo-intel`) | All data goes through these hooks over `apiFetch`. `client/AGENTS.md` |
| shared pure utils | `src/lib/<purpose>.ts` (`format-cost.ts`, `github-urls.ts`, `model-label.ts`) | One purpose per file, test beside it. There is no `utils/` folder: keep it that way |
| `features/*` | **not used** | Don't introduce it without a team decision (see SKILL.md §2) |
| user-facing strings | `messages/<locale>/*.json` via next-intl | No literals in components |
| path alias | `@/*` → `src/*` | |

## Component folder convention

Every component with more than one file follows this shape (e.g.
`src/app/agents/_components/AgentCard/`, `src/components/severity-counters/`):

```
AgentCard/
  AgentCard.tsx       # PascalCase file = component name
  index.ts            # export { AgentCard, AgentCard as default } from "./AgentCard";
  constants.ts        # CONSTANT_CASE exports, e.g. MODEL_COLOR
  helpers.ts          # pure functions, e.g. modelColor()
  styles.ts           # `export const s = { … satisfies CSSProperties }` (inline style objects)
  AgentCard.test.tsx
  helpers.test.ts
  _components/        # children used only here, same shape
```

- Folder names: **kebab-case** for top-level shared components in `src/components/`,
  **PascalCase** for component folders inside them and inside `_components/`. Follow the
  neighbours.
- Styles are TS objects in `styles.ts` using design tokens from `@devdigest/ui` (e.g. `SEV`),
  not CSS modules. Severity/colour lookups go through tokens, not hex literals, except for
  documented local maps like `MODEL_COLOR`.
- Iterate contract enums (`SEVERITY_LEVELS`), not `Object.keys` of UI token maps
  (`client/INSIGHTS.md`, 2026-11-21).

## Data layer specifics

- Hooks live in `src/lib/hooks/<domain>.ts` and are marked `"use client"`. Components and pages
  import a hook and never call `apiFetch` or `fetch` directly.
- Every query key comes from the factories in `src/lib/hooks/keys.ts` (`pullKeys`,
  `reviewKeys`, `agentKeys`, `repoKeys`, `settingsKeys`). There are no inline key arrays outside
  that file. They live in one file because invalidation crosses domains (a finished run touches
  reviews, runs, the PR and the PR list). The key VALUES are pinned by `keys.test.ts`, because
  other screens invalidate them (see `client/INSIGHTS.md` on `["pull", prId]` and
  `["reviews", prId]`). Cross-query invalidation after a run goes through
  `useInvalidateAfterRun(prId)` (`lib/hooks/reviews.ts`).
- Next.js is **UI only** here: the backend is the Fastify API (`NEXT_PUBLIC_API_BASE`, default
  `http://localhost:3001`). There are **no Server Actions, no Route Handlers, no `server-only`
  DAL**. Don't add them for data that the Fastify API owns. That would create a second source
  of truth (SKILL.md §8, "pick one data path").

## Next.js specifics

- Route files are meant to be thin (`src/app/agents/page.tsx` renders `<AgentsListView />`).
- Many pages are `"use client"` (SPA-style dashboard over a separate API). This is an
  **accepted trade-off**. Don't convert pages to Server Components as a drive-by. But keep
  `src/app/layout.tsx` a Server Component (it is today), keep helpers/constants/model modules
  directive-free, and don't put browser globals in them.
- Providers are collected in `src/lib/providers.tsx` and rendered inside `layout.tsx`.

## Known deviations (accepted, don't copy into new code)

- **`src/components/app-shell` calls data hooks.** It's app chrome (navigation, command
  palette), not reusable UI, so it may depend on `lib/hooks`. Other shared components in
  `src/components/` take data through props (e.g. `SeverityCounters` gets `counts`, `findings`
  and an `onPopoverOpen` callback; the route-level `PRRow` does the lazy fetch).
- **`src/lib/hooks/index.ts` still exists** as an explicit-export entry for older imports.
  New code imports from the domain file (`@/lib/hooks/agents`).
- **Lint warnings left to pay down** (`pnpm lint` passes with 0 errors): `jsx-a11y` on
  clickable `<div>`s (PR rows, drawers, diff file headers) and `react-hooks/exhaustive-deps`.
  Fix them when you touch the file, with a real `<button>` or a keyboard handler.

Resolved on 2026-11-24 (don't reintroduce): `export *` barrels, thick route files (all routes
now render a `_components/<Name>View`), `../../../` imports (use `@/`), `window.confirm` (use
`useConfirm()` from `@/components/confirm-dialog`), missing `error.tsx` / `not-found.tsx` /
`loading.tsx`, the effect-based form reset in `ConfigTab` (the view keys the editor by agent
id), and a `/reviews` request per PR-list row (the list now carries `severity_counts`).
ESLint (`client/eslint.config.mjs`) enforces the §9 rules: `components/` and `lib/` never
import `app/`, there is no `export *`, and nothing reaches into another component's internals.
