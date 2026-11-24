#!/usr/bin/env node
// Step 5: merge rule + check + skill findings, derive the verdict, write
// report.json / report.md. Refuses to produce a report if the code changed
// since plan.json was made (the review would describe other code).
//
// Usage: node .claude/skills/pr-self-review/scripts/finalize.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fingerprint, readJson, reportDir, repoRoot, writeJson } from "./lib.mjs";
import { computeVerdict, counts, dedupe, normalizeReviews, renderMarkdown } from "./verdict.mjs";

const root = repoRoot();
const dir = reportDir(root);
const plan = readJson(join(dir, "plan.json"));
const checks = readJson(join(dir, "checks.json"));
const llm = readJson(join(dir, "llm-findings.json"));

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
if (!plan) fail("No plan.json — run scripts/route.mjs first.");
if (!checks) fail("No checks.json — run scripts/run-checks.mjs first.");
if (checks.fingerprint !== plan.fingerprint) fail("checks.json is for a different state of the code. Re-run run-checks.mjs.");
if (Object.keys(plan.skills).length && !llm) fail("No llm-findings.json — the skill reviews have not been recorded.");
if (llm && llm.fingerprint !== plan.fingerprint) fail("llm-findings.json is for a different state of the code. Re-run the reviews.");

const now = fingerprint(root, plan.base.sha);
if (now !== plan.fingerprint) {
  fail("The code changed while the review was running. Start over with route.mjs.");
}

const { findings: skillFindings, dropped } = normalizeReviews(llm, plan);
const findings = dedupe([...plan.findings, ...checks.findings, ...skillFindings]);
const verdict = computeVerdict(findings);

const report = {
  createdAt: new Date().toISOString(),
  base: plan.base,
  headSha: plan.headSha,
  fingerprint: plan.fingerprint,
  verdict,
  counts: counts(findings),
  filesReviewed: plan.files.length,
  skillsRun: Object.keys(plan.skills),
  checks: checks.results,
  unreviewed: plan.unreviewed,
  dropped,
  findings,
};
writeJson(join(dir, "report.json"), report);
const md = renderMarkdown(report);
writeFileSync(join(dir, "report.md"), md, "utf8");
console.log(md);
console.log(`report: ${join(dir, "report.md")}`);
