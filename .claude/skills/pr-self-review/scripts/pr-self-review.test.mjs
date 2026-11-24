// Unit tests for the pure parts of pr-self-review. Zero deps: node's built-in runner.
//   node --test .claude/skills/pr-self-review/scripts/
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyCommand, decide, skipReason } from "./gate.mjs";
import { globToRegExp } from "./lib.mjs";
import { classifyVendorDiff, driftCheck, ruleChecks, skillsFor } from "./routing.mjs";
import { computeVerdict, dedupe, normalizeReviews } from "./verdict.mjs";

test("globToRegExp handles **, * and braces", () => {
  assert.ok(globToRegExp("client/src/**/*.{ts,tsx}").test("client/src/app/x/page.tsx"));
  assert.ok(globToRegExp("client/src/**/*.{ts,tsx}").test("client/src/a.ts"));
  assert.ok(!globToRegExp("client/src/**/*.{ts,tsx}").test("client/src/a.css"));
  assert.ok(globToRegExp("**/node_modules/**").test("node_modules/x/index.js"));
  assert.ok(!globToRegExp("server/src/*.ts").test("server/src/a/b.ts"));
});

test("UI files get UI skills only", () => {
  const s = skillsFor("client/src/app/repos/[repoId]/page.tsx");
  assert.deepEqual(s, ["frontend-architecture", "next-best-practices", "react-best-practices", "typescript-expert"]);
  assert.ok(!s.includes("onion-architecture"));
  assert.deepEqual(skillsFor("client/src/components/x/X.test.tsx"), ["react-testing-library"]);
});

test("server files get backend architecture skills", () => {
  assert.deepEqual(skillsFor("server/src/modules/pulls/service.ts"), ["onion-architecture", "typescript-expert"]);
  const routes = skillsFor("server/src/modules/pulls/routes.ts");
  for (const s of ["onion-architecture", "fastify-best-practices", "zod", "security"]) assert.ok(routes.includes(s), s);
  assert.ok(skillsFor("server/src/modules/pulls/repository.ts").includes("drizzle-orm-patterns"));
  assert.ok(skillsFor("server/src/db/schema/reviews.ts").includes("postgresql-table-design"));
  assert.ok(!routes.includes("react-best-practices"));
});

test("security triggers on content, ignored paths get nothing", () => {
  assert.ok(!skillsFor("server/src/modules/pulls/helpers.ts", "+const x = 1").includes("security"));
  assert.ok(skillsFor("server/src/modules/pulls/helpers.ts", "+const t = process.env.GITHUB_TOKEN").includes("security"));
  assert.deepEqual(skillsFor("client/pnpm-lock.yaml"), []);
  assert.deepEqual(skillsFor("server/src/db/migrations/meta/_journal.json"), []);
});

test("ruleChecks: migrations, vendor, CLAUDE.md stubs, docs README, lockfiles", () => {
  const files = { "CLAUDE.md": "@AGENTS.md\n", "server/CLAUDE.md": "do stuff", "docs/README.md": "| a.md |" };
  const read = (p) => files[p] ?? null;
  const out = ruleChecks(
    [
      { path: "server/src/db/migrations/0001_x.sql", status: "M" },
      { path: "server/src/db/migrations/0009_new.sql", status: "A" },
      { path: "server/src/vendor/shared/contracts/x.ts", status: "M" },
      { path: "CLAUDE.md", status: "M" },
      { path: "server/CLAUDE.md", status: "M" },
      { path: "docs/new.md", status: "A" },
      { path: "client/pnpm-lock.yaml", status: "M" },
    ],
    read,
    (p) => (p.includes("vendor/shared")
      ? ["@@ -1,3 +1,3 @@", " export const X = z.object({", "-  a: z.string(),", "+  a: z.number(),", " });"].join("\n")
      : ""),
  );
  const by = (file) => out.filter((f) => f.file === file).map((f) => f.severity);
  assert.deepEqual(by("server/src/db/migrations/0001_x.sql"), ["CRITICAL"]);
  assert.deepEqual(by("server/src/db/migrations/0009_new.sql"), ["WARNING"]);
  assert.deepEqual(by("server/src/vendor/shared/contracts/x.ts"), ["CRITICAL"]);
  assert.deepEqual(by("CLAUDE.md"), []);
  assert.deepEqual(by("server/CLAUDE.md"), ["CRITICAL"]);
  assert.deepEqual(by("docs/new.md"), ["WARNING"]);
  assert.deepEqual(by("client/pnpm-lock.yaml"), ["WARNING"]);
});

test("driftCheck flags installed-but-unrouted skills", () => {
  const { unknown } = driftCheck(["onion-architecture", "mermaid-diagram", "brand-new-skill"]);
  assert.deepEqual(unknown, ["brand-new-skill"]);
});

test("verdict is derived from findings", () => {
  assert.equal(computeVerdict([]), "approve");
  assert.equal(computeVerdict([{ severity: "SUGGESTION" }]), "comment");
  assert.equal(computeVerdict([{ severity: "WARNING" }]), "comment");
  assert.equal(computeVerdict([{ severity: "WARNING" }, { severity: "CRITICAL" }]), "request_changes");
});

test("normalizeReviews: unverified/out-of-diff CRITICALs downgrade, missing skill review blocks", () => {
  const plan = {
    files: [{ path: "a.ts" }],
    skills: { "onion-architecture": ["a.ts"], zod: ["a.ts"] },
  };
  const base = { file: "a.ts", line: 3, rule: "onion §1", summary: "x" };
  const llm = {
    reviews: [
      {
        skill: "onion-architecture",
        status: "done",
        findings: [
          { ...base, severity: "CRITICAL", verification: "CONFIRMED" },
          { ...base, line: 4, severity: "CRITICAL" },
          { ...base, line: 5, severity: "CRITICAL", verification: "REJECTED" },
          { ...base, file: "elsewhere.ts", severity: "CRITICAL", verification: "CONFIRMED" },
          { severity: "CRITICAL", file: "a.ts" }, // malformed
        ],
      },
    ],
  };
  const { findings, dropped } = normalizeReviews(llm, plan);
  assert.equal(dropped, 1);
  const sev = (file, line) => findings.find((f) => f.file === file && f.line === line)?.severity;
  assert.equal(sev("a.ts", 3), "CRITICAL");
  assert.equal(sev("a.ts", 4), "WARNING");
  assert.equal(sev("a.ts", 5), "WARNING");
  assert.equal(sev("elsewhere.ts", 3), "WARNING");
  const coverage = findings.find((f) => f.rule === "pr-self-review#coverage");
  assert.equal(coverage.skill, "zod");
  assert.equal(coverage.severity, "CRITICAL");
});

test("dedupe keeps highest severity and merges skills", () => {
  const out = dedupe([
    { file: "a.ts", line: 1, rule: "r", severity: "WARNING", skill: "x", summary: "s" },
    { file: "a.ts", line: 1, rule: "r", severity: "CRITICAL", skill: "y", summary: "s" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "CRITICAL");
  assert.deepEqual(out[0].skills.sort(), ["x", "y"]);
});

test("gate classifies commands", () => {
  assert.equal(classifyCommand("gh pr create --fill").action, "block");
  assert.equal(classifyCommand("cd x && gh pr merge 12 --squash").sub, "merge");
  assert.equal(classifyCommand("gh -R a/b pr ready 3").sub, "ready");
  assert.equal(classifyCommand("& gh.exe pr create").action, "block");
  assert.equal(classifyCommand("git push -u origin HEAD").action, "warn");
  assert.equal(classifyCommand("gh pr view 3"), null);
  assert.equal(classifyCommand("git status"), null);
  assert.equal(classifyCommand("pnpm test"), null);
  assert.equal(classifyCommand(undefined), null);
});

test("gate ignores commands that only mention gh pr create in text", () => {
  assert.equal(classifyCommand(`git commit -m "docs: run gh pr create after review"`), null);
  assert.equal(classifyCommand(`grep -rn 'gh pr merge' .`), null);
  assert.equal(classifyCommand("cat > x.md <<'EOF'\nthen gh pr create\nEOF\n"), null);
  assert.equal(classifyCommand("git commit -m @'\ngh pr create\n'@"), null);
  assert.equal(classifyCommand(`git commit -m "x" && gh pr create --title "t"`).action, "block");
});

test("gate decision", () => {
  assert.equal(decide(null, "fp").ok, false);
  const report = { fingerprint: "fp", createdAt: "t", verdict: "comment", counts: { CRITICAL: 0, WARNING: 1, SUGGESTION: 0 }, findings: [] };
  assert.equal(decide(report, "other").ok, false);
  assert.equal(decide(report, "fp").ok, true);
  const blocked = { ...report, verdict: "request_changes", findings: [{ severity: "CRITICAL", file: "a.ts", line: 1, rule: "r", summary: "bad" }] };
  const d = decide(blocked, "fp");
  assert.equal(d.ok, false);
  assert.match(d.message, /a\.ts:1/);
});

test("skip needs a real reason", () => {
  assert.equal(skipReason("PR_SELF_REVIEW_SKIP=1 gh pr create", {}), null);
  assert.equal(skipReason('PR_SELF_REVIEW_SKIP="hotfix approved by lead" gh pr create', {}), "hotfix approved by lead");
  assert.equal(skipReason("gh pr create", { PR_SELF_REVIEW_SKIP: "release blocker, reviewed manually" }), "release blocker, reviewed manually");
});

// Real diff of server/src/vendor/shared/contracts/platform.ts from commit 25d19b5.
const ADDITIVE = [
  "diff --git a/server/src/vendor/shared/contracts/platform.ts b/server/src/vendor/shared/contracts/platform.ts",
  "--- a/server/src/vendor/shared/contracts/platform.ts",
  "+++ b/server/src/vendor/shared/contracts/platform.ts",
  "@@ -156,6 +156,13 @@ export type Repo = z.infer<typeof Repo>;",
  " export const PrStatus = z.enum(['needs_review', 'reviewed', 'stale', 'open', 'closed', 'merged']);",
  " export type PrStatus = z.infer<typeof PrStatus>;",
  " ",
  "+export const PrSeverityCounts = z.object({",
  "+  CRITICAL: z.number().int(),",
  "+  WARNING: z.number().int(),",
  "+  SUGGESTION: z.number().int(),",
  "+});",
  "+export type PrSeverityCounts = z.infer<typeof PrSeverityCounts>;",
  "+",
  " export const PrMeta = z.object({",
  "   id: z.string().nullish(),",
  "   number: z.number().int(),",
  "@@ -177,6 +184,10 @@ export const PrMeta = z.object({",
  "   cost_usd: z.number().nullish(),",
  "   tokens_in: z.number().int().nullish(),",
  "   tokens_out: z.number().int().nullish(),",
  "+  // Non-dismissed findings per severity across each agent's latest review",
  "+  // (list endpoint only). Lets the PR list render counters without fetching",
  "+  // every PR's reviews. Absent until the PR has been reviewed.",
  "+  severity_counts: PrSeverityCounts.nullish(),",
  " });",
  " export type PrMeta = z.infer<typeof PrMeta>;",
].join("\n");

/** A hunk inside an existing `PrMeta` object; `body` lines are already +/- prefixed. */
const hunk = (...body) =>
  ["@@ -10,3 +10,5 @@", " export const PrMeta = z.object({", ...body, " });"].join("\n");

test("vendor diff: new declarations + nullish field are additive (commit 25d19b5)", () => {
  const r = classifyVendorDiff(ADDITIVE);
  assert.deepEqual(r.breaking, []);
  assert.ok(r.additive >= 3);
});

test("vendor diff: removed/changed lines and required members are breaking", () => {
  assert.equal(classifyVendorDiff(hunk("-  id: z.string().nullish(),")).breaking[0].why, "existing line removed or changed");
  assert.ok(classifyVendorDiff(hunk("-  id: z.string().nullish(),", "+  id: z.string(),")).breaking.length >= 1); // nullish → required
  const req = classifyVendorDiff(hunk("+  repo_url: z.string(),"));
  assert.equal(req.breaking[0].why, "new required member in an existing schema/interface");
  assert.equal(req.breaking[0].line, 11);
  assert.equal(classifyVendorDiff(hunk("+  getFoo(): Promise<void>;")).breaking.length, 1); // new required port method
  assert.equal(classifyVendorDiff(hunk("+}).strict();")).breaking.length, 1);
  assert.equal(classifyVendorDiff(hunk("+  c: z", "+    .string()", "+    .min(1),")).breaking.length, 1);
});

test("vendor diff: optional forms, multi-line members and an added trailing comma are additive", () => {
  const cases = [
    ["+  a: z.string().optional(),"],
    ["+  b: z.number().default(0),"],
    ["+  getFoo?(): Promise<void>;"],
    ["+  c: z", "+    .string()", "+    .nullish(),"],
    ["+  d: z.object({", "+    x: z.string(),", "+  }).optional(),"],
    ["-  last: z.string()", "+  last: z.string(),", "+  next: z.string().nullish()"],
  ];
  for (const body of cases) assert.deepEqual(classifyVendorDiff(hunk(...body)).breaking, [], body.join(" | "));
});

test("ruleChecks: vendor severity by diff kind, client copy and counterpart drift", () => {
  const files = {
    "server/src/vendor/shared/contracts/platform.ts": "x",
    "client/src/vendor/shared/contracts/platform.ts": "x",
    "client/src/vendor/shared/contracts/agents.ts": "x",
    "server/src/vendor/shared/contracts/agents.ts": "x",
  };
  const diffs = {
    "server/src/vendor/shared/contracts/platform.ts": ADDITIVE,
    "client/src/vendor/shared/contracts/platform.ts": ADDITIVE,
    "client/src/vendor/shared/contracts/agents.ts": hunk("-  id: z.string().nullish(),"),
    "client/src/vendor/ui/button.tsx": ["@@ -1,2 +1,2 @@", "-old", "+new"].join("\n"),
  };
  const out = ruleChecks(
    [
      { path: "server/src/vendor/shared/contracts/platform.ts", status: "M" },
      { path: "client/src/vendor/shared/contracts/platform.ts", status: "M" },
      { path: "client/src/vendor/shared/contracts/agents.ts", status: "M" },
      { path: "client/src/vendor/ui/button.tsx", status: "M" },
      { path: "server/src/vendor/shared/contracts/old.ts", status: "D" },
    ],
    (p) => files[p] ?? null,
    (p) => diffs[p] ?? "",
  );
  const sev = (file, rule = "AGENTS.md#do-not-touch") =>
    out.filter((f) => f.file === file && f.rule === rule).map((f) => f.severity);
  assert.deepEqual(sev("server/src/vendor/shared/contracts/platform.ts"), ["WARNING"]);
  assert.deepEqual(sev("client/src/vendor/shared/contracts/platform.ts"), ["WARNING"]);
  assert.deepEqual(sev("client/src/vendor/shared/contracts/agents.ts"), ["CRITICAL"]);
  assert.deepEqual(sev("client/src/vendor/ui/button.tsx"), ["CRITICAL"]);
  assert.deepEqual(sev("server/src/vendor/shared/contracts/old.ts"), ["CRITICAL"]);
  const drift = "client/docs/architecture.md#vendor-shared";
  assert.deepEqual(sev("server/src/vendor/shared/contracts/platform.ts", drift), []); // both copies changed
  assert.deepEqual(sev("client/src/vendor/shared/contracts/agents.ts", drift), ["WARNING"]); // only one copy
});
