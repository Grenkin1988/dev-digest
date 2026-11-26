# Testing per ring

The architecture pays off in tests: the further in the code is, the cheaper its test. See the
repo `TESTING.md` for tooling and conventions.

| Ring | Test type | Doubles | Example |
|---|---|---|---|
| Domain | plain Vitest unit test | none (inject functions such as `CostEstimator`) | `server/test/run-cost.test.ts`, `server/test/repos-url.test.ts` |
| Application | unit test of the service | fake repositories/ports, or `ContainerOverrides` + `adapters/mocks.ts` | `server/test/repo-intel-facade-degraded.test.ts` |
| Infrastructure (repository) | `*.it.test.ts` on Testcontainers Postgres (needs Docker) | none: real DB | `server/test/agents-versions.it.test.ts` |
| Infrastructure (adapter) | unit test against a fake transport or temp dir | as needed | `server/test/adapters.test.ts` |
| Presentation | `app.inject` smoke test through `buildApp` with overrides | mocks for every adapter | `server/test/routes-smoke.test.ts` |

## Rules
1. If a service test needs Postgres, the service is missing a port, or it's doing a
   repository's job.
2. If a domain test needs a mock, the function isn't pure. Pull the impure part out as an
   argument.
3. Don't mock Drizzle. Repositories are tested against a real database (integration), and
   everything above them gets a fake repository.
4. Windows note: 8 tests in `git-adapter-safety` / `indexer-pipeline` fail on a clean tree
   (`server/INSIGHTS.md`). They aren't regressions.
