# Severity rubric

One scale for every source: `CRITICAL | WARNING | SUGGESTION` (the vocabulary of
`docs/agent-prompts/README.md`). **Only CRITICAL blocks the PR.** Every routed skill has its own
scale (react-best-practices tags rules CRITICAL/HIGH/MEDIUM, zod tags categories CRITICAL,
security uses CRITICAL/HIGH/MEDIUM/LOW, the others have none). A skill's label is an input, not
the verdict. Map it like this:

| Source / situation | Severity here |
|---|---|
| `tsc` error in a touched package | CRITICAL (deterministic) |
| ESLint **error** in a changed file (includes the onion/frontend layer-boundary rules in `server/eslint.config.mjs`, `client/eslint.config.mjs`) | CRITICAL (deterministic) |
| ESLint error in an unchanged file | WARNING (pre-existing) |
| ESLint warning in a changed file | WARNING |
| A lint or typecheck that could not run (no `node_modules`, crash) | CRITICAL: an unverified gate is not a pass |
| A routed skill whose review did not complete | CRITICAL (coverage) |
| Hand-edit/delete of an existing file in `server/src/db/migrations/` | CRITICAL (AGENTS.md do-not-touch) |
| `server/src/vendor/shared/`, `client/src/vendor/shared/` (do-not-touch, there is no upstream: a contract change is made here): **breaking** edit, meaning any removed/changed line, a new *required* member in an existing schema/interface (`x: z.string()`, `foo(): T`), other added code inside an existing declaration (`.strict()`, `.refine`), a deleted or renamed file | CRITICAL |
| … **additive** edit: only new top-level declarations, new optional members (`.optional()`, `.nullish()`, `.default()`, `name?:`), comments, a new file | WARNING (mention the coordination in the PR) |
| `client/src/vendor/ui/`: any removed line, delete or rename | CRITICAL; additions only → WARNING |
| `vendor/shared` file changed in one copy while its counterpart exists and wasn't touched | WARNING |
| `CLAUDE.md` that is no longer exactly `@AGENTS.md` | CRITICAL |
| New migration file | WARNING (confirm it was generated and coordinated) |
| New doc/spec with no row in its folder README; lockfile without manifest change; installed skill not routed | WARNING |
| **onion-architecture / frontend-architecture**: a source dependency that points outward (route → Drizzle/db, service → Fastify/Drizzle/Container, domain → I/O, an SDK outside `src/adapters`, shared UI → feature/route, cross-feature import) that lint does not catch | CRITICAL |
| … the same rule bent but no wrong-direction import (logic in the wrong file, oversized route, misplaced helper) | WARNING |
| **security**: exploitable issue in the diff (injection, missing auth on a route, secret in code, path traversal, unsafe `exec`, XSS sink with user data) = skill CRITICAL/HIGH | CRITICAL |
| … security hardening, defense in depth, skill MEDIUM/LOW | WARNING / SUGGESTION |
| **react-best-practices** CRITICAL rule broken *with a concrete bug* (conditional hook, mutating state, missing key causing wrong reconciliation, effect loop) | CRITICAL |
| … CRITICAL-tagged rule broken without a concrete failure (e.g. a component over 200 lines, derived state that is still correct) | WARNING |
| **zod / fastify / drizzle / postgres**: a request body/param/env used without validation at a trust boundary; a query that can corrupt data or skip a transaction it needs; a schema change that loses data | CRITICAL |
| … non-idiomatic but correct usage | WARNING / SUGGESTION |
| **next-best-practices**: server-only code or secrets reaching a client component; broken RSC boundary that fails at build or run time | CRITICAL |
| typescript-expert: `any`/casts that hide a real type error at the boundary | WARNING; style → SUGGESTION |
| Missing tests for new logic | WARNING |
| Naming, formatting, comments, "could be cleaner" | SUGGESTION |

## Anti-inflation rule (verbatim intent of docs/agent-prompts/README.md)

Only `CRITICAL` blocks merge, so a reviewer that calls everything CRITICAL turns every PR into a
blocker. Speculative issues ("might be", "could", "if not already handled") are **at most WARNING**.
A CRITICAL needs: an exact `file:line` in this diff, the rule it breaks, and the concrete failure.
After that, a verifier must confirm it, or `finalize.mjs` downgrades it to WARNING.

Zero findings is a good answer. There is no quota. Duplicates are forbidden.
