# e2e — insights

Append-only: never overwrite this file. In-place edits are allowed only to add or refresh `file:line` evidence, or to fix an entry that the same session's change made wrong. Re-read it before adding an entry so you do not
duplicate one. Date each entry, cite the `path/file.ts:NN` (symbol) it is grounded in (the line number is mandatory), and record only
substantial findings (prefer "X times out after 30 items" over "X can be tricky").
Every entry belongs under one of the 7 sections below. Written by the
`engineering-insights` skill (`.claude/skills/engineering-insights/`).

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes
- **2026-11-25** — `agent-browser wait --text` is case-sensitive and matches the text as rendered, so assert the exact UI string (`Request changes`, not `request changes`). On failure, read the screenshot `e2e/test-results/<flow>-fail.png` before guessing. On Windows, `spawn agent-browser` fails with ENOENT because the npm `.cmd` shim is not spawnable; run locally with `AGENT_BROWSER_BIN` set to the `agent-browser-win32-x64.exe` inside the global package, and invoke `bash scripts/e2e.sh` directly (`pnpm e2e:hermetic` breaks on `..` under cmd). Evidence: `e2e/specs/04-pr-findings.flow.json:12` (wait --text step), `e2e/run.ts:40` (BIN).

## Recurring Errors & Fixes

## Session Notes

## Open Questions
