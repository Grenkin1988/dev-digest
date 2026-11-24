# Layers: rationale and edge cases

## Why rings and not "layers"

A classic layered app has UI → business → data, so the business layer depends on the
database. Onion flips the bottom edge. The core declares what it needs (a repository
interface, an `LLMProvider`), and infrastructure implements it. Palermo puts repository
*interfaces* in the core and their implementations outside it. Martin's Dependency Rule says the
same thing in general form: "source code dependencies can only point inwards". Cockburn's test
for it: the app should run with mock adapters, "without either a UI or a database".

## Ring contents

### Domain (core)
- Pure functions and types: validation (`isValidRepoRef`), parsing (`parseRepoUrl`), mapping,
  cost math (`reviews/cost.ts:22` `runCost`), literals (`constants.ts`).
- Impure inputs come in as arguments: `CostEstimator` (`reviews/cost.ts:12`) instead of a
  `PriceBook` import.
- Throws `AppError` subclasses (`platform/errors.ts`) for rule violations. That module is pure
  and counts as domain.
- Contract types from `@devdigest/shared` are our domain/DTO vocabulary. Import types only.

### Application
- Use cases: load via ports → apply domain rules → persist via ports → call out via ports →
  emit events (`runBus`) or enqueue jobs.
- Owns the use-case boundary: which repository methods form one unit of work, and what
  happens when an adapter fails (per-agent failure isolation in `run-executor.ts`).
- `ports.ts` holds module-local interfaces. Following Graça, the interfaces a use case needs
  belong to the application ring, not the domain.

### Infrastructure (driven adapters)
- Repositories (Drizzle) and `src/adapters/**` (octokit, simple-git, ripgrep, ast-grep,
  dependency-cruiser, tiktoken, LLM SDKs, local secrets).
- Implements a port and translates library types into domain/contract types before returning.

### Presentation (driving adapters)
- Fastify route plugins, JobRunner handlers and SSE endpoints. They turn an external trigger
  into one application call.

### Composition root
- `platform/container.ts` (`Container`, `ContainerOverrides`), `app.ts` (`buildApp`:
  `app.decorate('container', …)` at `app.ts:69`, the error handler at `:130`) and
  `modules/index.ts`. Seemann: compose the graph in one place close to the entry point. Only
  the composition root references the container.

## Edge cases

- **`platform/*`** is mixed. `errors.ts` and `price-book.ts` (pure parts) work like
  domain/shared kernel. `container.ts` is the composition root. `jobs.ts`, `sse.ts` and
  `run-logger.ts` are infrastructure, which services may use through their public method
  surface. Treat `JobRunner.enqueue` and `RunBus.emit` as ports already. Don't add Drizzle
  calls next to them.
- **Type-only imports** (`import type`) from an outer ring are erased at runtime, but they
  still couple the design. They're tolerated only for `Container['x']` in existing code. Don't
  add new ones.
- **`src/vendor/shared`** (contracts + `adapters.ts` ports) is the shared kernel between
  server, reviewer-core and client. It sits at the very center, so it must never import from
  `server/src`. Don't hand-edit it without coordination (repo `AGENTS.md`).
- **reviewer-core** is a separate domain package. The server's application ring calls
  `reviewPullRequest` and passes in an `LLMProvider`. reviewer-core imports only
  `@devdigest/shared`.
- **Cross-module use**: modules don't deep-import each other's repositories. Shared
  repositories are exposed by the `Container` (`container.agentsRepo`, `container.reviewRepo`;
  see the comment at `container.ts:80`). Shared capabilities are exposed as facades
  (`container.repoIntel`).
