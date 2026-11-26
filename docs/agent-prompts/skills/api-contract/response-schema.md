---
name: response-schema
description: Check every change to a response's shape — field types, nullability, required vs optional, enum values, nesting, formats — and flag any change that a client parsing the old shape would mishandle, plus any mismatch between the declared response schema and what the handler actually returns.
type: rubric
---

# response-schema

Clients parse responses with strict types, generated SDKs and exhaustive `switch`
statements. A response that is "almost the same" is a broken response for them.

## Flag these
- **Type change**: `count: number` → `count: string`; `createdAt` from ISO string to
  epoch number; money from integer cents to decimal string. → CRITICAL.
- **Presence weakened**: a field that was always present becomes optional, nullable
  or conditionally omitted (`email: string` → `email?: string | null`). Clients that
  do `user.email.toLowerCase()` crash. → CRITICAL.
- **Shape change**: object ↔ array, a field moved into a nested object, a bare list
  wrapped in `{ items: [...] }` (or unwrapped). → CRITICAL.
- **New enum value on output**: `status` gains `"archived"`. Clients with an
  exhaustive switch fall through. → WARNING (CRITICAL if the project documents enums
  as closed).
- **Schema / handler drift**: the declared response schema (Zod, JSON Schema,
  OpenAPI, TS return type) says one thing, the handler can return another — e.g. the
  schema says `string` but the DB value is nullable; the handler adds a field the
  schema strips; the schema marks a field required that the handler sometimes skips.
  → WARNING, CRITICAL if a real client path receives the wrong shape.
- **Semantic change with the same type**: units, timezone, sort order, id format or
  default page size changed while the type stayed the same. → WARNING.

## Do not flag
- A new optional field added to a response.
- A field made stricter on output (nullable → always present).
- Changes that are also reflected in a new API version with the old version intact.

## How to report
Quote the old and new declaration side by side, name one client-side expression that
now misbehaves, and suggest the compatible form (keep the old field, add a new one;
or version the response).

## Example

**Bad** — required field made nullable, schema updated to hide it:
```ts
// before
const UserDto = z.object({ id: z.string(), email: z.string() });
// after
const UserDto = z.object({ id: z.string(), email: z.string().nullable() });
```

**Good** — keep the guarantee on the existing field; expose the new state separately:
```ts
const UserDto = z.object({
  id: z.string(),
  email: z.string(),               // unchanged: still always a string
  emailVerified: z.boolean().optional(), // new, optional, additive
});
```

**Bad** — handler returns a shape the schema does not describe:
```ts
schema: { response: { 200: z.object({ items: z.array(Review) }) } },
handler: async () => reviews,      // bare array, not { items }
```

**Good** — handler and schema agree:
```ts
handler: async () => ({ items: reviews }),
```
