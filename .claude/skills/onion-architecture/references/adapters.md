# Ports and adapters for external systems

Primary (driving) adapters call into the app: Fastify routes, job handlers and tests.
Secondary (driven) adapters are called by the app through ports: Postgres, GitHub, git, LLMs,
the filesystem and secrets (Cockburn).

## Where things go

| Piece | Location |
|---|---|
| Port used by the server **and** reviewer-core, or by several modules | `src/vendor/shared/adapters.ts` (e.g. `LLMProvider` :82, `GitHubClient` :143, `GitClient` :205, `SecretsProvider` :281). Coordinate before editing. |
| Port used by one module only | `modules/<name>/ports.ts` |
| Facade over several libraries | an interface in the module (`repo-intel/types.ts:137` `RepoIntel`) and a service implementing it. Callers never import the libraries. |
| Implementation | `src/adapters/<system>/<impl>.ts` (e.g. `adapters/github/octokit.ts`, `adapters/git/simple-git.ts`) |
| Wiring | a `Container` getter (lazy) plus a `ContainerOverrides` field |
| Test double | `src/adapters/mocks.ts` (`MockGitHubClient` :130, `MockLLMProvider` :58, …) |

## Rules

1. **Ports speak the domain's language**: contract types and plain values, never SDK types
   (`Octokit` responses, `SimpleGit` results, OpenAI message objects).
2. **Adapters translate and parse**: map SDK responses to contract types, and parse untrusted
   external payloads with Zod before returning them.
3. **Secrets only through `SecretsProvider`** (`adapters/secrets/local.ts`). Adapters get a
   `getToken`-style callback (see `container.ts` `git` getter), and the token never goes into
   URLs or logs.
4. **Degrade, don't throw, when a capability is optional**: the `RepoIntel` "degraded contract"
   (header of `repo-intel/types.ts`) returns `[]`/`degraded: true` so callers fall back. Use
   this for enrichment features.
5. **Every new adapter ships with a mock** and is reachable through `ContainerOverrides`, so the
   app can run "without either a UI or a database" in tests.
6. **Keep one implementation per port in the Container**. Selection logic (which LLM provider)
   lives in the Container or a factory in `adapters/`, not in services.
