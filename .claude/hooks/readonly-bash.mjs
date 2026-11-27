#!/usr/bin/env node
// PreToolUse guard for the read-only subagents (architecture-reviewer, plan-verifier).
// Reads the hook JSON from stdin. Exit 0 = allow, exit 2 = block (stderr goes back to
// the agent). Fails CLOSED: bad JSON, a missing or non-string command, or any crash blocks.
//
// How it works:
//   1. tokenize() parses the command the way bash would (quotes removed, so a quoted flag
//      is still seen as a flag). Anything it can't model safely blocks: a backslash or `$`
//      outside single quotes, backticks, `;`, a lone `&`, `||`, redirects, subshells,
//      comments, newlines, unbalanced quotes, and unquoted `{ } * ? [` (brace expansion
//      and globs could turn into argv words the guard never checked).
//   2. The result is a list of `&&` segments, each a pipeline of argv arrays.
//   3. Each argv is checked against a per-command rule. Long options are matched by
//      PREFIX in both directions, because git and GNU getopt accept any unambiguous
//      abbreviation (`--open` = `--open-files-in-pager`, `--out` = `--output`).
//
// Allowed commands:
//   cd <path> (alone) | git (diff|log|show|status|grep|blame|ls-files|rev-parse|merge-base) …
//   ls|cat|head|tail|wc … | pnpm lint | pnpm typecheck (no args)
//   pnpm test / pnpm exec vitest run (paths + --exclude, -t, --testNamePattern, --reporter=<builtin>)
//   node --test <paths>
//   After `|`: head|tail|grep|wc|sort only.
// Known limit: pnpm/vitest/node --test run repo scripts and test files; the guard can't see
// what those do. The agent can't write files, so it can only run code already in the repo.
// Self-contained on purpose: no imports beyond node:*.
import { pathToFileURL } from "node:url";

const GIT_SUBS = new Set(["diff", "log", "show", "status", "grep", "blame", "ls-files", "rev-parse", "merge-base"]);
const PLAIN_READERS = new Set(["ls", "cat", "head", "tail", "wc"]);
const FILTERS = new Set(["head", "tail", "grep", "wc", "sort"]);

// Long options (without `--`, lower-case) that run programs or write files.
const GIT_DENY_LONG = ["output", "open-files-in-pager", "ext-diff", "textconv"];
const SORT_DENY_LONG = ["output", "compress-program", "temporary-directory"];
// pnpm forwards extra args to eslint / tsc / vitest, whose flag sets are too large to
// deny-list (eslint -o, tsc --tsBuildInfoFile, vitest --globalSetup …). So pnpm uses an
// ALLOWLIST: lint/typecheck take no args; test/vitest take test paths plus these flags.
const VITEST_FLAGS_WITH_VALUE = new Set(["--exclude", "-t", "--testNamePattern"]);
const VITEST_REPORTERS = new Set(["default", "dot", "verbose", "basic"]);

/** @returns {string|null} reason to block */
function checkVitestArgs(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--" || !a.startsWith("-")) continue; // test path or name filter
    const [flag, value] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    if (VITEST_FLAGS_WITH_VALUE.has(flag)) {
      if (value === undefined) {
        // The value is the next word (a filter, never executed). It must not look like a
        // flag, or `-t --globalSetup=x` would hide a flag the CLI parses on its own.
        if (i + 1 >= args.length || args[i + 1].startsWith("-")) return `${flag} needs a value`;
        i++;
      }
      continue;
    }
    if (flag === "--reporter" && VITEST_REPORTERS.has(value)) continue;
    return `vitest flag not allowed: ${a.slice(0, 40)} (allowed: paths, --exclude, -t, --testNamePattern, --reporter=default|dot|verbose|basic)`;
  }
  return null;
}

const block = (reason) => ({ allow: false, reason });

/**
 * Bash-like tokenizer for the subset we allow.
 * @returns {{segments: string[][][]} | {error: string}} segments[&&-part][pipe-part] = argv
 */
export function tokenize(cmd) {
  const segments = [[[]]];
  let token = "";
  let inToken = false;
  const cur = () => segments.at(-1).at(-1);
  const endToken = () => {
    if (inToken) cur().push(token);
    token = "";
    inToken = false;
  };

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === " " || ch === "\t") {
      endToken();
    } else if (ch === "'") {
      const end = cmd.indexOf("'", i + 1);
      if (end === -1) return { error: "unbalanced quote" };
      token += cmd.slice(i + 1, end);
      inToken = true;
      i = end;
    } else if (ch === '"') {
      let j = i + 1;
      for (; j < cmd.length && cmd[j] !== '"'; j++) {
        const c = cmd[j];
        if (c === "$" || c === "`") return { error: "'$' or backtick inside double quotes" };
        if (c === "\\" && j + 1 < cmd.length) {
          const next = cmd[j + 1];
          // Inside "…" bash only unescapes these; any other backslash stays literal.
          token += '"\\$`'.includes(next) ? next : c + next;
          j++;
        } else {
          token += c;
        }
      }
      if (j >= cmd.length) return { error: "unbalanced quote" };
      inToken = true;
      i = j;
    } else if (ch === "&") {
      if (cmd[i + 1] !== "&") return { error: "lone '&'" };
      endToken();
      segments.push([[]]);
      i++;
    } else if (ch === "|") {
      if (cmd[i + 1] === "|") return { error: "'||'" };
      endToken();
      segments.at(-1).push([]);
    } else if (ch === "\\") {
      return { error: "backslash outside quotes (use forward slashes in paths)" };
    } else if ("$`;<>()#\r\n{}*?[".includes(ch)) {
      // `{a,b}` brace expansion and `* ? [` globs would let bash produce argv words we never
      // saw (e.g. `{--output=x,}` → `--output=x`). Quote them when they are meant literally.
      return { error: `'${ch === "\n" || ch === "\r" ? "newline" : ch}' outside quotes` };
    } else {
      token += ch;
      inToken = true;
    }
  }
  endToken();
  if (segments.some((pipe) => pipe.some((argv) => argv.length === 0))) {
    return { error: "empty command around '&&' or '|'" };
  }
  return { segments };
}

/** True if `arg` is a long option that is, or abbreviates, or extends a denied name. */
function deniedLong(arg, names) {
  if (!arg.startsWith("--") || arg === "--") return false;
  const name = arg.slice(2).split("=")[0].toLowerCase();
  return names.some((n) => n.startsWith(name) || name.startsWith(n));
}

/** True if `arg` is a short-option cluster (e.g. `-nO`) containing one of `letters`. */
function deniedShort(arg, letters) {
  if (!/^-[^-]/.test(arg)) return false;
  return [...letters].some((l) => arg.slice(1).includes(l));
}

function checkFlags(args, longNames, shortLetters) {
  for (const a of args) {
    if (deniedLong(a, longNames) || deniedShort(a, shortLetters)) return `flag not allowed: ${a.slice(0, 40)}`;
  }
  return null;
}

/** @returns {string|null} reason to block, or null if this argv is allowed */
function checkCommand(argv, position) {
  const [cmd, ...args] = argv;
  if (position > 0) {
    if (!FILTERS.has(cmd)) return `pipe target not allowed: ${cmd.slice(0, 40)}`;
    return cmd === "sort" ? checkFlags(args, SORT_DENY_LONG, "oT") : null;
  }
  if (PLAIN_READERS.has(cmd)) return null;
  switch (cmd) {
    case "cd":
      return args.length === 1 && !args[0].startsWith("-") ? null : "cd takes exactly one path";
    case "git":
      if (!GIT_SUBS.has(args[0])) return `git subcommand not allowed: ${String(args[0]).slice(0, 40)}`;
      return checkFlags(args.slice(1), GIT_DENY_LONG, "O");
    case "pnpm":
      if (args[0] === "lint" || args[0] === "typecheck") {
        return args.length === 1 ? null : `pnpm ${args[0]} takes no extra arguments`;
      }
      if (args[0] === "test") return checkVitestArgs(args.slice(1));
      if (args[0] === "exec" && args[1] === "vitest" && args[2] === "run") return checkVitestArgs(args.slice(3));
      return `pnpm command not allowed: ${args.slice(0, 3).join(" ").slice(0, 40)}`;
    case "node":
      if (args[0] !== "--test") return "only 'node --test <paths>' is allowed";
      return args.slice(1).some((a) => a.startsWith("-")) ? "node --test takes paths only" : null;
    default:
      return `command not on the read-only allowlist: ${cmd.slice(0, 40)}`;
  }
}

/** @returns {{allow: boolean, reason: string}} */
export function classify(command) {
  if (typeof command !== "string" || command.trim() === "") {
    return block("missing or empty command");
  }
  // Anywhere, even inside quotes: bash drops `\<newline>` inside "…" (line continuation),
  // which would rebuild a flag the tokenizer saw split in two.
  if (/[\r\n]/.test(command)) return block("contains a newline");
  const parsed = tokenize(command);
  if ("error" in parsed) return block(`contains ${parsed.error}`);
  for (const pipe of parsed.segments) {
    if (pipe[0][0] === "cd" && pipe.length > 1) return block("cd cannot be piped");
    for (let p = 0; p < pipe.length; p++) {
      const reason = checkCommand(pipe[p], p);
      if (reason) return block(reason);
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
