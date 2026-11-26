// ESLint (flat config) for the API.
//
// typescript-eslint's recommended rules plus the onion-architecture dependency
// rule (.claude/skills/onion-architecture/SKILL.md §1 and §5): source
// dependencies point inward only. Enforced per ring by file role:
//   - routes (presentation)       → no Drizzle / db schema / repositories;
//   - services (application)      → no Fastify / Drizzle / db schema / Container;
//   - helpers + constants (domain)→ no Fastify / Drizzle / db / adapters / env;
//   - SDKs live in src/adapters only.
// Routes and services were cleaned up in the same change, so their rules are
// errors; the rest starts as warnings to be paid down.
import tseslint from "typescript-eslint";

const SDKS = ["@octokit/*", "simple-git", "openai", "@anthropic-ai/sdk"];
const DRIZZLE = ["drizzle-orm", "drizzle-orm/*"];
const DB = ["**/db/schema.js", "**/db/schema/*", "**/db/client.js"];

/** no-restricted-imports with the given forbidden groups. */
const forbid = (severity, groups) => [
  severity,
  { patterns: groups.map(([group, message]) => ({ group, message })) },
];

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "clones/**", "src/vendor/**", "src/db/migrations/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/adapters/**", "src/platform/container.ts"],
    rules: {
      "no-restricted-imports": forbid("error", [
        [SDKS, "SDKs belong in src/adapters behind a port (onion §2.3)."],
      ]),
    },
  },
  {
    files: ["src/modules/*/routes.ts"],
    rules: {
      "no-restricted-imports": forbid("error", [
        [DRIZZLE, "Routes are driving adapters: no SQL. Call a service (onion §5)."],
        [DB, "Routes must not touch the db schema or client. Call a service (onion §5)."],
        [["**/repository.js", "**/repository/*"], "Routes call services, never repositories (onion §5)."],
        [SDKS, "SDKs belong in src/adapters behind a port."],
      ]),
    },
  },
  {
    files: ["src/modules/**/service.ts", "src/modules/**/run-executor.ts", "src/modules/repo-intel/{indexer,blast,queries,repo-map-reader,disabled}.ts"],
    rules: {
      "no-restricted-imports": forbid("error", [
        [["fastify", "fastify/*"], "Services take plain values; keep req/reply in the route (onion §5)."],
        [DRIZZLE, "Only repositories import drizzle-orm (onion §3)."],
        [DB, "Only repositories import db/schema; type rows via db/rows.ts (onion §3)."],
        [["**/platform/container.js"], "Services get narrow constructor deps, not the Container (onion §3 DI)."],
        [SDKS, "SDKs belong in src/adapters behind a port."],
      ]),
    },
  },
  {
    files: ["src/modules/**/helpers.ts", "src/modules/**/constants.ts", "src/modules/reviews/cost.ts"],
    rules: {
      "no-restricted-imports": forbid("warn", [
        [["fastify", "fastify/*"], "Domain code is framework-free (onion §1)."],
        [DRIZZLE, "Domain code does no I/O (onion §1)."],
        [DB, "Domain mappers take structural types, not table types (onion §6)."],
        [["**/adapters/*"], "Domain code must not depend on adapters (onion §1)."],
      ]),
    },
  },
  {
    files: ["src/modules/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "warn",
        { object: "process", property: "env", message: "Read configuration through AppConfig (platform/config.ts)." },
      ],
    },
  },
);
