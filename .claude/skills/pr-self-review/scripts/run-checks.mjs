#!/usr/bin/env node
// Step 3: deterministic checks — lint (layer boundaries) and typecheck in every
// package the diff touches, all in parallel. Reads plan.json, writes checks.json.
//
// Severity:
//   - typecheck error anywhere in a touched package      → CRITICAL (a change can break other files)
//   - lint error in a changed file                       → CRITICAL
//   - lint error in an unchanged file                    → WARNING (pre-existing, not this diff)
//   - lint warning in a changed file                     → WARNING
//   - a check that could not run (no node_modules, crash) → CRITICAL (an unverified gate is not a pass)
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { readJson, reportDir, repoRoot, writeJson } from "./lib.mjs";

const CHECKS = {
  server: [
    { kind: "lint", cmd: "pnpm exec eslint src --format json" },
    { kind: "typecheck", cmd: "pnpm typecheck" },
  ],
  client: [
    { kind: "lint", cmd: "pnpm exec eslint . --format json" },
    { kind: "typecheck", cmd: "pnpm typecheck" },
  ],
  "reviewer-core": [{ kind: "typecheck", cmd: "pnpm typecheck" }],
  e2e: [{ kind: "typecheck", cmd: "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json" }],
};

const root = repoRoot();
const dir = reportDir(root);
const plan = readJson(join(dir, "plan.json"));
if (!plan) {
  console.error("No plan.json — run scripts/route.mjs first.");
  process.exit(1);
}
const changed = new Set(plan.files.filter((f) => f.status !== "D").map((f) => f.path));
const toRepoPath = (abs) => relative(root, abs).split("\\").join("/");

function run(cmd, cwd) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, { cwd, shell: true, env: { ...process.env, FORCE_COLOR: "0", CI: "1" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }));
    child.on("error", (e) => resolve({ code: -1, stdout, stderr: String(e), ms: Date.now() - started }));
  });
}

function f(severity, file, line, rule, summary, source) {
  return { severity, file, line, rule, summary, fix: "", source, skill: source, verification: "CONFIRMED" };
}

function parseLint(pkg, res) {
  const out = [];
  let report;
  try {
    report = JSON.parse(res.stdout.slice(res.stdout.indexOf("[")));
  } catch {
    return null;
  }
  for (const file of report) {
    const path = toRepoPath(file.filePath);
    const inDiff = changed.has(path);
    for (const m of file.messages) {
      const isError = m.severity === 2;
      if (!isError && !inDiff) continue;
      const severity = isError && inDiff ? "CRITICAL" : "WARNING";
      const note = isError && !inDiff ? " (pre-existing: file is not in this diff)" : "";
      out.push(f(severity, path, m.line ?? 1, `eslint:${m.ruleId ?? "parse"}`, m.message + note, "lint"));
    }
  }
  return out;
}

function parseTsc(pkg, res) {
  const out = [];
  const text = res.stdout + "\n" + res.stderr;
  const re = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;
  for (const m of text.matchAll(re)) {
    const path = toRepoPath(join(root, pkg, m[1].trim()));
    out.push(f("CRITICAL", path, Number(m[2]), `tsc:${m[4]}`, m[5], "typecheck"));
  }
  return out;
}

const jobs = [];
for (const pkg of plan.packages) {
  for (const check of CHECKS[pkg] ?? []) {
    const cwd = join(root, pkg);
    if (!existsSync(join(cwd, "node_modules"))) {
      jobs.push(Promise.resolve({ pkg, ...check, status: "not-run", ms: 0,
        findings: [f("CRITICAL", `${pkg}/package.json`, 1, `${check.kind}:not-run`,
          `${check.kind} could not run in ${pkg}: node_modules is missing (run \`pnpm install\` in ${pkg}).`, check.kind)] }));
      continue;
    }
    jobs.push(run(check.cmd, cwd).then((res) => {
      const parsed = check.kind === "lint" ? parseLint(pkg, res) : parseTsc(pkg, res);
      let findings = parsed ?? [];
      let status = res.code === 0 ? "pass" : "fail";
      // Non-zero exit with nothing parsed = the tool itself failed; don't let that pass silently.
      if (parsed === null || (res.code !== 0 && findings.length === 0)) {
        status = "error";
        const tail = (res.stderr || res.stdout).trim().split("\n").slice(-5).join(" | ").slice(0, 400);
        findings = [f("CRITICAL", `${pkg}/package.json`, 1, `${check.kind}:error`,
          `${check.kind} failed to run in ${pkg} (exit ${res.code}): ${tail}`, check.kind)];
      }
      return { pkg, kind: check.kind, cmd: check.cmd, status, ms: res.ms, findings };
    }));
  }
}

const results = await Promise.all(jobs);
const checks = {
  fingerprint: plan.fingerprint,
  ranAt: new Date().toISOString(),
  results: results.map(({ findings, ...r }) => ({ ...r, findings: findings.length })),
  findings: results.flatMap((r) => r.findings),
};
writeJson(join(dir, "checks.json"), checks);

for (const r of checks.results) {
  console.log(`${r.status.padEnd(8)} ${r.pkg.padEnd(14)} ${r.kind.padEnd(10)} ${r.findings} finding(s)  ${(r.ms / 1000).toFixed(1)}s`);
}
if (!checks.results.length) console.log("no package code changed — nothing to lint/typecheck");
const crit = checks.findings.filter((x) => x.severity === "CRITICAL").length;
console.log(`checks: ${crit} CRITICAL, ${checks.findings.length - crit} other → ${join(dir, "checks.json")}`);
