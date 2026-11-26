/**
 * Starter skills used by the seed. A skill is reusable instruction text that an
 * agent links (agent_skills, in order) and that is appended to its prompt under
 * "## Skills / rules". Text only — a skill can never call a tool.
 *
 * `agent` names the built-in agent the skill is linked to on a fresh seed; the
 * user can re-link freely afterwards in the UI.
 */
export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  agent: string;
  body: string;
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'branch-coverage-gate',
    description:
      'Flag every new or changed branch in production code that no test in the PR exercises; name the branch and the assertion to add.',
    type: 'rubric',
    agent: 'Test Quality Reviewer',
    body: `# Branch coverage gate

For each changed file outside test directories, list the branches the diff adds or
alters: if/else arms, switch cases, early returns, catch blocks, ternaries, default
values, feature-flag paths.

For each branch, look for a test in THIS diff that takes it and asserts the outcome.

- A branch with no such test is a finding. Name the branch (file:line of the
  condition) and the input that reaches it.
- Treat a test that only covers the happy path as covering one branch, not all.
- An error path (catch, rejected promise, non-2xx) with no test is WARNING; a
  changed behaviour with no test at all is CRITICAL.
- Do not ask for tests of lines the diff did not touch.
`,
  },
  {
    name: 'corner-case-hunter',
    description:
      'Check that tests include boundary and degenerate inputs (empty, null, zero, max, duplicate, malformed) for every changed input-handling path.',
    type: 'rubric',
    agent: 'Test Quality Reviewer',
    body: `# Corner-case hunter

For every function or route in the diff that takes input, ask which of these the
code handles and whether a test proves it:

- empty string / empty array / empty object, null and undefined
- zero, negative numbers, exactly-at-the-limit and one-past-the-limit values
- duplicates, unordered input, very large input
- unicode, whitespace-only strings, malformed or truncated payloads
- concurrent or repeated calls where the code keeps state

Report only cases the code visibly handles or should handle. Each finding states the
exact input and the expected result, e.g. "limit=0 returns [] — no test".
`,
  },
  {
    name: 'mock-discipline',
    description:
      'Flag tests that mock the unit under test, assert only on their own mocks, or mock cheap deterministic collaborators.',
    type: 'convention',
    agent: 'Test Quality Reviewer',
    body: `# Mock discipline

House rules for mocking in this repository:

- Mock only boundaries: GitHub, git, LLM providers, the clock, the network. Use the
  shared mocks in adapters/mocks.ts.
- Never mock the unit under test, a pure helper, or an in-memory repository.
- A test whose only assertion is "the mock was called with X" (where X came from
  the test itself) proves nothing — ask for an assertion on observable output.
- Mock return values must be shapes the real dependency can produce. Flag mocks that
  return impossible values or always succeed when the code has a failure path.
- Prefer a real Postgres (*.it.test.ts) for repository logic over a mocked db.
`,
  },
  {
    name: 'breaking-change',
    description:
      'Flag every removal, rename or incompatible change of a public API contract (route, param, request/response field, enum value, status code, exported symbol) that has no compatibility shim. Report it as CRITICAL when an existing client breaks on merge.',
    type: 'rubric',
    agent: 'API Contract Reviewer',
    body: `# breaking-change

A change is **breaking** when a client built against the old contract stops working,
unchanged, against the new one. Check every changed route, schema, DTO and export
against this list.

## Always breaking (CRITICAL unless a shim is in the same diff)
- A route removed, or its method or path changed (\`GET /users/:id\` → \`GET /user/:id\`).
- A path/query parameter renamed or removed, or its type changed.
- A request field that was optional becomes required, or a new required field is added.
- A response field removed or renamed.
- An enum value removed or renamed (input or output).
- A field's type changed incompatibly (\`number\` → \`string\`, \`object\` → \`array\`,
  \`id: 42\` → \`id: "42"\`).
- A success status code changed (\`200\` → \`201\`/\`204\`), or an error code clients
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
- Look in \`## Callers of changed symbols\` and the rest of the diff for a caller still
  using the old name; cite it when found.
- Suggest the non-breaking route: keep the old name as an alias, add a new versioned
  route, or deprecate first (see \`deprecation-policy\`).

## Example

**Bad** — field renamed, old clients silently read \`undefined\`:
\`\`\`ts
// before
return { id: user.id, userName: user.name };
// after
return { id: user.id, displayName: user.name };
\`\`\`

**Good** — new name added, old name kept and marked deprecated:
\`\`\`ts
return {
  id: user.id,
  displayName: user.name,
  /** @deprecated use displayName; removed in v3 (2027-03-01) */
  userName: user.name,
};
\`\`\`

**Bad** — route path changed in place:
\`\`\`ts
app.get('/api/v1/reviews/:id', handler);   // before
app.get('/api/v1/review/:reviewId', handler); // after — every existing caller 404s
\`\`\`

**Good** — new route added, old one kept and forwarded:
\`\`\`ts
app.get('/api/v1/review/:reviewId', handler);
app.get('/api/v1/reviews/:id', { schema: { deprecated: true } }, (req, reply) =>
  handler({ ...req, params: { reviewId: req.params.id } }, reply));
\`\`\`
`,
  },
  {
    name: 'response-schema',
    description:
      'Check every change to a response\'s shape — field types, nullability, required vs optional, enum values, nesting, formats — and flag any change that a client parsing the old shape would mishandle, plus any mismatch between the declared response schema and what the handler actually returns.',
    type: 'rubric',
    agent: 'API Contract Reviewer',
    body: `# response-schema

Clients parse responses with strict types, generated SDKs and exhaustive \`switch\`
statements. A response that is "almost the same" is a broken response for them.

## Flag these
- **Type change**: \`count: number\` → \`count: string\`; \`createdAt\` from ISO string to
  epoch number; money from integer cents to decimal string. → CRITICAL.
- **Presence weakened**: a field that was always present becomes optional, nullable
  or conditionally omitted (\`email: string\` → \`email?: string | null\`). Clients that
  do \`user.email.toLowerCase()\` crash. → CRITICAL.
- **Shape change**: object ↔ array, a field moved into a nested object, a bare list
  wrapped in \`{ items: [...] }\` (or unwrapped). → CRITICAL.
- **New enum value on output**: \`status\` gains \`"archived"\`. Clients with an
  exhaustive switch fall through. → WARNING (CRITICAL if the project documents enums
  as closed).
- **Schema / handler drift**: the declared response schema (Zod, JSON Schema,
  OpenAPI, TS return type) says one thing, the handler can return another — e.g. the
  schema says \`string\` but the DB value is nullable; the handler adds a field the
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
\`\`\`ts
// before
const UserDto = z.object({ id: z.string(), email: z.string() });
// after
const UserDto = z.object({ id: z.string(), email: z.string().nullable() });
\`\`\`

**Good** — keep the guarantee on the existing field; expose the new state separately:
\`\`\`ts
const UserDto = z.object({
  id: z.string(),
  email: z.string(),               // unchanged: still always a string
  emailVerified: z.boolean().optional(), // new, optional, additive
});
\`\`\`

**Bad** — handler returns a shape the schema does not describe:
\`\`\`ts
schema: { response: { 200: z.object({ items: z.array(Review) }) } },
handler: async () => reviews,      // bare array, not { items }
\`\`\`

**Good** — handler and schema agree:
\`\`\`ts
handler: async () => ({ items: reviews }),
\`\`\`
`,
  },
  {
    name: 'semver-discipline',
    description:
      'Decide what version bump a contract change requires and flag the PR when the bump it ships (package.json version, API version prefix, changelog entry) is smaller than that. Any breaking change requires a MAJOR bump or a new API version; never accept a breaking change under a minor or patch.',
    type: 'rubric',
    agent: 'API Contract Reviewer',
    body: `# semver-discipline

Version numbers are a promise to clients: **MAJOR** = may break you, **MINOR** = new
things, nothing broken, **PATCH** = fixes only, nothing new, nothing broken.

## Classify the change
| Change in the diff | Required bump |
|---|---|
| Anything listed in \`breaking-change\` or the CRITICAL cases of \`response-schema\` | **MAJOR** (or a new API version: \`/v2/…\`) |
| New route, new optional input field, new output field, new export | MINOR |
| Bug fix that makes behavior match the documented contract | PATCH |
| Deprecation marker added (nothing removed) | MINOR |
| Removal of something already deprecated for the agreed period | MAJOR |

The bump is decided by the **most severe** change in the PR, not the majority.

## Flag these
- A breaking change with a MINOR or PATCH bump in \`package.json\`, a library
  \`version\` constant, or the changelog. → CRITICAL.
- A breaking change to a versioned HTTP API (\`/v1/…\`) made in place instead of in a
  new version. → CRITICAL.
- A breaking change in a package or API that is versioned, with no version change
  and no changelog entry at all. → WARNING (the reviewer may not see release
  tooling; say so).
- A MAJOR bump with no breaking change listed in the changelog. → SUGGESTION.
- A changelog entry that describes a breaking change as "refactor", "cleanup" or
  "chore". → WARNING.

## Do not flag
- Projects with no versioning (unpublished apps, no version prefix, no changelog) —
  \`breaking-change\` already covers the break itself; do not duplicate it here.
- Pre-1.0 packages (\`0.x\`) where the project explicitly documents that minors may
  break — mention it in the summary instead.

## Example

**Bad** — field removed, shipped as a minor:
\`\`\`diff
- "version": "2.4.1"
+ "version": "2.5.0"
  ## 2.5.0
- - Removed \`legacyId\` from \`Review\` responses
+ - Cleanup: dropped unused \`legacyId\`
\`\`\`

**Good** — breaking removal shipped as a major, called out as breaking:
\`\`\`diff
+ "version": "3.0.0"
  ## 3.0.0
+ ### BREAKING
+ - \`Review.legacyId\` removed (deprecated since 2.3.0). Use \`Review.id\`.
\`\`\`

**Bad** — in-place change of a versioned route:
\`\`\`ts
app.get('/v1/pulls/:id', newShapeHandler);
\`\`\`

**Good** — new version added, old one kept:
\`\`\`ts
app.get('/v1/pulls/:id', oldShapeHandler);
app.get('/v2/pulls/:id', newShapeHandler);
\`\`\`
`,
  },
  {
    name: 'deprecation-policy',
    description:
      'Require deprecate-then-remove instead of silent removal. Anything public that is removed or replaced must first be marked deprecated, keep working, point to its replacement, and carry a removal date or version; flag removals of things that were never deprecated and deprecations that lack a replacement or a timeline.',
    type: 'rubric',
    agent: 'API Contract Reviewer',
    body: `# deprecation-policy

Clients need time to migrate. The rule is: **mark → keep working → announce → remove
in the next major**. Never remove in one step what was public yesterday.

## A correct deprecation has all four
1. **A marker clients and tools can see**: \`@deprecated\` JSDoc on the type/export,
   \`deprecated: true\` in the OpenAPI / route schema, a \`Deprecation\` and/or \`Sunset\`
   response header on HTTP routes, a GraphQL \`@deprecated(reason: …)\`.
2. **A replacement** named in the marker ("use \`displayName\`").
3. **A timeline**: the version or date it will be removed.
4. **It still works** until that date — same behavior, same shape.

## Flag these
- Something public removed that was **never** marked deprecated in an earlier
  release. → CRITICAL (this is also a \`breaking-change\`; report it ONCE, under
  \`breaking-change\`, and mention the missing deprecation in the rationale).
- A deprecation marker with no replacement or no removal version/date. → WARNING.
- A deprecated element whose behavior was already changed or degraded ("deprecated"
  but now returns \`null\`). → CRITICAL — that is a silent break.
- A replacement added next to the old element with no \`@deprecated\` on the old
  one, so nobody knows to migrate. → SUGGESTION.
- Removal of something deprecated earlier, but sooner than the announced date or in
  a non-major release. → WARNING (see \`semver-discipline\` for the version).

## Do not flag
- Removal of something deprecated for the announced period, in a major release,
  with a changelog entry. That is the policy working.

## Example

**Bad** — silent removal:
\`\`\`ts
// before
export function getPullDiff(id: string): Promise<string> { … }
// after: function deleted, callers fail to import
\`\`\`

**Good** — kept, marked, pointing to the replacement, with a date:
\`\`\`ts
/**
 * @deprecated Use \`getPullPatch(id)\`, which returns structured hunks.
 * Will be removed in v4.0.0 (not before 2027-03-01).
 */
export function getPullDiff(id: string): Promise<string> {
  return getPullPatch(id).then(toUnifiedDiff);
}
\`\`\`

**Bad** — route marked deprecated but already returns a different shape:
\`\`\`ts
app.get('/v1/reviews', { schema: { deprecated: true } }, async () => ({ data: rows }));
// used to return a bare array
\`\`\`

**Good** — HTTP deprecation headers, same behavior until sunset:
\`\`\`ts
app.get('/v1/reviews', { schema: { deprecated: true } }, async (req, reply) => {
  reply.header('Deprecation', 'true');
  reply.header('Sunset', 'Mon, 01 Mar 2027 00:00:00 GMT');
  reply.header('Link', '</v2/reviews>; rel="successor-version"');
  return rows; // unchanged shape
});
\`\`\`
`,
  },
];
