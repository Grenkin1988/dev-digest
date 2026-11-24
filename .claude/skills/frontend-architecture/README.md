# Frontend Architecture Skill

**Version:** 1.0.0 (2026-11-24) · **Scope:** Frontend (React + Next.js App Router)

## Motivation

The existing frontend skills cover *how to write* code: `react-best-practices` (purity, derived
state, hooks, performance) and `next-best-practices` (file conventions, RSC, caching, bundling).
None of them answered the questions that come up every time a new screen or component is
added:

- Where does a component go: next to the route, in shared `components/`, or in a feature module?
- How should a growing component be split, and into which files?
- Where do constants live, and how are they named and typed?
- What's a helper, a util, or `lib`, and where does each belong?
- Where does business logic live, so it isn't buried in JSX?
- How does the Next.js App Router change this (routing vs. feature code, `'use client'`
  placement, data path)?

This skill answers those questions and only those. It deliberately leaves out rendering
performance and hook correctness to avoid duplicating the two skills above.

## Design

| File | Loaded | Purpose |
|------|--------|---------|
| [SKILL.md](SKILL.md) | when the skill triggers | Placement algorithm, layout, component splitting, constants, utils/lib, business-logic layers, data layer, Next.js architecture, imports/barrels, review checklist |
| [references/placement-guide.md](references/placement-guide.md) | on demand | "I have X → it goes in Y" lookup table + before/after examples |
| [references/nextjs-app-router.md](references/nextjs-app-router.md) | on demand | Next.js strategies, route-file responsibilities, server/client boundary, choosing the data path, FSD/`features/*` alternatives |
| [references/enforcement.md](references/enforcement.md) | on demand | ESLint configs: `import/no-restricted-paths`, `eslint-plugin-boundaries`, barrel policy, `import/no-cycle` |
| [references/devdigest.md](references/devdigest.md) | on demand, in this repo | Project profile: the general rules mapped onto `client/src`, plus accepted deviations |

`SKILL.md` stays general so the skill works in other React/Next.js projects. Repo-specific
conventions live in a **project profile** under `references/`, and inside that repo the
profile takes precedence.

### Decisions taken in v1.0.0

| Question | Decision | Why |
|----------|----------|-----|
| General vs. project-specific | General `SKILL.md` + DevDigest profile | Reusable across projects without losing the local conventions |
| Barrel files | **Narrow public API only:** `index.ts` per component/module folder with explicit named exports. No `export *`, no aggregating barrels | Keeps the real benefit (declared public surface) while avoiding the costs TkDodo and Bulletproof React document (module bloat, cycles, slow dev/test). Matches most existing DevDigest code |
| Route UI placement | **`_components` + promote:** route-private UI in `app/<route>/_components`, promoted to `src/components` on its second use | Next.js-native colocation, already the DevDigest convention. `features/*` and FSD are described as alternatives, not defaults |
| Business logic | view → hooks → model (pure TS) → data/gateway | Juntao Qiu (martinfowler.com), react.dev custom hooks/reducers, Bespoyasov's clean architecture, scaled down for small rules |
| Next.js data path | Pick one: separate API + TanStack Query, *or* DAL + Server Actions | Two paths for one resource means two caches. DevDigest uses the separate Fastify API |

## Versioning

The version lives in `SKILL.md` frontmatter (`metadata.version`) and at the top of this file.
Bump it in the same change that edits the skill:

- **MAJOR**: a rule is reversed or removed (e.g. barrel policy changes).
- **MINOR**: a new rule, section, reference file or project profile.
- **PATCH**: wording, examples, links, or a profile refresh after the code moved.

### Changelog

- **1.0.0** (2026-11-24): Initial version. Placement algorithm, layout, component splitting,
  constants, utils/lib, business-logic layering, data layer, Next.js App Router architecture,
  boundaries and barrel policy, review checklist. References: placement guide, Next.js,
  enforcement, DevDigest profile.

## Sources

Collected on 2026-11-24. **Tiers:** A = official docs · B = recognized expert or widely
adopted reference · C = community article (supporting only, never the sole basis for a rule).

**Read in full while writing v1.0.0:** Bulletproof React `project-structure.md`,
`api-layer.md`, `project-standards.md`; Next.js *Project structure*, *Server and Client
Components*, *Backend for Frontend*; Juntao Qiu, *Modularizing React Applications*
(martinfowler.com); TkDodo, *Please Stop Using Barrel Files*; FSD, *Usage with Next.js* and
*Slices and segments*; Kent C. Dodds, *Colocation*. The other links were checked to resolve
and reviewed through excerpts.

Two findings from the full texts shaped the rules. Bulletproof React itself now advises
against feature barrels ("it is recommended to import the files directly"). TkDodo's only
accepted barrel is a library's package entry point. Both support the narrow-public-API
compromise over FSD's slice-wide `index.ts`.

### 1. Where components live (project / folder structure)

| Tier | Source | What it contributes |
|------|--------|---------------------|
| A | [Next.js — Project structure](https://nextjs.org/docs/app/getting-started/project-structure) | Official strategies: code outside `app/`, top-level folders inside `app/`, or split by feature/route. Route groups `(group)`. |
| A | [Next.js — Colocation & private folders](https://nextjs.org/docs/app/building-your-application/routing/colocation) | Files in `app/` are only routable with `page`/`route`. `_private` folders opt out of routing. |
| A | [Next.js — `src` directory](https://nextjs.org/docs/app/building-your-application/configuring/src-directory) | `src/app`, config stays at root, `@/*` alias update. |
| A | [Legacy React FAQ — File structure](https://legacy.reactjs.org/docs/faq-structure.html) | "React doesn't have opinions". Group by feature/route or by type. "Don't overthink it". Avoid deep nesting. |
| B | [Bulletproof React — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | `app/ · components/ · features/ · hooks/ · lib/ · stores/ · types/ · utils/`. Feature folder shape. Unidirectional `shared → features → app`. No cross-feature imports. |
| B | [Bulletproof React — repo / docs index](https://github.com/alan2207/bulletproof-react) | The whole docs set (state, API layer, error handling, testing, standards). |
| B | [Feature-Sliced Design — official docs](https://feature-sliced.design/) | Layers `app → pages → widgets → features → entities → shared`, slices, segments (`ui/model/api/lib/config`), public API `index.ts`, v2.1 "pages first". |
| B | [Robin Wieruch — React Folder Structure (2026)](https://www.robinwieruch.de/react-folder-structure/) | Step-by-step growth: single file → files → folders → feature folders. |
| B | [Josh W. Comeau — How I structure my React projects](https://www.joshwcomeau.com/react/file-structure/) | Pragmatic `components/` with per-component folders, `helpers`, `constants`, `hooks` (updated Dec 2025). |
| B | [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | Core principle: "place code as close to where it's relevant as possible"; things that change together stay together. |
| C | [profy.dev — Screaming Architecture: evolution of a React folder structure](https://profy.dev/article/react-folder-structure) ([dev.to mirror](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)) | From group-by-type to feature-driven, with reasons for each step. |
| C | [Netguru — React project structure 2025](https://www.netguru.com/blog/react-project-structure) | Recent survey of common layouts. |
| C | [Packt — React Application Architecture for Production, ch. 2](https://packtpub.com/en-ch/product/react-application-architecture-for-production-9781801070539/chapter/chapter-2-setup-and-project-structure-overview-2/section/project-structure-overview-ch02lvl1sec14) | Book by the Bulletproof React author. Same feature-based layout. |

### 2. How components are split (composition, responsibility)

| Tier | Source | What it contributes |
|------|--------|---------------------|
| A | [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) | Split the UI into a component hierarchy by single responsibility. Find the minimal state and where it lives. |
| A | [react.dev — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | Minimal, non-redundant state. Values derived during render are plain constants. |
| A | [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | Compute in render, handle events in handlers. Shapes what a component body may contain. |
| A | [react.dev — Rules of React](https://react.dev/reference/rules) | Purity and the hook rules, which limit where logic can go. |
| B | [Dan Abramov — Presentational and Container Components (+2019 note)](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | Origin of the split, and the author's own retraction: hooks cover the same separation of concerns. |
| B | [patterns.dev — Container/Presentational pattern](https://www.patterns.dev/react/presentational-container-pattern) | Current view: hooks replace the wrapper layer. When the split still helps. |
| B | [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Push state down to the component that uses it. Keep providers close to their consumers. |
| B | [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) | Avoid hasty abstractions. Prefer duplication over the wrong abstraction. Shapes *when* to extract a shared component. |
| B | [mithi — react-philosophies](https://github.com/mithi/react-philosophies) | A short set of guidelines on splitting, naming, composition and keeping things simple. |
| C | [Stack Overflow Blog — Don't build the reusable component yet (2026-11-05)](https://stackoverflow.blog/2026/11/05/don-t-build-the-reusable-component-yet/) | Recent restatement of AHA for UI components. |

### 3. Constants

| Tier | Source | What it contributes |
|------|--------|---------------------|
| A | [Google TypeScript Style Guide — naming](https://google.github.io/styleguide/tsguide.html) | `CONSTANT_CASE` for module-level/global constants and enum values. The name signals "do not modify". |
| A | [typescript-eslint — naming-convention rule](https://typescript-eslint.io/rules/naming-convention/) | Lint enforcement of `UPPER_CASE` for constants. |
| B | [Feature-Sliced Design — segments (`config`)](https://feature-sliced.design/docs/reference/slices-segments) | Constants and feature flags in the slice's `config` segment. App-wide config in `shared/config`. |
| B | [Bulletproof React — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Global `config/` for env-derived constants. Feature-local constants stay inside the feature. |
| B | [Josh W. Comeau — file structure](https://www.joshwcomeau.com/react/file-structure/) | Root `constants.js` for app-wide values, colocated constants for component-local ones. |
| A | [Next.js — Data Security (env only in the DAL)](https://nextjs.org/docs/app/guides/data-security) | `process.env` only in server-side data access code. Shapes where env-derived constants may live. |

### 4. Utils / helpers / lib

| Tier | Source | What it contributes |
|------|--------|---------------------|
| B | [Bulletproof React — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | `lib/` = pre-configured third-party libraries (api client, query client). `utils/` = shared pure functions. |
| B | [Feature-Sliced Design — `shared/lib` vs slice `lib`](https://feature-sliced.design/docs/reference/layers) | App-agnostic helpers in `shared/lib`. Slice-internal helpers in the slice's `lib`. "Utils" must be grouped by purpose, not dumped together. |
| B | [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | A helper used in one place stays next to that place. Promote it only when it is reused. |
| B | [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) | Don't create a shared helper before the duplication is real. |
| B | [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | README example: "helpers can't import react". A lint rule that keeps utils pure. |

### 5. Business logic

| Tier | Source | What it contributes |
|------|--------|---------------------|
| A | [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | Custom hooks share stateful logic, not state. Naming rules. When to extract one. |
| A | [react.dev — Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer) | Move update logic out of handlers into a pure reducer that can be tested on its own. |
| A | [Next.js — Data Security / Data Access Layer](https://nextjs.org/docs/app/guides/data-security) | DAL as the place for data access and authorization. `server-only`. DTOs. |
| A | [Next.js blog — How to think about security in Server Components & Actions](https://nextjs.org/blog/security-nextjs-server-components-actions) | Why logic must not sit in components. Server Actions are public endpoints. |
| B | [Juntao Qiu on martinfowler.com — Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | Key source: layering into view / model / data, extracting domain objects and strategies out of components, with a refactoring walkthrough. |
| B | [Alex Bespoyasov — Clean Architecture on Frontend](https://dev.to/bespoyasov/clean-architecture-on-frontend-4311) ([example repo](https://github.com/bespoyasov/frontend-clean-architecture)) | Domain / application (use cases) / adapters layers on the frontend, plus an honest section on the cost. |
| B | [Alex Bespoyasov — Explicit Design series (ports & adapters)](https://dev.to/bespoyasov/explicit-design-part-4-ports-adapters-and-infrastructure-2o) | A deeper follow-up on ports and adapters. |
| B | [Feature-Sliced Design — `model` segment](https://feature-sliced.design/docs/reference/slices-segments) | State and business rules in `model`, not in `ui`. |

### 6. Data-fetching layer (server state)

| Tier | Source | What it contributes |
|------|--------|---------------------|
| A | [TanStack Query — docs](https://tanstack.com/query/latest/docs/framework/react/overview) | Server state is separate from UI state. Relevant because the client uses TanStack Query. |
| B | [TkDodo — Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | One query-key factory per feature, colocated with the feature. |
| B | [TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | `queryOptions` as the unit of abstraction, preferred over custom hooks alone. |
| B | [TkDodo — Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) | Where to put query hooks/options and how thin to keep them. |
| B | [Bulletproof React — API layer docs](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md) | A single API client in `lib/`. Per-feature request + hook + types files. |

### 7. Boundaries, imports, barrel files

| Tier | Source | What it contributes |
|------|--------|---------------------|
| B | [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | Avoid `index.ts` re-exports in app code: they cost performance, cause circular imports and hurt tooling. Conflicts with FSD's public-API `index.ts`, so the skill must take a side. |
| A | [Biome — noBarrelFile](https://biomejs.dev/linter/rules/noBarrelFile) | Lint rule for the same thing. |
| B | [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | Enforce element types and allowed dependency directions between folders. |
| B | [Bulletproof React — `import/no-restricted-paths` config](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | A minimal ESLint way to enforce `shared → features → app`. |
| B | [Nx — Enforce module boundaries](https://nx.dev/docs/features/enforce-module-boundaries) | Tag-based alternative, useful for comparison. |
| B | [Bulletproof React — project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md) | File naming, absolute imports, lint/format standards. |

### 8. Next.js App Router architecture (not performance)

#### 8.1 Routing tree vs. application code

| Tier | Source | What it contributes |
|------|--------|---------------------|
| A | [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | Three official strategies: project files outside `app/`, top-level folders inside `app/`, or split by feature/route. Route groups and private folders. |
| A | [Next.js — Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) | What belongs in `page`/`layout`: route entry points, not feature logic. |
| A | [Next.js — Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) | `(group)` folders organize by section or team and give separate layouts without changing URLs. |
| A | [Next.js — Colocation / private folders](https://nextjs.org/docs/app/building-your-application/routing/colocation) | `_components`, `_lib` next to the route. Matches the current DevDigest convention. |
| B | [Feature-Sliced Design — Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) | Official FSD guide: keep Next's `app/` as a thin routing layer that re-exports FSD `pages`. Solves the `app`/`pages` name clash. |
| C | [HackerNoon — How to deal with the Next.js App Router and FSD problem](https://hackernoon.com/how-to-deal-with-the-nextjs-app-router-and-fsd-problem) | Variant with two `app` folders: Next.js routing at the root, the FSD app layer in `src/app`. |
| B | [Robin Wieruch — Feature-based React architecture](https://www.robinwieruch.de/react-feature-architecture/) | Feature folders in a Next.js app, with RSC and Server Actions bringing UI closer to data. |
| C | [freeCodeCamp — Reusable architecture for large Next.js applications](https://www.freecodecamp.org/news/reusable-architecture-for-large-nextjs-applications/) | Thin routes, feature modules, shared layer in a large Next.js codebase. |

#### 8.2 Server/Client components as an architectural boundary

| Tier | Source | What it contributes |
|------|--------|---------------------|
| A | [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Put `'use client'` on interactive leaves, not whole subtrees. Pass Server Components through `children`/props (interleaving). Wrap third-party client-only components. Providers go deep in the tree. |
| A | [Next.js — Server and Client boundary guide](https://nextjs.org/docs/app/guides/server-and-client-boundary) | `'use client'` marks a boundary in the module graph. Rules for what may cross it (serializable props). |
| A | [react.dev — Server Components](https://react.dev/reference/rsc/server-components) | The React-level model behind the Next.js docs. |
| A | [react.dev — `'use client'`](https://react.dev/reference/rsc/use-client) | The directive marks an entry point into the client module graph, not "this file is a client file". Shapes how folders are split. |
| B | [Vercel — Common mistakes with the Next.js App Router](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them) | Architecture mistakes: Route Handlers called from Server Components, context providers in the wrong place, `'use client'` too high, and misplaced fetching. |

#### 8.3 Reads, mutations, backend-for-frontend

| Tier | Source | What it contributes |
|------|--------|---------------------|
| A | [Next.js — Fetching data](https://nextjs.org/docs/app/getting-started/fetching-data) | Where reads happen (Server Components vs. client libraries such as TanStack Query). |
| A | [Next.js — Mutating data](https://nextjs.org/docs/app/getting-started/mutating-data) | Server Functions/Actions: where they are defined (`actions.ts` modules vs. inline). |
| A | [Next.js — Server Actions guide](https://nextjs.org/docs/app/guides/server-actions) | Actions are public endpoints, revalidation after a mutation, how to organize them. |
| A | [Next.js — Forms guide](https://nextjs.org/docs/app/guides/forms) | Form + Action structure. Auth checks inside every action. |
| A | [Next.js — Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend) | When Next.js is only a proxy/BFF in front of a separate API, which is DevDigest's case. |
| A | [Next.js — Authentication (DAL)](https://nextjs.org/docs/app/guides/authentication) | DAL + DTO pattern. Auth checks close to data, not in layouts. |
| A | [Next.js — Data Security](https://nextjs.org/docs/app/guides/data-security) | Three data-access approaches (HTTP API / DAL / component-level), `server-only`, env only in the DAL. |
| A | [TanStack Query — Advanced SSR (App Router)](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr) | Prefetch in a Server Component + `HydrationBoundary`, `QueryClient` provider placement. Where the query layer sits in an App Router app. |
