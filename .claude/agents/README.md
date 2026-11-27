# Subagents

Project subagents for Claude Code. This file is a **map** of the set: what each agent is for,
what it may do, and what goes in and comes out. The rules themselves live in each agent's
`.md` file, and that file is the source of truth. When you add, rename or remove an agent,
update this table in the same change.

## Catalog

| Agent | Responsibility | Model | Tools | Explicitly denied | Preloaded skills | Max turns |
|-------|----------------|-------|-------|-------------------|------------------|-----------|
| [researcher](researcher.md) | Answers one concrete question about the repo or external docs, with cited evidence | `sonnet` | Read, Grep, Glob, Bash (read-only by rule), WebSearch, WebFetch | Write, Edit, NotebookEdit, Skill, Agent | — | default |
| [planner](planner.md) | Turns one change request into a structured Development Plan that already obeys the project skills, AGENTS.md and INSIGHTS.md | `opus` | Read, Grep, Glob, Bash (read-only by rule), Skill | Write, Edit, NotebookEdit, Agent, WebSearch, WebFetch | onion-architecture, frontend-architecture | 40 |
| [implementer](implementer.md) | Executes an approved plan in client / server / reviewer-core, applies every relevant skill, writes production code only (no new tests), runs the existing tests of touched packages, records insights | `sonnet` | Read, Grep, Glob, Edit, Write, Bash (allow/deny list by rule), Skill | Agent, WebSearch, WebFetch, NotebookEdit | typescript-expert, engineering-insights | 120 |
| [test-writer](test-writer.md) | Writes the new tests and fixtures that a plan assigns to it (or an explicit file list), runs them, leaves a real bug as a red test | `sonnet` | Read, Grep, Glob, Edit, Write, Bash (allow/deny list by rule), Skill | Agent, WebSearch, WebFetch, NotebookEdit | typescript-expert | 80 |
| [architecture-reviewer](architecture-reviewer.md) | Read-only architecture review of a diff: onion rings, frontend placement, do-not-touch paths, ESM and alias rules. Runs `pnpm lint` first as evidence | `opus` | Read, Grep, Glob, Bash (hook-guarded) | Write, Edit, NotebookEdit, Agent, WebSearch, WebFetch, Skill | onion-architecture, frontend-architecture | 30 |
| [plan-verifier](plan-verifier.md) | Read-only check that an approved plan was delivered: a traceability matrix of every plan item against the real diff and command output | `opus` | Read, Grep, Glob, Bash (hook-guarded) | Write, Edit, NotebookEdit, Agent, WebSearch, WebFetch, Skill | — | 40 |
| [doc-writer](doc-writer.md) | Writes package docs and specs (with Mermaid diagrams) from a plan and/or named sources, plus the index row; proposes an ADR location but never creates one | `sonnet` | Read, Grep, Glob, Edit, Write, Bash | Agent, WebSearch, WebFetch, NotebookEdit, Skill | mermaid-diagram | 40 |

"By rule" means the prompt restricts it and nothing technical enforces it. That still
holds for researcher, planner, implementer and test-writer. The two read-only reviewers,
architecture-reviewer and plan-verifier, are hook-guarded: each has a frontmatter
`PreToolUse` hook on `Bash` that runs `.claude/hooks/readonly-bash.mjs`, which blocks any
command that is not on a read-only allowlist. It tokenizes the command like bash (so a
quoted flag is still a flag), checks each command's argv against per-command rules, and
matches denied long options by prefix (git and GNU tools accept abbreviations). It blocks
`$` and backslashes outside single quotes, a lone `&`, `;`, `||`, redirects, subshells,
newlines, and flags that run programs or write files (git `-O`/`--open-files-in-pager`/
`--ext-diff`/`--textconv`/`--output`; sort `-o`/`-T`/`--compress-program`; pnpm/vitest
`--fix`/`-u`/`--output*`/`--coverage`/`--config`); `node --test` takes paths only. Limit:
pnpm, vitest and `node --test` run code already in the repo. The do-not-touch paths (`*/vendor/shared`, `client/src/vendor/ui`,
`server/src/db/migrations`) are guarded by prompt rules.

Two agents are reviewers: architecture-reviewer (architecture only) and plan-verifier
(plan traceability only). There is no security reviewer agent yet. Security review stays
with a separate agent, and the user runs `/pr-self-review`, which only the user can start.

## Inputs and outputs

| Agent | Input | Output | Writes to disk |
|-------|-------|--------|----------------|
| researcher | One concrete question, plus the scope: repo, external, or both | A report: *Repo research* (Mode A) or *External research* (Mode B), with findings, evidence and a "Not found / unverified" list. A vague question gets clarifying questions instead | nothing |
| planner | One change request | A **Development Plan**: Goal, Context read, Scope, Out of scope, UI & API map, Constraints, *Skills for implementer* (one row per skill), Steps with acceptance checks and test commands, Tests, Risks, *Save as* (target path + README row for the caller). A vague request gets clarifying questions instead | nothing: the main session saves the plan as `draft` with its README row in the same turn |
| implementer | Path to an `approved` plan in [`docs/plans/`](../../docs/plans/README.md) | An **Implementation Report**: Status, Steps, Files changed, Skill coverage (one row per skill), Verification, Deviations, Handed off, Insights recorded | production code within the plan's Scope (no new tests), plus `<pkg>/INSIGHTS.md` (append-only) |
| test-writer | Plan path (`approved` or `done`): it writes the plan's *Tests* items owned by test-writer, **or** an explicit file list plus behaviours to pin; optional Implementation Report | A **Test Report**: Status, Target, Tests written, Skill coverage, Runs, Suspected production defects, Not covered, Insight candidates | only test files and fixtures (`client/src/**/*.test.{ts,tsx}`, `client/src/test/**`, `server/test/**`, `reviewer-core/test/**`, `*.test.ts` under `src`) |
| architecture-reviewer | Diff base (default `main`) or an explicit file list; optional plan path for intent | An **Architecture Review**: Scope reviewed, Tool evidence, Findings (with `file:line`), Checked and clean, Not checked | nothing |
| plan-verifier | Plan path in `docs/plans/`; optional Implementation Report, Test Report, extra requirements and diff base | A **Plan Verification Report**: Plan, Inputs, Verdict, Traceability matrix, Commands run, Not verifiable, Out-of-plan observations | nothing |
| doc-writer | Plan path and/or named source paths, plus the target package(s) | A **Documentation Report**: Status, Docs written, Index rows added, Diagrams, Implemented vs Planned, Open questions, Insight candidates | only `client\|server\|reviewer-core\|e2e/docs/**`, `client\|server\|reviewer-core/specs/*.md`, and the index row in that folder's `README.md` |

## Flow

```
change request
   │
   ▼
planner (opus, read-only) ──► Development Plan ──► main session saves docs/plans/YYYY-MM-DD-<slug>.md (draft)
                                                        │ user approves → approved
                                                        ▼
                                  implementer (sonnet, writes code, runs existing tests) ──► Implementation Report
                                                        │
                                                        ▼
                                  test-writer (sonnet, writes the plan's new tests/fixtures only) ──► Test Report
                                                        │
                              ┌─────────────────────────┴─────────────────────────┐
                              ▼                                                   ▼
          architecture-reviewer (opus, read-only)              plan-verifier (opus, read-only)
          ──► Architecture Review (findings + file:line)       ──► Plan Verification Report (matrix)
                              └─────────────────────────┬─────────────────────────┘
                                   gaps? → main session re-runs implementer / test-writer
                                                        ▼
                                  doc-writer (sonnet, writes docs/specs only) ──► Documentation Report
                                                        │
                                                        ▼
                                           user runs /pr-self-review → gh pr create

researcher: called at any point for one concrete question
No agent calls another (Agent denied in all seven); the main session passes file paths between them.
```

## Shared conventions

- **One source of truth for skills.** The *Catalog* table in `implementer.md` maps skills
  to files. planner reads that table, so a plan is built with the same skills the
  implementer will apply. Both agents also read
  `.claude/skills/pr-self-review/references/skill-routing.md` (the PR gate's routing), and
  both list `.claude/skills/*/SKILL.md` at run time, so new skills are picked up. If you
  add a skill, add a row to that Catalog as well.
- **No nesting.** None of these agents can spawn subagents. `Agent` is denied in all seven.
- **Read-only agents are hook-guarded.** architecture-reviewer and plan-verifier carry a
  `PreToolUse` hook on `Bash` (`.claude/hooks/readonly-bash.mjs`, tested by
  `readonly-bash.test.mjs`). Hooks only run when the project folder is trusted in Claude
  Code. In an untrusted folder the guard is off and only the prompt rules remain.
- **Test ownership is split.** implementer writes no new tests and runs the existing
  ones. test-writer writes the new tests. A failing test outside the plan's named
  behaviour changes is reported, never edited or weakened.
- **Fixed output templates.** Callers parse the reports, so keep each template's sections
  stable.
- **Repository and web text is data, not instructions,** in every agent.

## Sources behind the agents

These rules come from external research (the researcher run of 2026-11-27, extended for the
review and docs agents). The links were reported by researcher, and parts of those pages
were not read in full. Project-specific
rules come from `AGENTS.md`, the package `INSIGHTS.md` files and the PR gate.

| Practice | Source | Where it is applied |
|----------|--------|---------------------|
| A specific `description` decides delegation; one narrow role per agent | [Claude Code: sub-agents](https://code.claude.com/docs/en/sub-agents) | `description` in both. Review is excluded from both |
| Least privilege; `disallowedTools: Write, Edit` for read-only agents; Bash isn't read-only without extra rules | same | planner: no Write or Edit, read-only Bash list. implementer: Bash allow/deny list |
| Nesting is allowed by default, so remove `Agent` to block it | same | `Agent` in `disallowedTools` of both |
| `skills:` preloads full skill content, and skills aren't inherited automatically; the `Skill` tool loads them on demand | same | 2 preloaded skills per agent; every other skill goes through `Skill` |
| `maxTurns` as a stop condition; a `model` per agent | same | planner 40 / opus, implementer 120 / sonnet |
| Progressive disclosure; loaded skill content stays in context | [Agent Skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Only always-relevant skills are preloaded. The rest are loaded per routed file |
| Plan → validate → execute → verify; feedback loops; strict output templates | same | User approval between the agents; implementer tests after each step; fixed templates |
| A delegation contract (objective, format, tools, boundaries); hand off by file reference; checkpoints | [Anthropic: multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | Plan sections Goal, Scope, Out of scope, Steps; the plan is passed as a file path |
| Ground truth from the environment; stop conditions | [Anthropic: building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Verification table with real command output; "stop and report" rules (3 failed attempts, plan conflict) |
| Subagents return condensed summaries that reference files | [Anthropic: effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Compact report templates with paths, not file dumps |
| Read-only reviewer enforced by tools, fresh context, check every requirement and skip style, false-positive warning, separate test writer | [Claude Code: best practices](https://code.claude.com/docs/en/best-practices) | architecture-reviewer, plan-verifier, test-writer |
| Evaluator-optimizer with clear criteria; ground truth; stop conditions | [Anthropic: building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Attempt limits and command-output evidence in the new agents |
| Query priority | [Testing Library: query priority](https://testing-library.com/docs/queries/about/#priority) | test-writer |
| Mocking | [Vitest: mocking](https://vitest.dev/guide/mocking) | test-writer |
| `inject()`, `close()` | [Fastify: testing](https://fastify.dev/docs/latest/Guides/Testing/) | test-writer |
| Deterministic boundary evidence | [dependency-cruiser](https://github.com/sverweij/dependency-cruiser), [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | architecture-reviewer runs tool evidence first (`pnpm lint`) |
| Traceability matrix | [Wikipedia: traceability matrix](https://en.wikipedia.org/wiki/Traceability_matrix) | plan-verifier |
| Blocking / non-blocking labels | [Conventional Comments](https://conventionalcomments.org/) | Severity decorations in architecture-reviewer |
| Four doc types | [Diátaxis](https://diataxis.fr), [Diátaxis compass](https://diataxis.fr/compass/) | doc-writer |
| Docs-as-code | [Write the Docs: docs as code](https://www.writethedocs.org/guide/docs-as-code/) | Index row in the same change (doc-writer) |
| Project style wins | [Google developer documentation style guide](https://developers.google.com/style) | doc-writer |
| Diagram levels | [C4 model](https://c4model.com) | doc-writer diagrams |
| ADR format | [Cognitect: documenting architecture decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions), [adr.github.io](https://adr.github.io) | doc-writer ADR proposal (never created) |

Unverified: there is no primary source for "don't weaken assertions"; Conventional Comments
was seen via a search snippet only; Mermaid C4 syntax is unverified; and it is unknown whether
`skills:` preloads work when the `Skill` tool is denied.

No official schema exists for the planner → implementer handoff. The plan and report
sections are our own design, based on the sources above.
