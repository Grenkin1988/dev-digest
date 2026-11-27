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
// Also blocked: a backslash outside quotes (so `\'` can't fake a quoted span; use forward
// slashes in paths), and flags that run programs or write files (-o, -O, -T, --output*,
// --open-files-in-pager, --ext-diff, --textconv, --compress-program,
// --temporary-directory, --test-reporter-destination).
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

// Short-flag cluster containing a given letter, e.g. `-o x`, `-no x`, `-Orm`.
const shortFlag = (letter) => new RegExp(String.raw`(?:^|\s)-[A-Za-z]*${letter}`);

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
  [/(?:^|\s)--fix\b/, "--fix"],
  [/(?:^|\s)-u(?:\s|$)/, "-u"],
  [/(?:^|\s)--update\b/, "--update"],
  // Prefix match: also catches --outputFile (vitest) and --output-directory.
  [/(?:^|\s)--output/, "--output*"],
  [/(?:^|\s)--test-reporter-destination/, "--test-reporter-destination"],
  [shortFlag("o"), "-o (output file)"],
  // git grep -O<cmd> / --open-files-in-pager=<cmd> runs an arbitrary program.
  [shortFlag("O"), "-O (open files in pager)"],
  [/(?:^|\s)--open-files-in-pager/, "--open-files-in-pager"],
  // git diff/log/show can run external diff / textconv drivers.
  [/(?:^|\s)--ext-diff/, "--ext-diff"],
  [/(?:^|\s)--textconv/, "--textconv"],
  // sort --compress-program=<prog> runs a program; -T / --temporary-directory writes files.
  [/(?:^|\s)--compress-program/, "--compress-program"],
  [shortFlag("T"), "-T (temporary directory)"],
  [/(?:^|\s)--temporary-directory/, "--temporary-directory"],
];

/**
 * Replaces quoted strings with __Q__ so text that only mentions a command is not scanned.
 * Follows bash quoting: no escapes inside '…', `\` escapes the next char inside "…".
 * Returns null (caller blocks) for a backslash outside quotes, because `\'` / `\"` would
 * otherwise open a fake quoted span that hides `;` or `>` from the scan, or for an
 * unterminated quote.
 */
export function stripQuoted(cmd) {
  let out = "";
  let i = 0;
  while (i < cmd.length) {
    const ch = cmd[i];
    if (ch === "\\") return null;
    if (ch === "'") {
      const end = cmd.indexOf("'", i + 1);
      if (end === -1) return null;
      out += "__Q__";
      i = end + 1;
    } else if (ch === '"') {
      let j = i + 1;
      while (j < cmd.length && cmd[j] !== '"') j += cmd[j] === "\\" ? 2 : 1;
      if (j >= cmd.length) return null;
      out += "__Q__";
      i = j + 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
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
  if (bare === null) {
    return block("contains a backslash outside quotes or an unbalanced quote (use forward slashes in paths)");
  }
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
