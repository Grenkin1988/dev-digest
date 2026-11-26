# Drizzle in the infrastructure ring

A repository is "a collection-like interface" between the domain and data mapping (Fowler). It
is the only code that knows Drizzle and the table layout.

## Rules

1. **Only repositories import `drizzle-orm` and `db/schema`.** A module's tables are touched only
   by its own repository (`repos/repository.ts`: "The ONLY place that touches the `repos`
   table"). Big modules split it into `repository/*.repo.ts` behind one facade
   (`reviews/repository.ts`).
2. **Constructor takes `Db`** (`db/client.ts:5`). The `Container` or the composition step builds
   the repository. Services don't.
3. **Intent-named methods**, every one scoped by `workspaceId` (tenancy guard):
   `getById(workspaceId, id)`, `findByFullName(...)`. Don't accept a raw `where`/`SQL` fragment
   from callers, and don't return a query builder.
4. **Return types**: `$inferSelect` row types (e.g. `RepoRow`) may cross into the application
   ring, because they are plain data. Mapping to the contract DTO happens before the route
   (helper or repository). Schema objects (`t.repos`) never leave the repository.
5. **Transactions** (`db.transaction(async (tx) => …)`) are a unit-of-work decision. Our rule:
   - If the atomic step is one intent (e.g. "replace a PR's files and commits",
     `pulls/routes.ts:206-230` today), make it **one repository method** that opens the
     transaction inside.
   - If a use case needs several repositories to commit together, add a
     `withTransaction<T>(fn: (repos) => Promise<T>)` method on a repository/port that builds
     tx-bound repository instances. The service decides *what* is atomic. Drizzle decides *how*.
   - `tx` must never appear in a service signature.
   Drizzle's docs only cover the API ("embed business logic to the transaction and rollback"),
   so the layering is our convention.
6. **Pure aggregation** over fetched rows belongs in the domain (`reviews/cost.ts`), and the
   repository just loads the rows (`reviews/repository/run.repo.ts` `usageForPulls`).
7. **Migrations** (`src/db/migrations/`) are generated (`pnpm db:generate`), never hand-edited.
   Schema changes go in `src/db/schema.ts`.

See `drizzle-orm-patterns` for query syntax and `postgresql-table-design` for schema design.
