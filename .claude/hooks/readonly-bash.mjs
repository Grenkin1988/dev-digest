#!/usr/bin/env node
// PreToolUse guard for the read-only subagents (architecture-reviewer, plan-verifier).
// Reads the hook JSON from stdin. Exit 0 = allow, exit 2 = block (stderr goes back to
// the agent). Fails CLOSED: bad JSON, a missing or non-string command, or any crash blocks.
//
// Allowlist (every `&&`-separated segment must match):
//   cd <path> | git (diff|log|show|status|grep|blame|ls-files|rev-parse|merge-base) …
//   ls|cat|head|tail|wc … | pnpm (lint|typecheck|test) … | pnpm exec vitest run …
//   node --test <paths>
// A single `|` is allowed only into head|tail|grep|wc|sort.
// Self-contained on purpose: no imports beyond node:*.
import { pathToFileURL } from "node:url";

const GIT_SUBS = "diff|log|show|status|grep|blame|ls-files|rev-parse|merge-base";
const PATH_ARG = String.raw`(?:[\w.\\/:~@%+=,-]+|__Q__)`;

const SEGMENT_ALLOW = [
  new RegExp(String.raw`^cd\s+${PATH_ARG}$`),
  new RegExp(String.raw`^git\s+(?:${GIT_SUBS})(?:\s.*)?$`),
  /^(?:ls|cat|head|tail|wc)(?:\s.*)?$/,
  /^pnpm\s+(?:lint|typecheck|test)(?:\s.*)?$/,
  /^pnpm\s+exec\s+vitest\s+run(?:\s.*)?$/,
  // node --test takes only path-like arguments (no --eval / -p / script files).
  /^node\s+--test(?:\s+(?!--?(?:e|p|eval|print|require|import)\b)[\w.\\/*@:=-]+)*$/,
];
const FILTER_ALLOW = /^(?:head|tail|grep|wc|sort)(?:\s.*)?$/;

// Checked on the raw command: these execute even inside double quotes.
const RAW_DENY = [
  [/`/, "backticks"],
  [/\$\(/, "command substitution $("],
  [/\$\{/, "parameter expansion ${"],
  [/[\r\n]/, "newlines"],
];
// Checked after quoted strings are stripped.
const BARE_DENY = [
  [/;/, "';'"],
  [/\|\|/, "'||'"],
  [/>/, "redirection '>'"],
  [/</, "redirection '<'"],
  [/['"]/, "unbalanced quote"],
  [/(?:^|\s)--fix\b/, "--fix"],
  [/(?:^|\s)-u(?:\s|$)/, "-u"],
  [/(?:^|\s)--update\b/, "--update"],
  [/(?:^|\s)--output\b/, "--output"],
  [/(?:^|\s)-o\s*\S/, "-o (output file)"],
];

/** Replaces quoted strings with __Q__ so text that only mentions a command is not scanned. */
export function stripQuoted(cmd) {
  return cmd.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "__Q__");
}

const block = (reason) => ({ allow: false, reason });

/** @returns {{allow: boolean, reason: string}} */
export function classify(command) {
  if (typeof command !== "string" || command.trim() === "") {
    return block("missing or empty command");
  }
  for (const [re, name] of RAW_DENY) {
    if (re.test(command)) return block(`contains ${name}`);
  }
  const bare = stripQuoted(command);
  for (const [re, name] of BARE_DENY) {
    if (re.test(bare)) return block(`contains ${name}`);
  }

  for (const segment of bare.split("&&")) {
    const parts = segment.split("|").map((p) => p.trim());
    // A lone `&` (background job) survives the `&&` split.
    if (parts.some((p) => p === "" || p.includes("&"))) return block("empty segment or '&'");
    const [head, ...filters] = parts;
    if (!SEGMENT_ALLOW.some((re) => re.test(head))) {
      return block(`command not on the read-only allowlist: ${head.slice(0, 60)}`);
    }
    for (const f of filters) {
      if (!FILTER_ALLOW.test(f)) return block(`pipe target not allowed: ${f.slice(0, 60)}`);
    }
  }
  return { allow: true, reason: "ok" };
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  let command;
  try {
    command = JSON.parse(await readStdin())?.tool_input?.command;
  } catch {
    console.error("[readonly-bash] blocked: could not parse hook input");
    return 2;
  }
  const verdict = classify(command);
  if (!verdict.allow) {
    console.error(`[readonly-bash] blocked: ${verdict.reason}. This agent is read-only; only inspection, lint, typecheck and test commands are allowed.`);
    return 2;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`[readonly-bash] blocked: guard error: ${e?.message ?? e}`);
      process.exit(2);
    },
  );
}
