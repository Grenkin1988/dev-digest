# Development plans

Structured Development Plans produced by the `planner` subagent (`.claude/agents/planner.md`)
and executed by the `implementer` subagent (`.claude/agents/implementer.md`).

## Workflow

1. The main session runs `planner` with a change request.
2. The main session saves the returned plan here as `YYYY-MM-DD-<slug>.md`, adds a row
   below with status `draft` and shows it to the user.
3. The user approves, and the status becomes `approved`. `implementer` refuses to execute
   a plan that isn't `approved`.
4. `implementer` runs with the plan path and returns an Implementation Report. The status
   becomes `done`, `partial` or `blocked`.
5. `test-writer` runs after `implementer` and writes the new tests that the plan's *Tests*
   section assigns to it. `implementer` writes no new tests.
6. Architecture and security review are done by separate agents, and the user runs
   `/pr-self-review` before any PR.

Status values: `draft` · `approved` · `done` · `partial` · `blocked` · `superseded`.

## Plans

| Plan | Status | Date | Summary |
|------|--------|------|---------|
| [2026-11-27-review-and-docs-subagents](2026-11-27-review-and-docs-subagents.md) | done | 2026-11-27 | Add test-writer, architecture-reviewer, plan-verifier and doc-writer subagents, a read-only Bash hook, and update the agents README |
