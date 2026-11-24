#!/usr/bin/env node
// Publishes the report's verdict as the GitHub commit status `pr-self-review`
// on HEAD. With branch protection requiring that check, GitHub refuses to merge
// a PR whose HEAD has no success status.
//
// Only posts when the report describes exactly HEAD: fresh fingerprint and a
// clean working tree (otherwise the status would vouch for code that isn't
// in the commit). The status is self-reported from this machine — a guard
// against accidents, not against someone determined to bypass it.
//
// Usage: node post-status.mjs [--dry-run]
// Auth (first found): GH_TOKEN / GITHUB_TOKEN env → `gh auth token` → git credential helper for github.com.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { STATUS_CONTEXT, fingerprint, git, githubRepo, headSha, isTreeClean, readJson, reportDir, repoRoot, writeJson } from "./lib.mjs";

function token() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const gh = spawnSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 10_000, shell: process.platform === "win32" });
  if (gh.status === 0 && gh.stdout.trim()) return gh.stdout.trim();
  const cred = spawnSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
  });
  const m = cred.status === 0 && cred.stdout.match(/^password=(.+)$/m);
  return m ? m[1].trim() : null;
}

/** @returns {{ok:boolean, posted?:boolean, state?:string, sha?:string, reason?:string}} */
export async function postStatus({ root = repoRoot(), dryRun = false } = {}) {
  const dir = reportDir(root);
  const report = readJson(join(dir, "report.json"));
  if (!report) return { ok: false, reason: "no report.json — run /pr-self-review first" };
  if (fingerprint(root, report.base.sha) !== report.fingerprint) {
    return { ok: false, reason: "report is stale — the code changed after the review" };
  }
  if (!isTreeClean(root)) {
    return { ok: false, reason: "working tree has uncommitted changes — commit them so the status describes HEAD" };
  }
  const sha = headSha(root);
  const onRemote = git(["branch", "-r", "--contains", sha], { cwd: root }) !== "";
  if (!onRemote) return { ok: false, sha, reason: "HEAD is not pushed yet — push, then run post-status.mjs" };

  const repo = githubRepo(root);
  if (!repo) return { ok: false, reason: "origin is not a GitHub remote" };

  const state = report.verdict === "request_changes" ? "failure" : "success";
  const c = report.counts;
  const description = `${c.CRITICAL} critical, ${c.WARNING} warning, ${c.SUGGESTION} suggestion (fp ${report.fingerprint.slice(0, 8)})`.slice(0, 140);
  const body = { state, context: STATUS_CONTEXT, description };

  const last = readJson(join(dir, "status.json"));
  if (last && last.sha === sha && last.state === state && last.fingerprint === report.fingerprint) {
    return { ok: true, posted: false, state, sha, reason: "already posted" };
  }
  if (dryRun) return { ok: true, posted: false, state, sha, reason: `dry run: would POST ${JSON.stringify(body)}` };

  const tok = token();
  if (!tok) return { ok: false, sha, reason: "no GitHub token (set GH_TOKEN, install gh, or sign in via git credentials)" };

  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/statuses/${sha}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pr-self-review",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, sha, reason: `GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}` };
  writeJson(join(dir, "status.json"), { sha, state, fingerprint: report.fingerprint, postedAt: new Date().toISOString() });
  return { ok: true, posted: true, state, sha };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await postStatus({ dryRun: process.argv.includes("--dry-run") });
  if (r.ok) console.log(`${STATUS_CONTEXT}: ${r.state} on ${r.sha?.slice(0, 10)}${r.posted ? " (posted)" : ` — ${r.reason}`}`);
  else console.error(`${STATUS_CONTEXT}: not posted — ${r.reason}`);
  process.exit(r.ok ? 0 : 1);
}
