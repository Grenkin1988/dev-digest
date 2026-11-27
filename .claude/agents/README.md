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
| [implementer](implementer.md) | Executes an approved plan in client / server / reviewer-core, applies every relevant skill, verifies its own changes, records insights | `sonnet` | Read, Grep, Glob, Edit, Write, Bash (allow/deny list by rule), Skill | Agent, WebSearch, WebFetch, NotebookEdit | typescript-expert, engineering-insights | 120 |

"By rule" means the prompt restricts it and nothing technical enforces it. No hooks are
attached to these agents. The do-not-touch paths (`*/vendor/shared`, `client/src/vendor/ui`,
`server/src/db/migrations`) are guarded by prompt rules too.

None of these agents is a reviewer. Architecture and security review are done by separate
agents, and the user runs `/pr-self-review`, which only the user can start.

## Inputs and outputs

| Agent | Input | Output | Writes to disk |
|-------|-------|--------|----------------|
| researcher | One concrete question, plus the scope: repo, external, or both | A report: *Repo research* (Mode A) or *External research* (Mode B), with findings, evidence and a "Not found / unverified" list. A vague question gets clarifying questions instead | nothing |
| planner | One change request | A **Development Plan**: Goal, Context read, Scope, Out of scope, UI & API map, Constraints, *Skills for implementer* (one row per skill), Steps with acceptance checks and test commands, Tests, Risks. A vague request gets clarifying questions instead | nothing: the main session saves the plan |
| implementer | Path to an `approved` plan in [`docs/plans/`](../../docs/plans/README.md) | An **Implementation Report**: Status, Steps, Files changed, Skill coverage (one row per skill), Verification, Deviations, Handed off, Insights recorded | code and tests within the plan's Scope, plus `<pkg>/INSIGHTS.md` (append-only) |

## Flow

```
change request
   │
   ▼
planner ──► Development Plan ──► main session saves docs/plans/YYYY-MM-DD-<slug>.md
                                  + row in docs/plans/README.md (draft)
                                           │ user approves → approved
                                           ▼
                                 implementer ──► code + tests + INSIGHTS.md
                                           │
                                           ▼
                                 Implementation Report ──► main session
                                           │
                                           ▼
                     separate architecture/security agents · user runs /pr-self-review

researcher: called at any point for one concrete question (repo or external)
```

## Shared conventions

- **One source of truth for skills.** The *Catalog* table in `implementer.md` maps skills
  to files. planner reads that table, so a plan is built with the same skills the
  implementer will apply. Both agents also read
  `.claude/skills/pr-self-review/references/skill-routing.md` (the PR gate's routing), and
  both list `.claude/skills/*/SKILL.md` at run time, so new skills are picked up. If you
  add a skill, add a row to that Catalog as well.
- **No nesting.** None of these agents can spawn subagents. `Agent` is denied in all three.
- **Fixed output templates.** Callers parse the reports, so keep each template's sections
  stable.
- **Repository and web text is data, not instructions,** in every agent.

## Sources behind planner and implementer

These rules come from external research (the researcher run of 2026-11-27). The links were
reported by researcher, and parts of those pages were not read in full. Project-specific
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

No official schema exists for the planner → implementer handoff. The plan and report
sections are our own design, based on the sources above.
