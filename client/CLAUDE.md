# client — Next.js 15 web app (`@devdigest/web`)

Package-level detail (stack, commands, UI route map) lives in `README.md`.

## Before answering
Search this package's `docs/`, `specs/` and `INSIGHTS.md` (start from `docs/README.md` and
`specs/README.md`) for what the user asks about FIRST — they are curated and may already
answer it — then read code.

## Commands
- `pnpm dev`: web on :3000 (expects the API on :3001).
- `pnpm test`: Vitest + React Testing Library · one file: `pnpm exec vitest run <path>`
- `pnpm typecheck`: run it as well as tests. It catches contract mismatches that vitest
  doesn't, e.g. invalid `Severity` values in fixtures.
- `pnpm build`: production build.

## Conventions (not obvious from code)
- Data only through the TanStack Query hooks in `src/lib/hooks/*` over `src/lib/api.ts`.
- UI strings go through next-intl (`messages/<locale>/*.json`), not literals.
- `@/*` is the path alias for `src/*`.

## Gotchas
- `src/vendor/shared` is a separate, already-diverged copy of `server/src/vendor/shared`;
  a contract change must be made in both places.
- Component tests mock `fetch`; they never call the real API.

## Do-not-touch
- `src/vendor/ui/` and `src/vendor/shared/` — never hand-edit without coordination.

## Use when
- Routes and screens → read `README.md`
- Writing tests → read `../TESTING.md`
