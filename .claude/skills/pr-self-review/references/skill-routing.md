# Skill routing

Which skill reviews which changed file. The executable copy of this table is `ROUTES` in
[`../scripts/routing.mjs`](../scripts/routing.mjs); `route.mjs` uses it. **Change both together.**
A file collects the union of every matching route. Tests (`*.test.*`, `test/`) are excluded from
the source routes and get their own.

## UI (`client/`)

| Files | Skills |
|---|---|
| `client/src/**/*.{ts,tsx}` (not tests, not `client/src/vendor/**`) | frontend-architecture, typescript-expert |
| `client/src/**/*.tsx`, `**/hooks/**`, `use*.ts` | react-best-practices |
| `client/src/app/**`, `client/next.config.*`, `client/src/middleware.ts`, `client/src/i18n/**` | next-best-practices |
| `client/**/*.test.{ts,tsx}`, `client/src/test/**` | react-testing-library |
| `client/src/lib/**/*.ts`, `*schema*`/`*contract*` files | zod |

## Backend (`server/`)

| Files | Skills |
|---|---|
| `server/src/**/*.ts`, `server/scripts/**` (not tests, vendor, migrations) | onion-architecture, typescript-expert |
| `server/test/**`, `server/**/*.test.ts` | onion-architecture (its `references/testing.md`) |
| `**/routes.ts`, `routes/**`, `app.ts`, `server.ts`, `index.ts`, `platform/**`, `plugins/**` | fastify-best-practices |
| `**/repository.ts`, `repository/**`, `queries.ts`, `server/src/db/**` (not migrations), `drizzle.config.*` | drizzle-orm-patterns |
| `server/src/db/schema.ts`, `server/src/db/schema/**`, migration `*.sql` | postgresql-table-design |
| `**/routes.ts`, `*schema*`/`*contract*` files, `platform/config.ts`, `platform/structured.ts` | zod |

## reviewer-core / e2e

| Files | Skills |
|---|---|
| `reviewer-core/src/**/*.ts` | onion-architecture (its reviewer-core rules), typescript-expert |
| `reviewer-core/src/**/types.ts`, `*schema*`/`*contract*` | zod |
| `e2e/**/*.ts` | typescript-expert |

## Security

- **By path:** routes, `adapters/{auth,secrets,github,git}`, `platform/{config,contained-read,local-only}.ts`,
  `client/src/app/api/**`, `client/src/middleware.ts`, `client/next.config.*`, `.github/workflows/**`,
  `docker-compose.yml`, `.env*`.
- **By content:** any other non-test code file whose *added* lines match `SECURITY_CONTENT_RE`
  (secrets/tokens/auth, `process.env`, `exec`/`spawn`, `eval`, `innerHTML`, raw SQL, file paths, CORS, redirects).

## Not reviewed by a skill

- Ignored entirely: `node_modules`, `dist`, `.next`, `coverage`, `*.tsbuildinfo`, lockfiles, `server/clones/**`,
  `server/src/db/migrations/meta/**`. Lockfiles are still checked by the rules (lockfile without manifest → WARNING).
- No skill, but still covered by rules: docs, markdown, root config, `.claude/**`. They are listed under
  `unreviewed` in the report.
- Skills that are excluded on purpose (`EXCLUDED_SKILLS`): `mermaid-diagram` (authoring aid),
  `engineering-insights` (session notes), `pr-self-review` (this skill).

## Drift check

`route.mjs` lists `.claude/skills/*/SKILL.md`. Any installed skill that is neither routed nor excluded
becomes a WARNING, so a newly added skill can't silently review nothing. When you add a skill, add it
to `ROUTES` (or `EXCLUDED_SKILLS` with a reason) and to this file.
