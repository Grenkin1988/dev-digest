# Zod contracts at the boundary

## Rules

1. **Contracts live in `src/vendor/shared/contracts/*`** and are the request *and* response
   schemas of every route (`fastify-type-provider-zod`). They are the DTO vocabulary of the
   whole system, so they sit in the center (shared kernel). Don't hand-edit them without
   coordination. A contract change has to be made in both the server and client copies
   (`server/docs/architecture.md`, "Extension points").
2. **Parse, don't validate** (Alexis King). Parse untrusted input once, at the outermost edge,
   into a precise type. Everything inward takes that type and never re-checks it. The edges
   are: route `schema` (HTTP), the job handler (the payload is read back from the DB, so treat
   it as untrusted, because rows may predate a schema change; see the comment at
   `repos/service.ts:49`), and
   adapters (LLM/GitHub responses parsed into contract types before they are returned).
   For job payloads, `runCloneJob` today re-checks with `isValidRepoRef` and rebuilds the URL
   instead of trusting `payload.url`. New job kinds should give the payload a Zod schema
   and parse it on the first line of the handler.
3. **No "shotgun parsing"**: no `Schema.parse` scattered through services or helpers on data
   that a boundary already parsed.
4. **Module-local input schemas** used only by routes go in `_shared/schemas.ts` (generic,
   e.g. `IdParams`) or the module's `routes.ts`. They stay in presentation.
5. **Mapping direction**: row → contract mapping is the repository's or a pure helper's job
   (see the deviation note about `toRepoDto` in SKILL.md §6). Routes never reshape rows.
6. **Domain invariants that Zod can't express** (cross-field rules, state transitions) are
   domain functions that throw `AppError`, not `.superRefine` buried in a contract that the
   client also ships.

See the `zod` skill for schema syntax and `safeParse` and error handling.
