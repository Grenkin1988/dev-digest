# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each lesson adds one feature.

## Stack
- `client/` — Next.js 15 (App Router) + React 19, TanStack Query, next-intl; web on :3000.
- `server/` — Fastify + Zod contracts, Drizzle ORM on Postgres + pgvector (Docker); API on :3001.
- `reviewer-core/` — pure TS review engine, consumed by the server as source via a path alias.
- `e2e/` — deterministic JSON browser flows on seeded data.
- Tooling: Node ≥ 22, pnpm ≥ 10, Vitest everywhere, Docker for Postgres.

## Commands
Run each from inside its package (each has its own lockfile). Full detail is in `README.md`.

| Task | Command |
|------|---------|
| Everything (Postgres + API + web) | `./scripts/dev.sh` |
| Postgres only | `docker compose up -d` |
| Migrate / seed DB (NOT run on boot) | `cd server && pnpm db:migrate && pnpm db:seed` |
| Dev servers | `cd server && pnpm dev` · `cd client && pnpm dev` |
| Tests | `pnpm test` in `server/`, `client/`, `reviewer-core/` |
| One test file | `pnpm exec vitest run <path>` |
| Typecheck | `pnpm typecheck` in any package |
| Lint (layer boundaries) | `pnpm lint` in `server/`, `client/` |
| E2E (hermetic, own ports + DB) | `cd e2e && pnpm e2e:hermetic` |

## Before answering
Always search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for what the
user asks about FIRST — these are curated and may already answer it — then read code.

## Session protocol
- **Start:** before touching a package, read its `INSIGHTS.md` and summarize the top 3
  relevant points back — this forces an active read and catches a silently-failed load.
- **Before recording an insight:** re-read that package's `INSIGHTS.md` and do not duplicate
  what's already there.
- **During and at end of session:** run `/engineering-insights` (also auto-triggers on
  non-obvious findings). Record only substantial, file-grounded, non-duplicate findings; if
  nothing substantial came up, write nothing — but don't skip the check. Writes are
  append-only (never overwrite an `INSIGHTS.md`). The only in-place edits allowed are
  (a) adding or refreshing `file:line` evidence, and (b) fixing an entry that this same
  session's code change made wrong. Any other correction is a new superseding entry.
- **Evidence:** every INSIGHTS entry cites `path/file.ts:NN (symbol)`. A line number is
  mandatory so the next developer knows where to look.
- **Adding a doc or spec:** add its row to that folder's `README.md` in the same change.

## Conventions (not obvious from code)
- NOT a monorepo workspace — each package has its own package.json/lockfile; cross-package code is shared via tsconfig path aliases.
- Modules are registered statically in `server/src/modules/index.ts` (no filesystem autoload).
- ESM: relative imports carry the `.js` extension.
- `AGENTS.md` is the source of truth for agent instructions; each `CLAUDE.md` is a one-line `@AGENTS.md` stub so Claude Code loads it — edit `AGENTS.md`, never the stub.

## Do-not-touch
- `server/src/vendor/shared/` and `server/src/db/migrations/` — never hand-edit without coordination.

## Use when
- Stack, commands, architecture, how to run → read `README.md`
- Working inside a package → read that package's AGENTS.md: `server/AGENTS.md`, `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `e2e/AGENTS.md`
- Writing or changing tests → read `TESTING.md`
- Repo indexing → read `server/src/modules/repo-intel/README.md`
- Agent prompt templates → read `docs/agent-prompts/`
- Recording a finding into a module's `INSIGHTS.md` → use the `engineering-insights` skill (`.claude/skills/engineering-insights/`)
- Before opening or merging a PR (or when the gate hook blocks `gh pr …`) → run the `pr-self-review` skill (`.claude/skills/pr-self-review/`); never bypass the gate unless the user explicitly asks
