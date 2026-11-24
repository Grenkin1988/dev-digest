---
name: frontend-architecture
description: "Frontend UI architecture and code organization for React + Next.js (App Router) apps: where components, route UI, constants, helpers/utils, lib clients, hooks, business logic and data-access code live; how to split a component into a folder; import direction and boundaries; barrel-file policy; when to promote colocated code to shared. Use whenever you create a new component, screen, route, hook, helper or constants file, decide where a file belongs, split a large component, move logic out of JSX, or review a PR for structure and placement, even if the user doesn't say 'architecture' (e.g. 'where should this go', 'folder structure', 'utils vs helpers', 'where to put business logic', 'this page is too big'). Not for render performance, hook correctness or Next.js caching: use react-best-practices / next-best-practices for those."
metadata:
  version: "1.0.0"
  tags: react, nextjs, architecture, folder-structure, code-organization, frontend
---

# Frontend UI Architecture

Where code lives in a React + Next.js App Router app, and why. Version 1.0.0. Sources and
changelog are in [README.md](README.md).

The aim is a codebase where a developer can guess where a file is before searching. Each rule
below serves one of three goals:

1. **Locality.** Code that changes together lives together, so one change touches one folder.
2. **Direction.** Dependencies flow one way, so a change in a leaf can't break unrelated screens.
3. **Honest sharing.** Something becomes "shared" only when it is actually reused, so shared
   folders stay small and trustworthy.

**Out of scope** (other skills cover these): component purity, derived state, hook rules,
memoization → `react-best-practices`. Next.js file conventions, caching, RSC serialization,
bundling → `next-best-practices`. Here, rendering only comes up where it decides where code goes.

**Project profile:** if the repo has a profile in `references/` (e.g. `references/devdigest.md`
for DevDigest's `client/`), read it first. A profile maps these general rules onto the repo's
actual folders and lists accepted deviations. Where a profile and this file disagree, the
profile wins inside that repo, because consistency with the existing codebase beats
consistency with a guide.

---

## 1. The placement algorithm

When you're about to create or move code, answer these questions in order and stop at the
first "yes":

1. **Is it used by exactly one component?** Keep it in that component's file, or in a sibling
   file inside its folder (`constants.ts`, `helpers.ts`). Don't create a shared module "in
   case".
2. **Is it used by one route/screen only?** Put it in that route's private folder
   (`app/<route>/_components/…`), or next to `page.tsx` for route-level constants and helpers.
3. **Is it used by two or more screens of one feature/domain?** Put it in that feature's module
   (`features/<feature>/…` or the project's equivalent, such as `lib/hooks/<domain>.ts`).
4. **Is it used across features?** Promote it to the shared layer: `components/` for UI,
   `lib/` for configured clients and app infrastructure, `utils/` or `lib/<purpose>.ts` for pure
   functions, `config/` for app-wide constants.
5. **Is it framework or API infrastructure** (API client, query client, providers, i18n setup,
   theme)? Put it in `lib/` (or `app/` for providers wired in a layout). It's shared by
   definition.

**Promote on the second real use, not the first imagined one.** When something moves up a level,
move it, don't copy it, and update the imports in the same change. This is "colocate by default"
(Kent C. Dodds) combined with AHA, "avoid hasty abstractions": a premature shared module
hardens the wrong API and drags unrelated code into it.

For a lookup table ("I have X → where does it go?") with good/bad examples, see
[references/placement-guide.md](references/placement-guide.md).

---

## 2. Top-level layout

Feature-first beats type-first once an app has more than a few screens. A type-first layout
(`components/`, `hooks/`, `utils/` holding everything) scatters one feature across five folders.
A feature-first layout keeps it in one.

```
src/
  app/                  # Next.js routing only: page/layout/loading/error + route-private _components
  components/           # shared UI used by ≥2 features (design-system wrappers, app shell)
  features/<feature>/   # optional for larger apps: api/, components/, hooks/, model/, utils/ per feature
  lib/                  # configured infrastructure: api client, query client, providers, i18n, typed env
  hooks/                # (optional) shared, domain-agnostic hooks: useDebounce, useMediaQuery
  utils/                # (optional) shared pure functions grouped by purpose: format-date.ts, not utils.ts
  config/               # app-wide constants and env-derived settings
  types/                # shared types not owned by a single feature or contract package
```

- Only create the folders you need. An empty `stores/` or `types/` is noise.
- `lib/` ≠ `utils/`. `lib` holds *preconfigured* things with app knowledge (the API client
  instance, the `QueryClient`, providers). `utils` holds *pure, app-agnostic* functions. When in
  doubt: if it imports React, a client SDK or env, it isn't a util.
- Name files and folders by **purpose**, not by **essence**. `format-cost.ts`, `github-urls.ts`
  and `severity.ts` say what they're for. A new `utils.ts`, `helpers/index.ts` or `misc.ts` at a
  shared level becomes a junk drawer. (Inside one component's folder, `helpers.ts` is fine,
  because the folder already names the purpose.)
- Small apps: `app/` + `components/` + `lib/` is enough. Add `features/` when a domain's code
  starts spanning several routes and `lib/` gets crowded. Don't start with Feature-Sliced
  Design's six layers unless the team already knows FSD.

## 3. Splitting a component into a folder

A component that has grown beyond a single file becomes a folder named after the component:

```
AgentCard/
  AgentCard.tsx        # the component: wiring + JSX
  index.ts             # public entry: export { AgentCard } from "./AgentCard"
  constants.ts         # static values used only by this component
  helpers.ts           # pure functions used only by this component (no React)
  styles.ts            # style objects / class maps, if styles aren't in CSS files
  AgentCard.test.tsx   # tests colocated with the code
  helpers.test.ts
  _components/         # children used ONLY by AgentCard (same shape, recursively)
```

**When to split** (any one of these is enough):

- The file mixes several responsibilities: fetching, transforming, deciding *and* rendering.
- There's a non-trivial pure calculation you'd want to unit-test without rendering.
- A sub-tree has its own state or interaction, or JSX repeats with variations.
- You need to scroll to understand it (a rough signal: past 150–200 lines).

**How to split, in order of preference:**

1. **Extract pure logic to `helpers.ts`.** Formatting, mapping, sorting, labels, derived values.
   This is the cheapest win and the easiest to test.
2. **Extract stateful logic to a custom hook** (`useX.ts` in the folder, or the feature's hooks
   module if it's reused). The component then reads like a declaration of what it shows.
3. **Extract sub-components** into `_components/` when a sub-tree has its own reason to change.
   Prefer composition through `children` or slot props over passing ten props down.
4. **Extract static data to `constants.ts`** (maps, option lists, limits) so the component file
   holds behaviour, not tables.

Don't split mechanically. A 60-line component with one inline helper is better than five files
of 12 lines. Splitting is for cohesion, not for meeting a line count.

**Container/presentational:** no separate container components are needed. A custom hook
plays the container role (Dan Abramov himself withdrew the strict split once hooks existed).
Keep one boundary though: shared UI components in `components/` take data through props and
don't call feature data hooks, so they stay reusable and easy to test.

## 4. Constants

- **Scope decides location.** Used in one component → that component's `constants.ts` (or the
  top of its file if there are one or two). Used across a route → next to `page.tsx`. Used
  across features → `config/` or a purpose-named shared module.
- **Naming:** module-level, never-reassigned values use `CONSTANT_CASE` (`MAX_FILE_SIZE`,
  `MODEL_COLOR`). Local `const` variables inside functions stay `camelCase`. The case signals
  "configuration, don't mutate", not just "declared with const".
- **Type them tightly.** Use `as const` for literal tuples/objects and `satisfies` to check shape
  without widening. Derive union types from the constant instead of duplicating them:
  `type Tab = (typeof TABS)[number]`.
- **Env-derived values are read in one place** (a typed `config`/`env` module or the API client)
  and exported from there. Scattered `process.env.X` reads make configuration impossible to
  audit. In Next.js, `NEXT_PUBLIC_*` values end up in the client bundle, so never put secrets
  there.
- **User-facing strings aren't constants.** If the app uses i18n, labels go in message catalogs.
  Constants hold *keys* or *ids*, not translated text.
- **Contract values** (enums, status lists shared with the backend) come from the contract
  package or generated types. Don't redeclare them in the UI.

## 5. Utils, helpers, lib

| Kind | What it is | Where |
|------|-----------|-------|
| **Helper** | Pure function serving one component/route | `helpers.ts` in that folder |
| **Feature util** | Pure function used across one feature | the feature module (`features/x/utils/…`, or `lib/<domain>.ts`) |
| **Shared util** | Pure, app-agnostic function used across features | `utils/<purpose>.ts` or `lib/<purpose>.ts`, one purpose per file |
| **Lib/infra** | Configured client, provider, adapter with app knowledge | `lib/` |
| **Shared hook** | Domain-agnostic React hook | `hooks/` (or `lib/hooks/` if that's the project's convention) |

Rules for anything called a helper or util:

- **Pure and React-free.** No hooks, no JSX, no `fetch`, no `window`. If it needs React, it's a
  hook. If it needs the network, it's data-layer code. Purity makes utils trivially testable
  and safe to import from both Server and Client Components.
- **Grouped by purpose, one concern per file.** `format-cost.ts` with its `format-cost.test.ts`
  next to it, not a 600-line `utils.ts`.
- **Test complex ones next to the file.** A helper with branching logic gets a `*.test.ts`
  sibling. That's often the main reason to pull logic out of a component in the first place.

## 6. Business logic

Business logic means the rules of the domain: what counts as "blocking", how a cost is
computed, which findings are visible, what a status transition allows. It should not live in
JSX or in event-handler bodies. In those places it can't be tested without rendering and it
gets duplicated between screens.

Layer it like this (after Juntao Qiu's "Modularizing React Applications" on martinfowler.com):

```
view (components)       → renders, wires events to hooks; no rules, no fetch, no data mapping
  ↓ uses
hooks (React glue)      → state, effects, server-state (TanStack Query), calls into the model
  ↓ uses
model / domain (pure)   → rules, calculations, derivations, status logic; plain TS, no React
  ↓ uses
data / gateway          → API client + request functions + DTO → model mapping (anti-corruption)
```

- **The model layer is plain TypeScript**: functions, or classes when there's a real invariant.
  It's the most valuable layer to unit-test, and it survives framework changes.
- **Hooks are thin.** A hook composes queries and model functions. If a hook body is mostly
  `if/else` about the domain, move that logic into a model function the hook calls.
- **Map at the boundary.** Convert API shapes to UI-friendly shapes in the data layer (or in a
  `select` for TanStack Query), not inside components. A backend rename then touches one file.
- **Branching per variant** (per country, per provider, per agent type) belongs in a lookup map
  or strategy object in the model, not in nested ternaries inside JSX.
- **Authorization and secrets never live in UI code.** The UI can hide a button, but only the
  server can enforce a rule.

Scale the layering to the code. A two-line rule can stay as a helper next to its component. A
rule used by three screens belongs in the model module of its feature.

## 7. Data layer (server state)

- **One configured API client** in `lib/` (base URL, headers, error normalization). Nothing else
  calls `fetch` directly.
- **Request + hook + key live together per domain/feature.** For example
  `lib/hooks/agents.ts` or `features/agents/api/*`: the request function, its query/mutation
  hook and its query keys are declared in one place, so every endpoint has one definition.
- **Prefer a query-key factory or `queryOptions` per domain** over inline string arrays, so that
  invalidation and prefetching reference the same key definition (TkDodo).
- **Components never build URLs or query keys inline.** They call a hook.
- **Server state stays in the query cache.** Don't copy it into `useState` or context. UI state
  (open/closed, selected tab) is separate and lives close to where it's used. Filters that
  should survive a reload go in the URL (`?tab=…`).

## 8. Next.js App Router architecture

For details and the alternative layouts, see
[references/nextjs-app-router.md](references/nextjs-app-router.md).

- **`app/` is the routing layer.** `page.tsx` and `layout.tsx` choose what to render for a URL,
  read params and compose views. Screen implementations live in `_components/` (route-private)
  or in shared/feature modules. Aim for thin pages: a page that has grown big moves its body
  into `_components/<Name>View` and keeps the route file as a wrapper.
- **Private folders `_name` mark non-route code** inside `app/`. Use them consistently
  (`_components`, `_lib`) even though colocation is already safe. They separate UI from routing
  at a glance and protect against future special-file names.
- **Route groups `(name)`** organize sections or give a subset of routes its own layout without
  changing URLs. Use them for structure, not for decoration.
- **`'use client'` is a module boundary, not a file label.** Put it on the smallest interactive
  component (the leaf), not on a page or layout, unless the whole screen is client-only. Pass
  server-rendered parts into client components through `children`/slot props.
- **Providers are client components wrapping `{children}`**, rendered in a layout and as deep in
  the tree as their consumers allow. Collect app-wide providers in one `lib/providers.tsx`.
- **Pick one data path and name it.** Either (a) the API is a separate backend: the browser talks
  to it through the API client + TanStack Query, and Next.js serves UI only (backend-for-frontend
  at most), or (b) Next.js is full-stack: reads go in a server-only Data Access Layer, and writes
  go in Server Actions in `actions.ts` files. Mixing both for the same resource produces two
  caches and two sources of truth.
- **Server-only modules are marked.** If code reads secrets or a database, `import 'server-only'`
  at its top so an accidental client import fails the build.

## 9. Imports and boundaries

- **Dependencies flow one way:** `shared (components, lib, utils, config) → features → app
  (routes)`. Shared code never imports from a feature or a route. A feature never imports from
  `app/`.
- **No cross-feature imports.** If feature A needs feature B's thing, either promote the thing
  to shared, or compose A and B at the route level.
- **No reaching into another component's internals.** Import a component folder through its
  `index.ts`, never `OtherComponent/_components/Inner` or `OtherComponent/helpers`. If you need
  the internal, it has been reused: promote it.
- **Use the path alias** (`@/…`) for anything outside the current folder tree. Use relative
  imports (`./`, `../`) only within one component or route folder. Deep `../../../` chains break
  on every move.
- **Enforce with lint, not memory.** `import/no-restricted-paths` zones or
  `eslint-plugin-boundaries` turn these rules into errors. See
  [references/enforcement.md](references/enforcement.md).

### Barrel files: narrow public API only

An `index.ts` is allowed as the **entry point of one component or module folder**, with
**explicit named exports** of what outsiders may use:

```ts
// components/diff-viewer/index.ts: good
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
```

Not allowed in new code:

- `export * from "./x"`. It hides what the public surface is and re-exports internals by
  accident.
- Aggregating barrels over many unrelated modules (`components/index.ts` re-exporting every
  component, `features/index.ts`). They load every module on each import, invite circular
  imports and slow dev servers and tests (TkDodo, and Bulletproof React's own docs).
- Importing your own folder's barrel from inside that folder (`import { X } from "."`). That
  makes an import cycle.

The narrow form keeps the one real benefit of a barrel, a declared public API that hides
internals, without the cost.

---

## 10. Review checklist

When reviewing or finishing a change, check:

- [ ] Every new file sits at the lowest level that covers all its current users (section 1).
- [ ] Nothing was put in a shared folder for a single user; nothing was copy-pasted where
      promotion was due.
- [ ] Components contain wiring and JSX. Domain rules, mapping and calculations are in
      helpers/model functions with tests.
- [ ] No `fetch`, URL building or inline query keys in components.
- [ ] Constants are scoped, `CONSTANT_CASE` at module level, typed with `as const`/`satisfies`. No
      user-facing literals if the app uses i18n.
- [ ] Imports respect `shared → features → app`. No cross-feature imports, no reaching into
      another folder's internals, no new `export *` or aggregating barrels.
- [ ] Route files are thin. `'use client'` is as low in the tree as practical.
- [ ] The project profile's conventions (if any) are followed, and deviations are intentional.

When reporting a structural problem, name the rule, the file:line, and the concrete move. For
example: "`<fn>` in `<File>.tsx:<line>` is a domain rule used by two screens (§6) → move it to
the domain's model module and import it from both." "Consider restructuring" doesn't help
anyone.
