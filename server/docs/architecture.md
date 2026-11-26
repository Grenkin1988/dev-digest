# server — architecture

Fastify API (`@devdigest/api`) on :3001. It owns persistence (Drizzle on Postgres +
pgvector), external integrations (GitHub, git, LLM providers), and runs reviews by
calling `reviewer-core`. Commands are in [`../AGENTS.md`](../AGENTS.md); routes and
adapters are listed in [`../README.md`](../README.md).

## Folder map

| Path | Holds |
|------|-------|
| `src/server.ts` → `src/app.ts` | Boot; `buildApp` wires plugins, the error handler and modules |
| `src/modules/<name>/routes.ts` | One Fastify plugin per feature (`settings`, `repos`, `pulls`, `polling`, `workspace`, `agents`, `skills`, `reviews`, `repoIntel`) |
| `src/modules/index.ts` | Static module registry; `app.ts:188` registers each entry |
| `src/modules/reviews/` | Review runs: `service.ts` (API-facing), `run-executor.ts` (background execution), `deps.ts` (their injected deps), `repository/*.repo.ts` (SQL), `cost.ts` (pure cost math) |
| `src/modules/pulls/` | PR import + reads: `service.ts` (sync gate, detail TTL, comments), `repository.ts` (SQL, batched upsert, transactional detail replace), `helpers.ts` (DTO mapping, severity rollup) |
| `src/modules/repo-intel/` | Repo-intel facade `service.ts` over `indexer.ts`, `blast.ts`, `queries.ts`, `repo-map-reader.ts`; `disabled.ts` is the Null Object used when `REPO_INTEL_ENABLED` is off |
| `src/platform/` | Cross-cutting infrastructure: DI `container.ts`, `config.ts`, `price-book.ts`, `sse.ts`, `jobs.ts`, `run-logger.ts` |
| `src/adapters/` | Implementations behind the container (github, git, llm, secrets, embedder, …); `mocks.ts` for tests |
| `src/db/` | `schema.ts`, `client.ts`, `migrate.ts`, `seed.ts`, `migrations/` (do not hand-edit) |
| `src/vendor/shared/` | Zod contracts shared with `reviewer-core` (do not hand-edit without coordination) |

## Request flow

```mermaid
flowchart LR
  C[client fetch] --> R["modules/*/routes.ts<br/>Zod contract = schema"]
  R --> S["service<br/>(e.g. ReviewService)"]
  S --> Repo["repository/*.repo.ts<br/>Drizzle"]
  Repo --> PG[(Postgres)]
  S --> K["Container<br/>platform/container.ts"]
  K --> A["adapters/*<br/>GitHub · git · LLM · secrets"]
```

- Route schemas, for both request and response, are the Zod contracts from `src/vendor/shared`.
- External systems are reached only through the `Container` (`src/platform/container.ts:66`). Tests swap them with `ContainerOverrides` and `src/adapters/mocks.ts`.
- API keys are read only through `LocalSecretsProvider` (`src/adapters/secrets/local.ts:16`).
- Every application service is built once in the `Container` (`reposService`, `agentsService`, `skillsService`, `reviewService`, `pullsService`, `settingsService`, `repoIntelService`) from a narrow deps interface. Routes, job handlers and boot code read it from there and never construct one themselves.
- Unexpected errors become a generic `500 internal_error`. The detail goes only to the log (`src/app.ts:129`, `setErrorHandler`).

## PR sync flow (local-first)

- `GET /repos/:id/pulls` (`PullsService.list`, `src/modules/pulls/service.ts:50`) re-syncs from GitHub only when `repos.last_polled_at` is older than `PULL_SYNC_MIN_INTERVAL_MS`. Every other call is a pure Postgres read, even though the client polls it every 60 s.
- A sync (`syncFromGitHub`, `:79`) is one batched upsert plus a back-fill of diff stats for at most `BACKFILL_LIMIT` PRs. `POST /repos/:id/poll` forces one.
- `GET /pulls/:id` and `GET /repos/:id/pulls/by-number/:number` refresh files, commits and body from GitHub at most once per `DETAIL_REFRESH_TTL_MS` per PR. The write is a single transaction (`PullsRepository.replaceDetail`, `src/modules/pulls/repository.ts:166`).
- With no token, or offline, both serve the persisted rows and never fail the read.
- The list rows carry `severity_counts`: each agent's latest review, without dismissed findings. The PR list therefore makes no request per row.

## Review run flow

```mermaid
sequenceDiagram
  participant UI as client
  participant RS as ReviewService.runReview
  participant EX as ReviewRunExecutor
  participant RC as reviewer-core
  participant DB as Postgres
  UI->>RS: POST run review (agents[])
  RS->>DB: createAgentRun per agent (status=running, shared batchId)
  RS-->>UI: run ids (SSE stream per run)
  RS->>EX: execute in background
  EX->>RC: reviewPullRequest(diff, agent, llm)
  RC-->>EX: grounded Review + tokens + costUsd
  EX->>DB: review + findings; run status=done, cost_usd, tokens
```

- `ReviewService.runReview` (`src/modules/reviews/service.ts:107`) generates one `batchId` per request (`:125`). That batch is one "review round".
- `ReviewRunExecutor` (`src/modules/reviews/run-executor.ts:43`) calls `reviewPullRequest` (`:190`) and stores `costUsd` and tokens on the run (`:244-248`). A failure in one agent doesn't affect the others.

## Cost aggregation

- `runCost` (`src/modules/reviews/cost.ts:22`): the stored cost wins; otherwise it estimates tokens × `PriceBook`. "No data" is `null`, never 0.
- `totalUsage` (`cost.ts:75`): all completed runs of a PR. Feeds the PR list COST column and the Overview total.
- `latestRoundUsage` (`cost.ts:51`): the newest `batchId` only. Feeds the Overview "Latest round" line.
- `usageForPulls` (`src/modules/reviews/repository/run.repo.ts:92`) computes both from one query. `PullsService` gets it as the injected `usageForPulls` function (`src/platform/container.ts:156`) and uses it for the list (`src/modules/pulls/service.ts:59`) and the detail (`:206`).

## Extension points

Layering rules (which file may import what) live in the `onion-architecture` skill (`../../.claude/skills/onion-architecture/SKILL.md`).

- **New feature module:** create `src/modules/<name>/routes.ts`, then add one import and one entry in `src/modules/index.ts`.
- **New external system:** add an adapter in `src/adapters/`, expose it from the `Container`, and add a mock in `mocks.ts`.
- **Contract change:** edit both `server/src/vendor/shared` and `client/src/vendor/shared`, because the two copies have already diverged.

## Invariants

- Migrations are not applied on boot; run `pnpm db:migrate`.
- Only `status='done'` runs count toward cost, so an in-flight round is not shown yet.
- `*.it.test.ts` needs Docker; every other test is hermetic.
