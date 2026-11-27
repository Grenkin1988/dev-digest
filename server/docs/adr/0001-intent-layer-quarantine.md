# ADR 0001: Intent Layer — quarantined classifier, decisions in code

- **Status:** accepted
- **Date:** 2026-11-27
- **Plan:** [`docs/plans/2026-11-27-intent-layer.md`](../../../docs/plans/2026-11-27-intent-layer.md)
- **Packages:** server (`src/modules/intent`), reviewer-core (`src/intent`, `src/review/scope.ts`)

## Context

Before a review, DevDigest derives a PR's intent (summary, in scope, out of scope)
and uses it to drop review comments that fall outside the PR's scope. Every input
to that intent is author-controlled or repo-derived: the PR title and description,
linked issues, plan/spec docs, commit messages, file names, hunk headers and, for
small PRs with no description, a few added lines.

That creates a new attack path. Text in a PR description or a linked doc could try
to steer the classifier into declaring real problems "out of scope", and so hide
them from the review. Prompt delimiters alone are not a boundary (OWASP LLM Prompt
Injection Prevention Cheat Sheet: "labeling alone does not enforce that boundary").

## Decision

1. **The classifier is quarantined.** It is one structured LLM call with no tools
   (`reviewer-core/src/intent/classify.ts:41`, `classifyIntent`). Every source is
   wrapped in `<untrusted>` (`reviewer-core/src/intent/prompt.ts:29`,
   `buildIntentPrompt`). Its output is clamped in code: summary ≤ 400 chars, ≤ 8 items
   per list, ≤ 160 chars each (`classify.ts:16`, `clampIntent`).
2. **The model only describes; code decides.**
   - Confidence is computed from which sources were available, never asked of the
     model (`server/src/modules/intent/helpers.ts:362`, `computeConfidence`).
   - Whether the scope filter runs is decided in code: only for an intent from the
     author's description, with `high` or `medium` confidence, that is not stale
     (`helpers.ts:378`, `shouldFilterByScope`). An intent inferred from the changes
     never filters, because "out of scope" judged against the same diff is circular.
3. **Filtering is code, not an instruction.** The reviewer is never told to ignore
   anything. `SCOPE_RULE` (`reviewer-core/src/prompt.ts:42`) only asks it to tag each
   finding `in` or `out` and says scope never changes severity. The intent reaches the
   reviewer as an `<untrusted>` block labelled "unverified author claims". The filter
   (`reviewer-core/src/review/scope.ts:74`, `applyScopeFilter`) runs after grounding
   (`reviewer-core/src/review/run.ts:236`, `:245`).
4. **Serious findings are never dropped.** A finding is serious when it is
   `CRITICAL`, category `security`, or kind `secret_leak` / `lethal_trifecta`
   (`scope.ts:50`, `isSerious`). Out-of-scope serious findings keep exactly one
   finding per review (the worst); the others are listed in its rationale. A finding
   with no tag counts as `in`.
5. **No external fetches.** Only GitHub issues (through the existing GitHub client,
   `server/src/modules/intent/service.ts:376`) and allowlisted docs/specs files from
   the local clone are read. Any other URL is recorded as missing context
   (`host_not_allowlisted`, `helpers.ts:201`) and never fetched. The file reader
   enforces the same allowlist itself (`server/src/adapters/git/file-at-ref.ts:26`).
6. **Logs carry metadata only.** Source kinds, references, sizes, model and token
   counts; never description, issue, doc, hunk or added-line text. Error messages are
   cut to one line of ≤ 120 chars, since provider errors can quote model output
   (`helpers.ts:502`, `safeErrorSummary`).

## Consequences

- **Worst case under injection:** a manipulated intent can drop *non-serious*
  findings (for example a WARNING bug) on PRs whose description claims the area is
  out of scope. Serious findings stay visible, and every drop is counted in the run
  log. Downgrading instead of dropping was considered and not chosen (plan,
  *Decisions*).
- **Several serious out-of-scope findings collapse into one** separate finding. The
  PR stays blocked and nothing disappears silently, but the count of separate
  CRITICAL findings can go down.
- **Less context in some cases:** tickets on Jira, Linear or other hosts are never
  fetched, and appear as missing context with lowered confidence. Adding them later
  means a host-allowlisted adapter with IP and redirect checks.
- **Changing these rules** (what counts as serious, when filtering is on, what may
  be fetched) is a security decision: update this ADR and re-run security review.

## Alternatives considered

- **Let the model report confidence, or tell the reviewer to skip out-of-scope
  issues.** Rejected: both put the decision inside the injectable model.
- **File-based scope matching instead of a model tag.** Rejected: `in_scope` is prose,
  not file globs.
- **Fetch any linked URL with SSRF guards.** Rejected for v1: no allowlisted tracker
  hosts exist yet, so this would add attack surface for no gain.
