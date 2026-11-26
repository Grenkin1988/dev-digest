#!/usr/bin/env node
// Step 6: the gate. Two entry points:
//
//  1. Claude Code PreToolUse hook (.claude/settings.json, matcher Bash|PowerShell):
//     reads the hook JSON from stdin. For `gh pr create|merge|ready` it exits 2
//     (= block, stderr goes back to Claude) unless a fresh, non-blocking
//     report exists; on `gh pr create|ready` that passes, it also posts the
//     GitHub commit status. For `git push` it only warns. Anything else: exit 0.
//
//  2. git pre-push hook (.githooks/pre-push → `gate.mjs --mode=pre-push`):
//     warns on stderr, never blocks (WIP pushes must keep working; the GitHub
//     required status is what blocks the merge).
//
// Bypass (only when the user explicitly asks): PR_SELF_REVIEW_SKIP="<reason, ≥10 chars>"
// in the environment or inline in the command. Logged to skips.log. The GitHub
// status is not touched, so a required check still blocks the merge.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fingerprint, readJson, reportDir, repoRoot } from "./lib.mjs";

const SEP = String.raw`[^|;&\n]*?`;
const GH_PR = new RegExp(String.raw`(?:^|[\s;&|(\`'"])gh(?:\.exe)?\s${SEP}\bpr\s+(create|merge|ready)\b`);
const GIT_PUSH = new RegExp(String.raw`(?:^|[\s;&|(\`'"])git(?:\.exe)?\s${SEP}\bpush\b`);
const SKIP_INLINE = /PR_SELF_REVIEW_SKIP\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/;

/**
 * Drops heredoc bodies and quoted strings so text that merely mentions a
 * command (commit messages, grep patterns, echo) does not trip the gate.
 */
export function stripQuoted(cmd) {
  return cmd
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, " ")
    .replace(/@'[\s\S]*?'@|@"[\s\S]*?"@/g, " ")
    .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""');
}

/** "block" for PR-opening/merging commands, "warn" for pushes, null otherwise. */
export function classifyCommand(cmd) {
  if (typeof cmd !== "string") return null;
  const bare = stripQuoted(cmd);
  const pr = bare.match(GH_PR);
  if (pr) return { action: "block", sub: pr[1] };
  if (GIT_PUSH.test(bare)) return { action: "warn", sub: "push" };
  return null;
}

export function skipReason(cmd, env = process.env) {
  const m = typeof cmd === "string" ? cmd.match(SKIP_INLINE) : null;
  const reason = (m && (m[1] ?? m[2] ?? m[3])) || env.PR_SELF_REVIEW_SKIP || "";
  return reason.trim().length >= 10 ? reason.trim() : null;
}

/**
 * @param report  parsed report.json or null
 * @param currentFp  fingerprint of the working tree now
 * @returns {{ok:boolean, message:string}}
 */
export function decide(report, currentFp) {
  if (!report) {
    return { ok: false, message: "No PR self-review report. Run /pr-self-review before opening or merging a PR." };
  }
  if (report.fingerprint !== currentFp) {
    return { ok: false, message: `The PR self-review report is stale (code changed since ${report.createdAt}). Run /pr-self-review again.` };
  }
  if (report.verdict === "request_changes") {
    const crit = report.findings.filter((f) => f.severity === "CRITICAL");
    const list = crit.slice(0, 10).map((f) => `  - ${f.file}:${f.line} [${f.rule}] ${f.summary}`).join("\n");
    const more = crit.length > 10 ? `\n  …and ${crit.length - 10} more (see .devdigest/self-review/report.md)` : "";
    return { ok: false, message: `PR self-review found ${crit.length} CRITICAL finding(s). Fix them and re-run /pr-self-review:\n${list}${more}` };
  }
  const c = report.counts;
  return { ok: true, message: `PR self-review: ${report.verdict} (${c.CRITICAL} critical, ${c.WARNING} warning, ${c.SUGGESTION} suggestion).` };
}

let lastCmd = null;

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function evaluate(root) {
  const dir = reportDir(root);
  const report = readJson(join(dir, "report.json"));
  const fp = report ? fingerprint(root, report.base.sha) : null;
  return { dir, report, verdict: decide(report, fp) };
}

async function main() {
  const prePush = process.argv.includes("--mode=pre-push");

  if (prePush) {
    let root;
    try {
      root = repoRoot();
    } catch {
      return 0;
    }
    const { verdict } = evaluate(root);
    if (!verdict.ok) console.error(`[pr-self-review] warning: ${verdict.message}`);
    return 0;
  }

  let input = {};
  try {
    input = JSON.parse((await readStdin()) || "{}");
  } catch {
    return 0; // not our input — never break unrelated tool calls
  }
  const cmd = input?.tool_input?.command;
  lastCmd = cmd;
  const kind = classifyCommand(cmd);
  if (!kind) return 0;

  let root;
  try {
    root = repoRoot(input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  } catch {
    return 0;
  }
  const { dir, report, verdict } = evaluate(root);

  if (kind.action === "warn") {
    if (!verdict.ok) process.stdout.write(JSON.stringify({ systemMessage: `[pr-self-review] ${verdict.message}` }));
    return 0;
  }

  const skip = skipReason(cmd);
  if (!verdict.ok && skip) {
    appendFileSync(join(dir, "skips.log"), `${new Date().toISOString()}\tgh pr ${kind.sub}\t${skip}\t${verdict.message.split("\n")[0]}\n`);
    process.stdout.write(JSON.stringify({ systemMessage: `[pr-self-review] BYPASSED (${skip}). The GitHub status was not updated.` }));
    return 0;
  }
  if (!verdict.ok) {
    console.error(`[pr-self-review] Blocked \`gh pr ${kind.sub}\`. ${verdict.message}`);
    return 2;
  }

  let note = verdict.message;
  if (kind.sub !== "merge" && report) {
    try {
      const { postStatus } = await import("./post-status.mjs");
      const r = await postStatus({ root });
      note += r.ok
        ? ` GitHub status ${r.state}${r.posted ? " posted" : ` (${r.reason})`}.`
        : ` GitHub status NOT posted: ${r.reason}. Run post-status.mjs after pushing, or the required check will keep the PR unmergeable.`;
    } catch (e) {
      note += ` GitHub status NOT posted: ${e.message}`;
    }
  }
  process.stdout.write(JSON.stringify({ systemMessage: `[pr-self-review] ${note}` }));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      // A crashing gate must not silently let a PR through.
      console.error(`[pr-self-review] gate error: ${e?.stack ?? e}`);
      process.exit(classifyCommand(lastCmd)?.action === "block" ? 2 : 0);
    },
  );
}
