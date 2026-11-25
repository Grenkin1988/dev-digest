---
name: breaking-change
description: Flag every removal, rename or incompatible change of a public API contract (route, param, request/response field, enum value, status code, exported symbol) that has no compatibility shim. Report it as CRITICAL when an existing client breaks on merge.
type: rubric
---

# breaking-change

A change is **breaking** when a client built against the old contract stops working,
unchanged, against the new one. Check every changed route, schema, DTO and export
against this list.

## Always breaking (CRITICAL unless a shim is in the same diff)
- A route removed, or its method or path changed (`GET /users/:id` → `GET /user/:id`).
- A path/query parameter renamed or removed, or its type changed.
- A request field that was optional becomes required, or a new required field is added.
- A response field removed or renamed.
- An enum value removed or renamed (input or output).
- A field's type changed incompatibly (`number` → `string`, `object` → `array`,
  `id: 42` → `id: "42"`).
- A success status code changed (`200` → `201`/`204`), or an error code clients
  branch on changed.
- An exported function, class or type removed, renamed, or its parameters reordered
  or made required.
- Auth tightened on an existing route (public → authenticated, new scope required).

## Not breaking — do not flag
- Adding a new route, a new OPTIONAL request field, or a new response field.
- Widening input (accepting more values, relaxing a limit).
- Renames that keep the old name working (alias, dual-read, redirect, re-export).
- Changes to code that is never serialized or exported.

## How to report
- Name the contract element, its old form, its new form, and one concrete client
  call that now fails.
- Look in `## Callers of changed symbols` and the rest of the diff for a caller still
  using the old name; cite it when found.
- Suggest the non-breaking route: keep the old name as an alias, add a new versioned
  route, or deprecate first (see `deprecation-policy`).

## Example

**Bad** — field renamed, old clients silently read `undefined`:
```ts
// before
return { id: user.id, userName: user.name };
// after
return { id: user.id, displayName: user.name };
```

**Good** — new name added, old name kept and marked deprecated:
```ts
return {
  id: user.id,
  displayName: user.name,
  /** @deprecated use displayName; removed in v3 (2027-03-01) */
  userName: user.name,
};
```

**Bad** — route path changed in place:
```ts
app.get('/api/v1/reviews/:id', handler);   // before
app.get('/api/v1/review/:reviewId', handler); // after — every existing caller 404s
```

**Good** — new route added, old one kept and forwarded:
```ts
app.get('/api/v1/review/:reviewId', handler);
app.get('/api/v1/reviews/:id', { schema: { deprecated: true } }, (req, reply) =>
  handler({ ...req, params: { reviewId: req.params.id } }, reply));
```
