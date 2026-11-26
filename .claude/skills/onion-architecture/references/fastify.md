# Fastify as the presentation ring

Fastify is a delivery mechanism. Route plugins are **driving adapters**: they translate HTTP
into one application call and translate the result (or an `AppError`) back into HTTP.

## Rules

1. **One plugin per module** (`modules/<name>/routes.ts`), default-exported and registered
   statically in `modules/index.ts`. No filesystem autoload (see the comment in
   `modules/index.ts`).
2. **Build the service once per plugin** at the top of the plugin function, from
   `app.container`, the way `repos/routes.ts:21` does. Never build one per request.
3. **Handler shape**: `schema` (Zod contract) → `getContext(app.container, req)`
   (`_shared/context.ts:14`) → `await service.method(workspaceId, …)` → `reply.status(...)` if
   it isn't 200 → return the DTO. If a handler needs an `if` about business state, that `if`
   belongs in the service.
4. **No persistence or SDK calls in routes**: no `container.db`, `drizzle-orm`, `db/schema`,
   repository or adapter imports.
5. **Errors**: throw `AppError` / `NotFoundError` from inner rings. The global handler
   (`app.ts:129`) maps Zod validation → 422, `AppError` → its status, and response
   serialization errors → a generic 500. Routes don't catch and reshape.
6. **Response schemas** use the same `vendor/shared` contracts, so serialization enforces the
   boundary shape on the way out, too.
7. **Encapsulation is infrastructure.** Each `register()` makes a child context. Decorators and
   hooks don't leak to parents ("Parent contexts cannot access entities within their descendant
   contexts"). Use `fastify-plugin` only for genuinely app-wide concerns (security headers,
   rate limit, `container` decoration). A feature module never wraps itself in `fastify-plugin`.
8. **Fastify types stay out of inner rings.** Services take `workspaceId`/`userId`/plain values,
   never `FastifyRequest`. A logger is passed as a minimal interface (see the `Logger` type
   exported from `reviews/run-executor.ts`), not `FastifyBaseLogger`.
9. **Long-running work**: the route returns ids, and the work runs in a service-owned background
   path or a JobRunner job. SSE endpoints only subscribe to `runBus`.

## Why not @fastify/awilix?
We already have a hand-written composition root (`Container`). Seemann calls this "Pure DI"
and treats it as fully valid. A second container would split wiring across two places. Revisit
this only if the `Container` getters become unmanageable.

See `fastify-best-practices` for the API itself (hooks, schemas, plugins, testing with `inject`).
