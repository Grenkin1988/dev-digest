# server — Fastify API + Drizzle/Postgres (`@devdigest/api`)

Package-level detail (stack, commands, request/DI flow) lives in `README.md`.

## Before answering
Search this package's `docs/`, `specs/` and `INSIGHTS.md` (start from `docs/README.md` and
`specs/README.md`) for what the user asks about FIRST — they are curated and may already
answer it — then read code.

## Commands
- `pnpm dev`: API on :3001 (tsx watch). Needs Postgres from `docker compose up -d` at the repo root.
- `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:generate`: apply migrations, load demo data, generate a migration from the schema.
- `pnpm test`: all tests. `*.it.test.ts` needs Docker.
- Unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'` · integration only: `pnpm exec vitest run .it.test`
- One file: `pnpm exec vitest run test/run-cost.test.ts`
- `pnpm typecheck` (don't use `npx tsc`, see `INSIGHTS.md`).
- On Windows, 8 tests in `git-adapter-safety` / `indexer-pipeline` fail even on a clean tree (see `INSIGHTS.md`).

## Conventions (not obvious from code)
- A new feature module is registered in `src/modules/index.ts` (one import + one entry).
- Zod contracts from `src/vendor/shared` are the route schemas (request AND response).
- External systems (LLM, GitHub, git, ast-grep, secrets) go through DI adapters
  (`src/platform/container.ts`); mocks live in `src/adapters/mocks.ts`.
- API keys are read only through `LocalSecretsProvider` (`src/adapters/secrets/local.ts`).

## Gotchas
- Migrations are NOT applied on boot: run `pnpm db:migrate`.
- `*.it.test.ts` needs Docker (real Postgres); all other tests are hermetic.
- The DB schema already holds every milestone's tables; unused ones stay empty.

## Do-not-touch
- `src/vendor/shared/` and `src/db/migrations/` — never hand-edit without coordination.

## Use when
- Routes, adapters, DI wiring → read `README.md`
- Repo indexing → read `src/modules/repo-intel/README.md`
- Writing tests → read `../TESTING.md`
- Adding or changing a module, route, service, repository, adapter or job handler → use the `onion-architecture` skill (`../.claude/skills/onion-architecture/`)
