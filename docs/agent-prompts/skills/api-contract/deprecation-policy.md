---
name: deprecation-policy
description: Require deprecate-then-remove instead of silent removal. Anything public that is removed or replaced must first be marked deprecated, keep working, point to its replacement, and carry a removal date or version; flag removals of things that were never deprecated and deprecations that lack a replacement or a timeline.
type: rubric
---

# deprecation-policy

Clients need time to migrate. The rule is: **mark → keep working → announce → remove
in the next major**. Never remove in one step what was public yesterday.

## A correct deprecation has all four
1. **A marker clients and tools can see**: `@deprecated` JSDoc on the type/export,
   `deprecated: true` in the OpenAPI / route schema, a `Deprecation` and/or `Sunset`
   response header on HTTP routes, a GraphQL `@deprecated(reason: …)`.
2. **A replacement** named in the marker ("use `displayName`").
3. **A timeline**: the version or date it will be removed.
4. **It still works** until that date — same behavior, same shape.

## Flag these
- Something public removed that was **never** marked deprecated in an earlier
  release. → CRITICAL (this is also a `breaking-change`; report it ONCE, under
  `breaking-change`, and mention the missing deprecation in the rationale).
- A deprecation marker with no replacement or no removal version/date. → WARNING.
- A deprecated element whose behavior was already changed or degraded ("deprecated"
  but now returns `null`). → CRITICAL — that is a silent break.
- A replacement added next to the old element with no `@deprecated` on the old
  one, so nobody knows to migrate. → SUGGESTION.
- Removal of something deprecated earlier, but sooner than the announced date or in
  a non-major release. → WARNING (see `semver-discipline` for the version).

## Do not flag
- Removal of something deprecated for the announced period, in a major release,
  with a changelog entry. That is the policy working.

## Example

**Bad** — silent removal:
```ts
// before
export function getPullDiff(id: string): Promise<string> { … }
// after: function deleted, callers fail to import
```

**Good** — kept, marked, pointing to the replacement, with a date:
```ts
/**
 * @deprecated Use `getPullPatch(id)`, which returns structured hunks.
 * Will be removed in v4.0.0 (not before 2027-03-01).
 */
export function getPullDiff(id: string): Promise<string> {
  return getPullPatch(id).then(toUnifiedDiff);
}
```

**Bad** — route marked deprecated but already returns a different shape:
```ts
app.get('/v1/reviews', { schema: { deprecated: true } }, async () => ({ data: rows }));
// used to return a bare array
```

**Good** — HTTP deprecation headers, same behavior until sunset:
```ts
app.get('/v1/reviews', { schema: { deprecated: true } }, async (req, reply) => {
  reply.header('Deprecation', 'true');
  reply.header('Sunset', 'Mon, 01 Mar 2027 00:00:00 GMT');
  reply.header('Link', '</v2/reviews>; rel="successor-version"');
  return rows; // unchanged shape
});
```
