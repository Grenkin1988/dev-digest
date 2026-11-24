#!/usr/bin/env node
// Step 1+2: collect every open change, route each file to the skills that must
// review it, run the deterministic AGENTS.md rule checks and the skill drift
// check. Writes .devdigest/self-review/plan.json and prints a summary.
//
// Usage: node .claude/skills/pr-self-review/scripts/route.mjs [--json]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { diffFor, fingerprint, headSha, listChanges, readJson, reportDir, repoRoot, resolveBase, writeJson } from "./lib.mjs";
import { bucketOf, driftCheck, packageOf, ruleChecks, skillsFor } from "./routing.mjs";

const root = repoRoot();
const base = resolveBase(root);
const changes = listChanges(root, base.sha);

const readFile = (p) => {
  const abs = join(root, p);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
};
const addedLines = (p) =>
  diffFor(root, base.sha, [p])
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .join("\n");

const files = changes.map((c) => {
  const skills = c.status === "D" ? [] : skillsFor(c.path, addedLines(c.path));
  return { ...c, package: packageOf(c.path), bucket: bucketOf(c.path), skills };
});

const bySkill = {};
for (const f of files) for (const s of f.skills) (bySkill[s] ??= []).push(f.path);

const skillsDir = join(root, ".claude/skills");
const installed = readdirSync(skillsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(skillsDir, d.name, "SKILL.md")))
  .map((d) => d.name);
const drift = driftCheck(installed);

const findings = ruleChecks(changes, readFile, (p) => diffFor(root, base.sha, [p]));
for (const s of drift.unknown) {
  findings.push({
    severity: "WARNING",
    file: `.claude/skills/${s}/SKILL.md`,
    line: 1,
    rule: "pr-self-review#routing",
    summary: `Skill "${s}" is installed but not routed by pr-self-review, so it never reviews anything.`,
    fix: "Add it to ROUTES in scripts/routing.mjs (and references/skill-routing.md) or to EXCLUDED_SKILLS.",
    source: "rules",
    skill: "pr-self-review",
  });
}

// Packages whose lint/typecheck must run: any non-deleted, non-ignored file in them.
const packages = [...new Set(files.filter((f) => f.package !== "root" && f.status !== "D").map((f) => f.package))].sort();

const plan = {
  createdAt: new Date().toISOString(),
  base,
  headSha: headSha(root),
  fingerprint: fingerprint(root, base.sha),
  files,
  skills: Object.fromEntries(Object.entries(bySkill).sort(([a], [b]) => a.localeCompare(b))),
  unreviewed: files.filter((f) => f.skills.length === 0 && f.status !== "D").map((f) => f.path),
  packages,
  drift,
  findings,
};

const dir = reportDir(root);
writeJson(join(dir, "plan.json"), plan);

// A plan with a different fingerprint invalidates everything collected for the previous one.
const prev = readJson(join(dir, "report.json"));
if (prev && prev.fingerprint !== plan.fingerprint) {
  console.error("note: existing report.json is for a different state of the code (stale).");
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.log(`base:        ${base.ref} @ ${base.sha.slice(0, 10)}`);
  console.log(`fingerprint: ${plan.fingerprint.slice(0, 16)}`);
  console.log(`files:       ${files.length} changed (${plan.unreviewed.length} without a reviewing skill)`);
  console.log(`packages:    ${packages.join(", ") || "-"}`);
  console.log("skills:");
  for (const [s, ps] of Object.entries(plan.skills)) console.log(`  ${s.padEnd(24)} ${ps.length} file(s)`);
  if (!Object.keys(plan.skills).length) console.log("  (none)");
  console.log(`rule findings: ${findings.length}`);
  for (const f of findings) console.log(`  [${f.severity}] ${f.file}: ${f.summary}`);
  if (drift.missing.length) console.log(`routed but not installed: ${drift.missing.join(", ")}`);
  console.log(`plan: ${join(dir, "plan.json")}`);
}
