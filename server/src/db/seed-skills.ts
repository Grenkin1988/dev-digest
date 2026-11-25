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
    name: 'api-breaking-change-gate',
    description:
      'Flag route or contract changes that break existing clients: removed or renamed fields and routes, narrowed types, new required inputs, changed status codes.',
    type: 'rubric',
    agent: 'General Reviewer',
    body: `# API breaking-change gate

Compare the before and after of every HTTP route and shared contract in the diff
(Zod schemas in vendor/shared, route paths, methods, params, bodies, responses).

A change is BREAKING when an existing client that worked before would now fail:

- a route, method or path is removed or renamed
- a response field is removed, renamed, or its type narrowed or changed
- a request field becomes required, or its accepted values shrink
- a status code or error shape that clients branch on changes
- the meaning of an existing field changes without a new name

For each breaking change report CRITICAL with: the old signature, the new one, and
who is affected. Additive, optional changes are not breaking. If the diff updates
every in-repo caller but the API is also consumed externally (CI runner, plugins),
still flag it as WARNING and ask for a versioning or deprecation path.
`,
  },
];
