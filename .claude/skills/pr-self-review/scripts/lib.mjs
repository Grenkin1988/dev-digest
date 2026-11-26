// Shared helpers for the pr-self-review scripts. No dependencies: node:* only.
//
// Everything that touches git lives here so that collect / route / finalize / gate
// compute the same base and the same fingerprint.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"];
export const STATUS_CONTEXT = "pr-self-review";
export const REPORT_DIR_REL = ".devdigest/self-review";

/** Run git in `cwd` and return trimmed stdout (throws on non-zero exit). */
export function git(args, { cwd = process.cwd(), trim = true } = {}) {
  const out = execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return trim ? out.trim() : out;
}

function tryGit(args, opts) {
  try {
    return git(args, opts);
  } catch {
    return null;
  }
}

export function repoRoot(cwd = process.cwd()) {
  return git(["rev-parse", "--show-toplevel"], { cwd });
}

export function reportDir(root) {
  const dir = join(root, REPORT_DIR_REL);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/**
 * The commit the branch forked from: merge-base with origin/main, falling back
 * to local main. Override with PR_SELF_REVIEW_BASE (any rev git understands).
 */
export function resolveBase(root) {
  const candidates = [process.env.PR_SELF_REVIEW_BASE, "origin/main", "main"].filter(Boolean);
  for (const ref of candidates) {
    const sha = tryGit(["merge-base", "HEAD", ref], { cwd: root });
    if (sha) return { ref, sha };
  }
  throw new Error("pr-self-review: cannot find a merge-base with origin/main or main");
}

/**
 * Every open change relative to `baseSha`: branch commits + staged + unstaged
 * (one `git diff <base>` covers all three, since it compares base to the
 * working tree) plus untracked, non-ignored files.
 */
export function listChanges(root, baseSha) {
  const files = new Map();
  const raw = git(["diff", "--name-status", "-M", "-z", baseSha], { cwd: root, trim: false });
  const parts = raw.split("\0").filter((p) => p !== "");
  for (let i = 0; i < parts.length; ) {
    const status = parts[i++];
    const code = status[0];
    if (code === "R" || code === "C") {
      const from = parts[i++];
      const to = parts[i++];
      files.set(to, { path: to, status: code, from });
    } else {
      const path = parts[i++];
      files.set(path, { path, status: code });
    }
  }
  for (const path of untracked(root)) files.set(path, { path, status: "A", untracked: true });
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function untracked(root) {
  const raw = git(["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, trim: false });
  return raw.split("\0").filter(Boolean).sort();
}

/**
 * Content fingerprint of the open changes: sha256 over `git diff <base>` and the
 * bytes of every untracked file. Committing does not change it (the diff
 * against base is the same), editing anything does — so a report stays valid
 * across `git commit` but goes stale on any code change.
 */
export function fingerprint(root, baseSha) {
  const h = createHash("sha256");
  h.update(baseSha + "\n");
  h.update(git(["diff", "--binary", "--no-color", "--no-ext-diff", baseSha], { cwd: root, trim: false }));
  for (const path of untracked(root)) {
    h.update("\0untracked:" + path + "\0");
    try {
      h.update(readFileSync(join(root, path)));
    } catch {
      h.update("<unreadable>");
    }
  }
  return h.digest("hex");
}

/** Unified diff of the given paths against base, including untracked files. */
export function diffFor(root, baseSha, paths) {
  const tracked = [];
  const out = [];
  const untrackedSet = new Set(untracked(root));
  for (const p of paths) {
    if (untrackedSet.has(p)) {
      let body = "";
      try {
        body = readFileSync(join(root, p), "utf8");
      } catch {
        body = "<unreadable>";
      }
      out.push(`--- /dev/null\n+++ b/${p}\n` + body.split("\n").map((l) => "+" + l).join("\n"));
    } else tracked.push(p);
  }
  if (tracked.length) {
    out.unshift(git(["diff", "--no-color", "--no-ext-diff", baseSha, "--", ...tracked], { cwd: root, trim: false }));
  }
  return out.join("\n");
}

export function headSha(root) {
  return git(["rev-parse", "HEAD"], { cwd: root });
}

/** True when there is nothing uncommitted (tracked or untracked, ignored files aside). */
export function isTreeClean(root) {
  return git(["status", "--porcelain"], { cwd: root }) === "";
}

/** owner/repo from the origin remote (https or ssh GitHub URL). */
export function githubRepo(root) {
  const url = tryGit(["remote", "get-url", "origin"], { cwd: root });
  const m = url && url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** Converts a glob (`**`, `*`, `?`, `{a,b}`) to an anchored RegExp over `/` paths. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      re += "(?:" + glob.slice(i + 1, end).split(",").map(escapeRe).join("|") + ")";
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp("^" + re + "$");
}

function escapeRe(s) {
  return s.replace(/[.+^$()|[\]\\]/g, "\\$&");
}

const globCache = new Map();
export function matchesAny(path, globs) {
  return globs.some((g) => {
    if (!globCache.has(g)) globCache.set(g, globToRegExp(g));
    return globCache.get(g).test(path);
  });
}
