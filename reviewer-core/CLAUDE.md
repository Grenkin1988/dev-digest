# reviewer-core — pure review engine (`@devdigest/reviewer-core`)

Package-level detail (pipeline diagram, commands) lives in `README.md`.

## Before answering
Search this package's `docs/`, `specs/` and `INSIGHTS.md` (start from `docs/README.md` and
`specs/README.md`) for what the user asks about FIRST — they are curated and may already
answer it — then read code.

## Conventions (not obvious from code)
- Pure logic: NO database, GitHub or filesystem access. The only side effect is an
  LLM call through the injected `LLMProvider`.
- Untrusted input (diff, repo text) is fenced with `wrapUntrusted()` + `INJECTION_GUARD`.
- Never bypass `groundFindings()`: every finding must be validated against the diff.

## Gotchas
- The package never emits JS; the server consumes the TS source via a tsconfig path alias.
- `@devdigest/shared` resolves to `../server/src/vendor/shared` (not the client copy).

## Do-not-touch
- `../server/src/vendor/shared/` — never hand-edit without coordination.

## Use when
- Pipeline changes (prompt, structured output, grounding) → read `README.md`
- Agent prompt templates → read `../docs/agent-prompts/`
- Writing tests → read `../TESTING.md`
