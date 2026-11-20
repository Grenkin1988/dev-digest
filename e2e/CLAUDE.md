# e2e — deterministic browser flows (`@devdigest/e2e`)

Package-level detail (how a flow works, commands) lives in `README.md`.

## Before answering
Search this package's `docs/`, `specs/` and `INSIGHTS.md` (start from `docs/README.md` and
`specs/README.md`) for what the user asks about FIRST — they are curated and may already
answer it — then read code.

## Conventions (not obvious from code)
- A flow is `specs/NN-name.flow.json`; `run.ts` runs only files ending in `.flow.json`.
- Flows use seeded demo data and no LLM, so they stay deterministic.
- Design notes go in `docs/`, not in `specs/` (which holds executable flows plus its index).

## Gotchas
- `../scripts/e2e.sh` uses alternate ports and an ephemeral Postgres; it never touches
  the dev DB.

## Do-not-touch
- Existing `specs/*.flow.json` numbering — add new flows with the next number.

## Use when
- Adding or changing a flow → read `README.md`
- Writing tests in general → read `../TESTING.md`
