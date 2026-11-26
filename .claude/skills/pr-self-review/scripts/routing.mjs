// Routing table: which skill reviews which changed file. Source of truth for
// references/skill-routing.md — edit both together.
//
// Pure functions only (no git, no fs) so they are unit-testable; the caller
// passes file contents / diffs in.
import { matchesAny } from "./lib.mjs";

/** Never reviewed: generated, vendored or lockfiles. */
export const IGNORED = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.next/**",
  "**/coverage/**",
  "**/*.tsbuildinfo",
  "**/pnpm-lock.yaml",
  "**/package-lock.json",
  "server/clones/**",
  "server/src/db/migrations/meta/**",
];

/** Skills that are not code reviewers, with the reason. */
export const EXCLUDED_SKILLS = {
  "mermaid-diagram": "authoring aid for diagrams, has no review rules",
  "engineering-insights": "session-notes workflow, not a review rubric",
  "pr-self-review": "this skill",
};

const TESTS = ["**/*.test.{ts,tsx,mts,mjs}", "**/*.it.test.ts", "**/test/**", "**/__tests__/**"];
const CLIENT_SRC = ["client/src/**/*.{ts,tsx}"];
const CLIENT_VENDOR = ["client/src/vendor/**"];
const SERVER_SRC = ["server/src/**/*.ts", "server/scripts/**/*.ts"];
const SERVER_VENDOR = ["server/src/vendor/**"];
const MIGRATIONS = ["server/src/db/migrations/**"];

/**
 * Each route: `globs` that select files, optional `not` globs that exclude, and
 * the `skills` to run on them. A file collects the union of all matching routes.
 */
export const ROUTES = [
  // ---------------- UI (client/) ----------------
  {
    id: "ui-structure",
    globs: CLIENT_SRC,
    not: [...TESTS, ...CLIENT_VENDOR],
    skills: ["frontend-architecture", "typescript-expert"],
  },
  {
    id: "ui-react",
    globs: ["client/src/**/*.tsx", "client/src/**/hooks/**/*.ts", "client/src/**/use*.ts"],
    not: [...TESTS, ...CLIENT_VENDOR],
    skills: ["react-best-practices"],
  },
  {
    id: "ui-next",
    globs: [
      "client/src/app/**",
      "client/next.config.*",
      "client/src/middleware.ts",
      "client/src/i18n/**",
    ],
    not: TESTS,
    skills: ["next-best-practices"],
  },
  {
    id: "ui-tests",
    globs: ["client/**/*.test.{ts,tsx}", "client/src/test/**"],
    skills: ["react-testing-library"],
  },
  {
    id: "ui-contracts",
    globs: ["client/src/**/*{schema,schemas,contract,contracts}*.ts", "client/src/lib/**/*.ts"],
    not: [...TESTS, ...CLIENT_VENDOR],
    skills: ["zod"],
  },

  // ---------------- Backend (server/) ----------------
  {
    id: "server-layers",
    globs: SERVER_SRC,
    not: [...TESTS, ...SERVER_VENDOR, ...MIGRATIONS],
    skills: ["onion-architecture", "typescript-expert"],
  },
  {
    id: "server-tests",
    globs: ["server/test/**", "server/**/*.test.ts"],
    skills: ["onion-architecture"],
  },
  {
    id: "server-http",
    globs: [
      "server/src/**/routes.ts",
      "server/src/**/routes/**",
      "server/src/app.ts",
      "server/src/server.ts",
      "server/src/index.ts",
      "server/src/platform/**",
      "server/src/**/plugins/**",
    ],
    not: TESTS,
    skills: ["fastify-best-practices"],
  },
  {
    id: "server-data",
    globs: [
      "server/src/**/repository.ts",
      "server/src/**/repository/**",
      "server/src/**/queries.ts",
      "server/src/db/**",
      "server/drizzle.config.*",
    ],
    not: [...TESTS, ...MIGRATIONS],
    skills: ["drizzle-orm-patterns"],
  },
  {
    id: "server-schema",
    globs: ["server/src/db/schema.ts", "server/src/db/schema/**", "server/src/db/migrations/*.sql"],
    skills: ["postgresql-table-design"],
  },
  {
    id: "server-validation",
    globs: [
      "server/src/**/routes.ts",
      "server/src/**/*{schema,schemas,contract,contracts}*.ts",
      "server/src/platform/config.ts",
      "server/src/platform/structured.ts",
    ],
    not: [...TESTS, ...SERVER_VENDOR, "server/src/db/**"],
    skills: ["zod"],
  },

  // ---------------- reviewer-core / e2e ----------------
  {
    id: "core",
    globs: ["reviewer-core/src/**/*.ts"],
    not: TESTS,
    skills: ["onion-architecture", "typescript-expert"],
  },
  {
    id: "core-schemas",
    globs: ["reviewer-core/src/**/*{schema,schemas,contract,contracts}*.ts", "reviewer-core/src/**/types.ts"],
    not: TESTS,
    skills: ["zod"],
  },
  {
    id: "e2e",
    globs: ["e2e/**/*.ts"],
    skills: ["typescript-expert"],
  },

  // ---------------- Security (by path) ----------------
  {
    id: "security-path",
    globs: [
      "server/src/**/routes.ts",
      "server/src/**/routes/**",
      "server/src/adapters/auth/**",
      "server/src/adapters/secrets/**",
      "server/src/adapters/github/**",
      "server/src/adapters/git/**",
      "server/src/platform/config.ts",
      "server/src/platform/contained-read.ts",
      "server/src/platform/local-only.ts",
      "client/src/app/api/**",
      "client/src/middleware.ts",
      "client/next.config.*",
      ".github/workflows/**",
      "**/docker-compose.yml",
      "**/.env*",
    ],
    not: TESTS,
    skills: ["security"],
  },
];

/** Added lines matching this pull a code file into the security review. */
export const SECURITY_CONTENT_RE =
  /\b(secret|token|password|passwd|api[_-]?key|private[_-]?key|authorization|bearer|cookie|session|jwt|crypto|dangerouslySetInnerHTML|innerHTML|eval\s*\(|new Function|child_process|exec(?:File|Sync)?\s*\(|spawn\s*\(|process\.env|cors|csrf|redirect|path\.join|readFile|writeFile|sql`|raw\s*\()/i;

const CODE_FILE = /\.(m?[jt]sx?|cjs)$/;

export function packageOf(path) {
  const top = path.split("/")[0];
  return ["client", "server", "reviewer-core", "e2e"].includes(top) ? top : "root";
}

/** Coarse role of the file, used for the report and for the reviewer prompt. */
export function bucketOf(path) {
  if (matchesAny(path, TESTS)) return "test";
  if (matchesAny(path, MIGRATIONS)) return "migration";
  if (/(^|\/)(docs|specs)\//.test(path) || /\.mdx?$/.test(path)) return "docs";
  if (path.startsWith("client/src/")) return "ui";
  if (path.startsWith("server/src/db/schema")) return "db-schema";
  if (/^server\/src\/.*\/(routes\.ts|routes\/)/.test(path)) return "server-route";
  if (/^server\/src\/.*\/(repository\.ts|repository\/|queries\.ts)/.test(path)) return "server-repo";
  if (/^server\/src\/.*\/service\.ts$/.test(path)) return "server-service";
  if (path.startsWith("server/src/adapters/")) return "server-adapter";
  if (path.includes("/vendor/shared/") || /contracts?/.test(path)) return "contract";
  if (path.startsWith("server/src/")) return "server-other";
  if (path.startsWith("reviewer-core/src/")) return "core";
  if (path.startsWith("e2e/")) return "e2e";
  return "config";
}

/**
 * Skills that should review `path`. `addedLines` (string, optional) is the "+"
 * side of the file's diff, used for the content-based security trigger.
 */
export function skillsFor(path, addedLines = "") {
  if (matchesAny(path, IGNORED)) return [];
  const skills = new Set();
  for (const r of ROUTES) {
    if (matchesAny(path, r.globs) && !(r.not && matchesAny(path, r.not))) {
      r.skills.forEach((s) => skills.add(s));
    }
  }
  if (!skills.has("security") && CODE_FILE.test(path) && !matchesAny(path, TESTS) && SECURITY_CONTENT_RE.test(addedLines)) {
    skills.add("security");
  }
  return [...skills].sort();
}

/** Every skill name the table can route to. */
export function routedSkills() {
  return new Set(ROUTES.flatMap((r) => r.skills));
}

/**
 * Skills present in .claude/skills that are neither routed nor excluded:
 * a new skill must be added to the table (or excluded) consciously.
 */
export function driftCheck(installedSkills) {
  const routed = routedSkills();
  const unknown = installedSkills.filter((s) => !routed.has(s) && !(s in EXCLUDED_SKILLS));
  const missing = [...routed].filter((s) => !installedSkills.includes(s));
  return { unknown, missing };
}

function finding(severity, file, rule, summary, fix, line = 1) {
  return { severity, file, line, rule, summary, fix, source: "rules", skill: "pr-self-review" };
}

/**
 * Do-not-touch vendored code (AGENTS.md:53, client/AGENTS.md:29, reviewer-core/AGENTS.md:27).
 * `shared` = Zod contracts + port interfaces; there is no upstream to re-vendor
 * from, so a contract change is made here, in both copies.
 */
export const VENDOR_SHARED = ["server/src/vendor/shared/**", "client/src/vendor/shared/**"];
export const VENDOR_UI = ["client/src/vendor/ui/**"];
const SHARED_COPIES = ["server/src/vendor/shared/", "client/src/vendor/shared/"];

// A member line: `name: …`, `'name': …`, `readonly name?: …`, `method(…): …`.
const MEMBER_RE = /^\s*(?:readonly\s+)?(['"]?)[\w$]+\1(\?)?\s*[:(]/;
const OPTIONAL_ZOD_RE = /\.(optional|nullish|default)\s*\(|\.catch\s*\(|z\.optional\s*\(/;
const DECL_START_RE = /^\s*(export\s+)?(declare\s+)?(const|let|type|interface|enum|function|class|abstract\s+class)\s/;
const NEUTRAL_RE = /^\s*(\/\/.*|\/\*.*|\*.*|\*\/\s*|import\s.*|export\s+(\*|\{[^}]*\})\s+from\s.*)?$/;

function braceDelta(s) {
  const code = s.replace(/\/\/.*$/, "").replace(/'[^']*'|"(?:\\.|[^"\\])*"|`[^`]*`/g, "");
  let d = 0;
  for (const ch of code) {
    if ("{([".includes(ch)) d++;
    else if ("})]".includes(ch)) d--;
  }
  return d;
}

/**
 * Classifies a unified diff of a vendored file.
 *  - any removed line (`-`)                                  → breaking (CRITICAL)
 *  - new top-level declarations (whole new const/type/…)     → additive
 *  - new members inside an EXISTING object/interface: additive only when optional
 *    (`.optional()`, `.nullish()`, `.default()`, or `name?:`), otherwise breaking
 *  - any other added code inside an existing declaration (`.refine`, `.strict()`…) → breaking
 * Comments, blank lines, imports and re-exports are neutral.
 *
 * @returns {{breaking: {line:number, text:string, why:string}[], additive: number}}
 */
export function classifyVendorDiff(diff) {
  const breaking = [];
  let additive = 0;
  let newLine = 0;
  let declDepth = null; // brace depth while inside a declaration added by this diff
  let pending = null; // multi-line member being accumulated
  let removed = []; // "-" lines of the current hunk, settled at hunk end

  // `foo: z.string()` → `foo: z.string(),` (comma added to make room for a new field) is not a change.
  const norm = (s) => s.trim().replace(/[,;]\s*$/, "");
  const ends = (s) => /[,;]\s*(\/\/.*)?$/.test(s);

  const flushPending = () => {
    if (!pending) return;
    if (pending.optional || OPTIONAL_ZOD_RE.test(pending.text)) additive++;
    else breaking.push({ line: pending.line, text: pending.first, why: "new required member in an existing schema/interface" });
    pending = null;
  };
  const endHunk = () => {
    flushPending();
    for (const r of removed) breaking.push({ ...r, why: "existing line removed or changed" });
    removed = [];
    declDepth = null;
  };

  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("diff ") || raw.startsWith("index ")) continue;
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      endHunk();
      newLine = Number(hunk[1]);
      continue;
    }
    const tag = raw[0];
    const text = raw.slice(1);

    if (tag === "-") {
      if (text.trim() !== "") removed.push({ line: Math.max(newLine, 1), text: text.trim() });
      continue;
    }
    if (tag !== "+") {
      // context line (or "\ No newline")
      flushPending();
      if (tag === " ") newLine++;
      declDepth = null;
      continue;
    }

    const line = newLine++;
    const same = removed.findIndex((r) => norm(r.text) === norm(text));
    if (same !== -1 && !pending && declDepth === null) {
      removed.splice(same, 1);
      continue;
    }
    if (declDepth !== null) {
      declDepth += braceDelta(text);
      if (declDepth <= 0) declDepth = null;
      continue;
    }
    if (DECL_START_RE.test(text)) {
      flushPending();
      additive++;
      const d = braceDelta(text);
      declDepth = d > 0 ? d : null;
      continue;
    }
    if (pending) {
      pending.text += " " + text.trim();
      if (ends(text) && braceDelta(pending.text) <= 0) flushPending();
      continue;
    }
    if (NEUTRAL_RE.test(text)) continue;
    const m = text.match(MEMBER_RE);
    if (m) {
      pending = { line, first: text.trim(), text: text.trim(), optional: Boolean(m[2]) };
      if (ends(text) && braceDelta(text) <= 0) flushPending();
      continue;
    }
    breaking.push({ line, text: text.trim(), why: "added code inside an existing declaration" });
  }
  endHunk();
  return { breaking, additive };
}

/**
 * Deterministic checks of the repo conventions in AGENTS.md.
 *
 * @param {{path:string,status:string,from?:string}[]} changes
 * @param {(path:string)=>string|null} readFile  current working-tree content, null if absent
 * @param {(path:string)=>string} [diffOf]  unified diff of the file against base
 */
export function ruleChecks(changes, readFile, diffOf = () => "") {
  const out = [];
  const paths = new Set(changes.map((c) => c.path));

  for (const c of changes) {
    const p = c.path;

    // Do-not-touch: vendored shared contracts / ports. Purely additive, optional
    // changes are a WARNING (still needs coordination); anything that can break
    // a consumer is CRITICAL.
    if (matchesAny(p, VENDOR_SHARED) || matchesAny(p, VENDOR_UI)) {
      const where = matchesAny(p, VENDOR_UI) ? "client/src/vendor/ui/" : p.slice(0, p.indexOf("/vendor/shared/") + "/vendor/shared/".length);
      const isShared = matchesAny(p, VENDOR_SHARED);
      if (c.status === "D" || c.status === "R") {
        out.push(finding("CRITICAL", p, "AGENTS.md#do-not-touch",
          `Vendored file ${c.status === "D" ? "deleted" : "renamed"} in ${where}: every importer of it breaks.`,
          "Restore it; deprecate instead of removing, and coordinate the removal separately."));
      } else if (c.status === "A") {
        out.push(finding("WARNING", p, "AGENTS.md#do-not-touch",
          `New file in do-not-touch ${where}: additive, but confirm the change was coordinated.`,
          isShared ? "Mention the contract change in the PR description; mirror it in the other vendor/shared copy if both sides use it." : "Mention it in the PR description."));
      } else {
        const { breaking, additive } = isShared
          ? classifyVendorDiff(diffOf(p))
          : { breaking: diffOf(p).split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---") && l.slice(1).trim())
              .map((l) => ({ line: 1, text: l.slice(1).trim(), why: "existing line removed or changed" })), additive: 1 };
        if (breaking.length) {
          const first = breaking[0];
          const more = breaking.length > 1 ? ` (+${breaking.length - 1} more)` : "";
          out.push(finding("CRITICAL", p, "AGENTS.md#do-not-touch",
            `Breaking edit to do-not-touch ${where}: ${first.why}: \`${first.text.slice(0, 80)}\`${more}.`,
            isShared
              ? "Keep contract changes additive: add new fields as `.optional()`/`.nullish()` (or `name?:` on interfaces) and leave existing ones as they are. A deliberate breaking change needs coordination and its own PR."
              : "Don't change vendored UI in place; wrap or extend it in client/src/components instead.",
            first.line));
        } else {
          out.push(finding("WARNING", p, "AGENTS.md#do-not-touch",
            additive
              ? `Additive change to do-not-touch ${where} (only new declarations / optional members): non-breaking, but confirm it was coordinated.`
              : `Non-code edit (comments/whitespace) to do-not-touch ${where}: confirm it was coordinated.`,
            isShared ? "Mention the contract change in the PR description." : "Mention it in the PR description."));
        }
      }
    }

    // The two vendor/shared copies: a change in one with the counterpart left untouched.
    const copy = SHARED_COPIES.find((pre) => p.startsWith(pre));
    if (copy && c.status !== "D") {
      const other = SHARED_COPIES.find((pre) => pre !== copy) + p.slice(copy.length);
      if (!paths.has(other) && readFile(other) !== null) {
        out.push(finding("WARNING", p, "client/docs/architecture.md#vendor-shared",
          `Contract changed in ${copy} but not in its counterpart ${other}.`,
          "If the other side uses this contract, apply the same change there (the copies are separate; see client/AGENTS.md)."));
      }
    }

    // Do-not-touch: migrations. Adding a generated one is fine-ish; editing an existing one is not.
    if (matchesAny(p, MIGRATIONS)) {
      if (c.status === "A") {
        out.push(finding("WARNING", p, "AGENTS.md#do-not-touch",
          "New migration file: confirm it was generated by drizzle-kit from a schema change and coordinated, not hand-written.",
          "Regenerate with `pnpm db:generate` from server/src/db/schema if it was hand-written."));
      } else {
        out.push(finding("CRITICAL", p, "AGENTS.md#do-not-touch",
          `Existing migration ${c.status === "D" ? "deleted" : "modified"}: applied migrations must never be hand-edited.`,
          "Revert it and add a new migration instead."));
      }
    }

    // CLAUDE.md files are one-line @AGENTS.md stubs.
    if (/(^|\/)CLAUDE\.md$/.test(p)) {
      const body = readFile(p);
      if (body === null) {
        out.push(finding("CRITICAL", p, "AGENTS.md#conventions",
          "CLAUDE.md stub deleted: Claude Code would stop loading AGENTS.md for this package.",
          "Restore the one-line `@AGENTS.md` stub."));
      } else if (body.trim() !== "@AGENTS.md") {
        out.push(finding("CRITICAL", p, "AGENTS.md#conventions",
          "CLAUDE.md must stay a one-line `@AGENTS.md` stub; instructions belong in AGENTS.md.",
          "Move the content to AGENTS.md and restore the stub."));
      }
    }

    // New doc/spec must be listed in its folder README.
    if (c.status === "A" && /(^|\/)(docs|specs)\/.+\.md$/.test(p) && !/README\.md$/.test(p)) {
      const dir = p.slice(0, p.lastIndexOf("/"));
      const readme = readFile(`${dir}/README.md`);
      const name = p.slice(p.lastIndexOf("/") + 1);
      if (readme !== null && !readme.includes(name)) {
        out.push(finding("WARNING", p, "AGENTS.md#session-protocol",
          `New doc ${name} has no row in ${dir}/README.md.`,
          `Add a row for ${name} to ${dir}/README.md in the same change.`));
      }
    }

    // Lockfile churn without a manifest change.
    const lock = p.match(/^(?:(.+)\/)?(pnpm-lock\.yaml|package-lock\.json)$/);
    if (lock) {
      const manifest = (lock[1] ? lock[1] + "/" : "") + "package.json";
      if (!paths.has(manifest)) {
        out.push(finding("WARNING", p, "dependencies",
          `Lockfile changed but ${manifest} did not.`,
          "Make sure this is intentional (e.g. a dependency refresh), otherwise revert the lockfile."));
      }
    }
  }
  return out;
}
