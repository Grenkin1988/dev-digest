# Examples — good vs bad insights

The test: **"if it would be obvious to anyone reading the code — don't write it."**
An entry must be actionable "cold": the next agent reads it and KNOWS what to do, without digging.

## Vague vs useful (from the course slides, illustrative)

| ❌ Bad (noise) | ✅ Good (lesson) |
|---|---|
| "Promises can be tricky" | "`Promise.all()` in the ingest pipeline times out after ~30 items — in this module use `Promise.allSettled()` in batches of 10" |
| "be careful with async" | "checkout-flow state always goes through Zustand (`cartStore.ts`) because 3 components share the cart; local state does not work here" |

What makes the right column work: a concrete place, a concrete symptom, a concrete action, and the reason.

## One example per section (format illustrations — not real findings)

```
## What Works
- **2026-11-20** — To reproduce a review run without GitHub, seed the PR fixture and call the service directly → skips OAuth entirely. Evidence: `server/src/modules/reviews/service.ts:42` (runReview).

## What Doesn't Work
- **2026-11-20** — Mocking the LLM client at module level breaks the retry wrapper (it captures the real client at import) → inject the client via the factory instead. Evidence: `reviewer-core/src/llm/client.ts:18` (createClient).

## Codebase Patterns
- **2026-11-20** — Review findings are deduplicated by (file, line, ruleId) before persisting, so re-runs are idempotent → never insert findings directly, go through the repository helper. Evidence: `server/src/modules/reviews/repository.ts:77` (upsertFindings).

## Tool & Library Notes
- **2026-11-20** — Drizzle `onConflictDoUpdate` needs the target columns to match a unique index exactly, else Postgres errors at runtime, not at type-check → add the index first. Evidence: `server/src/db/schema.ts:120` (findings).

## Recurring Errors & Fixes
- **2026-11-20** — `ERR_MODULE_NOT_FOUND` after adding a file → a relative import is missing the `.js` extension. Evidence: `server/src/modules/index.ts:3`.

## Session Notes
### 2026-11-20
- Added PR-size guard to the reviewer; large diffs now chunked before prompting.
- Decided to keep chunking in reviewer-core, not server (server stays transport-only).

## Open Questions
- **2026-11-20** — Unclear whether repo-intel re-indexes on force-push or only on new commits; observed a stale index once, not reproduced. Evidence: `server/src/modules/repo-intel/service.ts` (reindex).
```

## Never write

- Generic best practices ("write tests", "handle errors", "use TypeScript strictly").
- Chat replays or step-by-step narratives of what happened — extract the lesson, not the story.
- Things already stated in `README.md`, any `CLAUDE.md`, `docs/` or `specs/` (e.g. "relative imports carry `.js`" as a bare rule is already in CLAUDE.md — only write it if you add a non-obvious symptom/fix).
- Line numbers alone as the only anchor — always add the symbol name; lines drift.
- Unverified guesses stated as fact — those go to **Open Questions**.
- Secrets, tokens, credentials, personal data, customer content.
