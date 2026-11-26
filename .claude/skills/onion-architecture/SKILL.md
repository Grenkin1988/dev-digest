---
name: onion-architecture
description: "Onion Architecture (ports & adapters, dependency rule) for DevDigest server modules: Fastify routes, services, Drizzle repositories, Zod contracts, the DI Container, adapters, job handlers and reviewer-core. Use whenever you create or change a module in server/src/modules, add a route, service, use case, repository, query, adapter, port or job handler, decide where server code belongs, wire a dependency, or review a backend PR for layering, even if the user doesn't say 'architecture' (e.g. 'add an endpoint', 'where should this query go', 'new module', 'call GitHub from X', 'this route is too big'). Not for Fastify API details, Drizzle query syntax or Zod schema syntax: use fastify-best-practices / drizzle-orm-patterns / zod for those."
metadata:
  version: "1.1.0"
  tags: architecture, onion, hexagonal, clean-architecture, fastify, drizzle, zod, dependency-injection, backend
---

# Onion Architecture for server modules

How code in `server/src/modules/*` is layered, and why. Version 1.1.0. Sources are in
[README.md](README.md).

One rule underlies everything: **source dependencies point inward only.** Inner rings
define interfaces (ports). Outer rings implement them. In Palermo's words, "all coupling
is toward the center". The payoff: business logic can be tested and changed without
Postgres, Fastify, GitHub or an LLM, and an infrastructure swap doesn't reach the core.

**Scope.** This applies to new and changed code. Existing deviations are listed in §6. Fix
one when you're already touching that code, never as a drive-by refactor.

**Out of scope** (other skills): route/plugin/hook API → `fastify-best-practices`. Query,
relation and migration syntax → `drizzle-orm-patterns`. Schema design → `postgresql-table-design`.
Schema syntax → `zod`. Here, those tools only come up where they decide *which layer* code
goes in.

---

## 1. The rings, mapped to our files

Modules stay **flat**. A layer is a role a file plays, not a folder.

| Ring | Files in `modules/<name>/` (and elsewhere) | May import | Must NOT import |
|---|---|---|---|
| **Domain** (core) | `constants.ts`, `helpers.ts`, pure modules like `reviews/cost.ts`, optional `domain.ts` | other domain files, `@devdigest/shared` contract *types*, pure `@devdigest/reviewer-core` functions | `fastify`, `drizzle-orm`, `db/*` (runtime), `adapters/*`, `platform/container`, `process.env`, any I/O |
| **Application** | `service.ts`, use-case classes like `reviews/run-executor.ts`, optional `ports.ts` | domain, its own `ports.ts`, port interfaces from `@devdigest/shared` (`adapters.ts`), `platform/errors` | `fastify`, `drizzle-orm`, `db/schema`, concrete `adapters/*`, `req`/`reply` |
| **Infrastructure** (driven adapters) | `repository.ts`, `repository/*.repo.ts`, `src/adapters/**` | `drizzle-orm`, `db/*`, SDKs (octokit, simple-git, openai, …), domain types | `fastify`, services, routes |
| **Presentation** (driving adapters) | `routes.ts`, job handlers (`jobs.register(...)` callbacks), SSE endpoints | services, Zod contracts, `_shared/context.ts`, `_shared/schemas.ts` | `drizzle-orm`, `container.db`, repositories, concrete adapters |
| **Composition root** | `platform/container.ts`, `app.ts`, `modules/index.ts` | everything | — (the only place that knows every concrete class) |

Full rationale and the edge cases (where `platform/*` sits, type-only imports, `vendor/shared`)
are in [references/layers.md](references/layers.md).

## 2. "Where does this code go?" (stop at the first yes)

1. **Pure decision, calculation, mapping or literal with no I/O?** → Domain: `helpers.ts` /
   `constants.ts` / a named pure module (`cost.ts`). Inject anything impure (a clock, a price
   estimator) as a function argument, like `CostEstimator` in `reviews/cost.ts:12`.
2. **It reads or writes Postgres?** → the module's repository. It's the *only* place that
   imports `drizzle-orm` or `db/schema`, and every query is scoped by `workspaceId`.
3. **It talks to an external system (GitHub, git, LLM, filesystem, secrets, tokenizer)?** →
   an adapter in `src/adapters/<x>/` behind a port interface, exposed by the `Container`, with a
   mock in `adapters/mocks.ts`. See [references/adapters.md](references/adapters.md).
4. **It orchestrates steps (load → decide → persist → call out → emit)?** → a service method
   (application). Decisions inside it delegate to domain functions.
5. **It turns HTTP, a job payload or an SSE subscription into a call?** → `routes.ts` or the job
   handler. It parses, resolves context, calls **one** service method and maps the result.
6. **It constructs objects or picks implementations?** → the composition root (`Container`, or
   the module plugin's top, which builds the service once).

## 3. Rules per tool (summary — details in references)

- **Fastify** ([fastify.md](references/fastify.md)): a route is a thin driving adapter, built like `repos/routes.ts:19`.
  Validate with the Zod contract in `schema`, then `getContext`, one service call, set the status. No SQL, no business branching, no
  `try/catch` that builds error bodies: throw `AppError` and let `app.ts:129` (`setErrorHandler`) map it.
- **Zod** ([zod-contracts.md](references/zod-contracts.md)): `src/vendor/shared` contracts are the boundary DTOs, request
  and response alike. Parse once at the edge ("parse, don't validate"). Inner code takes typed values and never re-parses.
- **Drizzle** ([drizzle.md](references/drizzle.md)): only repositories import `drizzle-orm` or `db/schema`. They return
  rows or domain/DTO types, never query builders. Transactions are opened by a repository method that the service
  asks for by intent (`repo.replaceFiles(prId, files)`), or by a `withTransaction` port. `tx` never leaks into a service.
- **DI** ([di-container.md](references/di-container.md)): `Container` is the composition root. New services get narrow
  dependencies through the constructor (a repository plus the ports they use), not the whole `Container`, and never
  `new XRepository(container.db)` inside a service.
- **Adapters** ([adapters.md](references/adapters.md)): port interface → `@devdigest/shared/adapters.ts` (shared with
  reviewer-core) or the module's `ports.ts` (module-local). Implementation → `src/adapters/<x>/`. Mock → `adapters/mocks.ts`
  plus a `ContainerOverrides` field. Hide library complexity behind a facade, like `RepoIntel` (`repo-intel/types.ts:137`).
- **reviewer-core** is a pure domain library: no DB, GitHub or filesystem, and only the injected `LLMProvider` for I/O. Server
  application code calls it. It never imports server code.
- **Jobs / SSE** are driving adapters, like routes. A job handler deserializes its payload and delegates:
  `repos/service.ts:47` (`registerCloneJobHandler`) → `:53` (`runCloneJob`).
- **Testing** ([testing.md](references/testing.md)): domain gets plain unit tests (no mocks). Application gets fakes for its
  ports. Repositories get `*.it.test.ts` on Testcontainers. Routes get `app.inject` smoke tests with `ContainerOverrides`.

## 4. Checklist: adding a module

1. `constants.ts` and `helpers.ts` first: model the pure rules and test them without mocks.
2. `repository.ts`: a class taking `Db`. Every method is workspace-scoped and named after an intent (`listOpenForRepo`, not `select`).
3. `ports.ts` *only if* the service needs a capability that isn't in `@devdigest/shared/adapters.ts` yet.
4. `service.ts`: a constructor with narrow dependencies. No `fastify`, `drizzle-orm` or `db/schema` imports.
5. `routes.ts`: a default-export plugin that builds the service once from `app.container` and keeps every handler thin.
6. Register it: one import and one entry in `src/modules/index.ts`.
7. A new external system? Add the adapter, the `Container` getter, a `ContainerOverrides` field and a mock in `mocks.ts`.
8. Tests on each ring (see testing.md), plus `pnpm typecheck`.

**When not to add ceremony.** A pure CRUD endpoint doesn't need `ports.ts` or a domain file:
route → service → repository is enough. The ring rules still hold. What's optional is the extra
file, not the direction. (NDepend and Cosmic Python both warn against the full pattern on
simple CRUD.)

## 5. Review checklist (flag any of these)

| Red flag | Ring broken | Fix |
|---|---|---|
| `container.db` / `drizzle-orm` / `t.<table>` in `routes.ts` | presentation → infrastructure | move the query into the repository and call it through the service |
| `import … from 'fastify'` in a service, helper or repository | inner → outer | pass plain values; keep `req`/`reply` in the route |
| `new XRepository(container.db)` or `this.container.<anything>` inside a service | service locator / application → infrastructure | constructor-inject the repository and ports |
| A service imports another module's `repository.ts` or `repository/*.repo.ts` | module boundary | get it from the `Container` (`container.agentsRepo`) or call that module's service |
| `process.env` in a module (`src/modules/**`) | config leak | read it through `AppConfig` (`platform/config.ts`); only config, adapters and db scripts touch env |
| An SDK (`octokit`, `simple-git`, `openai`, `@anthropic-ai/sdk`) imported outside `src/adapters/` | application → concrete detail | add or extend a port and its adapter |
| A helper does I/O, `Date.now()` or random without injection | domain impurity | pass it as an argument |
| A repository returns a query builder or takes a `where` from the caller | leaky abstraction | add an intent-named method |
| A route catches and builds error JSON | duplicate error mapping | throw `AppError` and let the global handler map it |
| A test of a service needs Postgres | missing port | fake the repository and ports |

## 6. Known deviations in the current code (don't copy them)

Fixed on 2026-11-24 (routes, services and repositories now follow the rings, and
`pnpm lint` enforces it, see `server/eslint.config.mjs`): routes no longer touch
`container.db`, services get narrow constructor deps built once in `platform/container.ts`,
and `repos/helpers.ts` maps from a structural `RepoRowLike`. Reference implementations:
`pulls/{repository,service,helpers,routes}.ts`, `settings/{repository,service}.ts`,
`reviews/deps.ts` (`ReviewDeps`), `repo-intel/deps.ts` (`RepoIntelDeps`).

Still in place, and accepted:

- `AppError` (`platform/errors.ts:7`) carries an HTTP `statusCode`. This is accepted: it's
  our one domain error type, and the transport mapping stays centralized in `app.ts:129`
  (`setErrorHandler`; unknown 5xx errors are answered generically and only logged).
- `OpenRouterProvider` (`reviewer-core/src/llm/openrouter.ts:1`) imports the `openai` SDK
  inside the "pure" engine. It stays: the CI agent-runner consumes reviewer-core without the
  server's adapters. Server code still builds it only in the composition root
  (`platform/container.ts`).
- `settings/feature-models.ts` takes the `Container` and queries `container.db`. It has no
  callers yet (later lessons). Give it a `SettingsRepository` method when it gets one.

Worked before/after examples of each are in [examples.md](examples.md).
