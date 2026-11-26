---
name: pr-self-review
description: "Pre-PR gate for DevDigest: reviews every open local change (branch commits vs main + staged + unstaged + untracked) by routing each changed file to the project skills that own it — UI skills (frontend-architecture, react-best-practices, next-best-practices, react-testing-library) on client files, backend architecture skills (onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design, zod) on server/reviewer-core files, security where relevant — plus lint and typecheck on touched packages. Any CRITICAL finding blocks the PR: a hook refuses `gh pr create/merge/ready` and the GitHub commit status `pr-self-review` is set to failure. Use before opening or merging any pull request, when a hook says the self-review is missing or stale, or when the user says 'self review', 'review my changes', 'check before PR', 'can I open a PR', 'pr-self-review'."
disable-model-invocation: true
metadata:
  version: "1.0.0"
  tags: review, pull-request, gate, quality, architecture
---

# PR Self Review

Review the local diff with the skills that own each file, the way a strict teammate would, and
refuse to open the PR while anything **CRITICAL** stands. Everything runs locally; the only
outward action is posting the commit status on GitHub (step 7).

Scripts live in `.claude/skills/pr-self-review/scripts/` (shortened to `$S` below; Node ≥ 22,
no dependencies). Run them from the repo root. Artifacts go to `.devdigest/self-review/`
(git-ignored): `plan.json` → `checks.json` → `llm-findings.json` → `report.json` / `report.md`.

Vocabulary is the repo's (`docs/agent-prompts/README.md`): severity `CRITICAL | WARNING | SUGGESTION`,
verdict `request_changes | comment | approve`. **Only CRITICAL blocks.** The verdict is computed by
`finalize.mjs` from the findings; never decide it yourself and never edit report files by hand.

## Workflow

### 1. Plan
```
node $S/route.mjs
```
Collects the changes, routes every file to skills (table: [references/skill-routing.md](references/skill-routing.md)),
runs the deterministic AGENTS.md rules (do-not-touch paths, `CLAUDE.md` stubs, docs README rows,
lockfiles) and the skill drift check. Read `plan.json`: `skills` maps each skill to its files.
If `files` is empty, say there is nothing to review and stop.

### 2. Checks: start them now, in the background
```
node $S/run-checks.mjs
```
Lint + typecheck in each touched package, in parallel (it can take a minute or two). Run it with
`run_in_background` and go on to step 3. Wait for it to finish before step 5.

### 3. Skill reviews: fan out, one subagent per skill
For **every** key in `plan.skills`, launch a `general-purpose` subagent. Send all of them in one
message so they run in parallel. Build each prompt from [references/reviewer-prompt.md](references/reviewer-prompt.md),
filling in the skill name, its file list, and the base sha. Each reviewer reads the skill itself
and pulls the diff with git, so don't paste the diff into the prompt.

- A skill with more than ~25 files: split its files into chunks of ≤ 25, one subagent per chunk.
- Each reviewer returns one JSON object. Parse it. If it is not valid JSON or the agent failed, record that skill as
  `{"skill": "...", "status": "failed", "error": "..."}`. `finalize` then turns it into a blocking
  coverage finding, so a silent gap can't pass.

### 4. Verify every CRITICAL
False CRITICALs block people for nothing. For every CRITICAL from step 3, launch a verifier
subagent (batch the ones in the same file together), using the **Verifier** prompt in
`reviewer-prompt.md`. Set `verification` on the finding to `CONFIRMED` or `REJECTED`, and
`verificationNote` to one line. Anything left unverified is downgraded to WARNING by `finalize`.
Don't verify WARNING or SUGGESTION findings.

### 5. Record and finalize
Write `.devdigest/self-review/llm-findings.json` (Write tool):
```json
{ "fingerprint": "<plan.fingerprint>",
  "reviews": [ { "skill": "onion-architecture", "status": "done", "files": ["..."], "findings": [ ... ] } ] }
```
Merge chunked reviews of the same skill into one entry. Then:
```
node $S/finalize.mjs
```
It rejects the run if the code changed after step 1 (start over in that case). It caps findings
on files outside the diff at WARNING, dedupes, derives the verdict, and prints `report.md`.

### 6. Report to the user
Show the verdict line and every CRITICAL as `file:line`, the rule, and the fix. Show the count of
WARNINGs with the top few, and only the number of SUGGESTIONs. Follow
[references/report-template.md](references/report-template.md). If it's blocked, say plainly that the PR
can't be opened until the CRITICALs are fixed and `/pr-self-review` is re-run, and offer to fix them.

### 7. GitHub status (only when the user is about to open or update a PR)
```
node $S/post-status.mjs          # --dry-run to preview
```
This posts `pr-self-review` = `success`/`failure` on HEAD. It refuses when the tree is dirty,
HEAD isn't pushed, or the report is stale, because the status has to describe exactly the pushed commit.
The gate hook also calls it automatically on `gh pr create`/`gh pr ready`. Posting is outward-facing,
so run it yourself only as part of opening a PR that the user asked for.

## The gate (what enforces this)

- **Claude Code hook** (`.claude/settings.json`, PreToolUse on Bash|PowerShell → `scripts/gate.mjs`)
  blocks `gh pr create|merge|ready` (exit 2) when the report is missing, stale (any code change
  since the review; committing is fine), or `request_changes`. On `git push` it only warns, so WIP
  pushes keep working. When the hook blocks you, run this skill; never work around the hook.
- **GitHub**: in branch protection for `main`, mark the status check `pr-self-review` as
  *required*. Then GitHub refuses the merge until the HEAD of the PR has a `success` status, and
  any new push needs a fresh review. Without that setting, nothing stops a merge from the web UI.
- **git pre-push** (optional, for pushes outside Claude): `git config core.hooksPath .githooks`.
  It warns and never blocks.
- **Honest limit:** the status is self-reported from a developer machine, so a determined person can
  fake it. It prevents accidents; it does not stop someone trying to get around it.

**Bypass:** `PR_SELF_REVIEW_SKIP="<reason, ≥ 10 chars>"` (env or inline before the `gh` command).
It is logged to `.devdigest/self-review/skips.log`, and the GitHub status is left unchanged.
**Use it only when the user explicitly tells you to, with their reason. Never use it on your own initiative.**

## Rules for you, the orchestrator

- Review the **diff**, not the whole codebase. Old problems in untouched code are at most WARNING.
- Don't inflate severity to look thorough, and don't deflate it to get the PR through. Apply
  [references/severity-rubric.md](references/severity-rubric.md) as written.
- Don't change code during the review. Fixing comes after the report, and only if the user wants it.
  After any fix, re-run from step 1 (the fingerprint changed).
- If `route.mjs` reports a drift WARNING (an installed skill is not routed), mention it. The fix is a
  row in `scripts/routing.mjs` and in `references/skill-routing.md`.
- Tests for the scripts: `node --test .claude/skills/pr-self-review/scripts/`.
