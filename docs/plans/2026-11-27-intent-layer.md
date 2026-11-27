# Development Plan: Intent Layer (PR intent classifier, scope-aware review, Intent card)

Status: done

## Goal
Before a review runs, DevDigest derives a structured **Intent** for each PR (summary, in-scope, out-of-scope, confidence, sources, missing context, mode) with a cheap flash-class model. It uses the PR title/body, linked issues, repo plan/spec docs, commit messages, and the changed-file list with hunk headers. Diff bodies are not sent, with one exception: a small changes-only PR (see *Small-PR added-lines excerpt*). When the PR has no real author description, the intent is inferred from the changes alone. The Intent is stored per PR, shown on the Overview tab as an "INTENT" card (with a stale indicator and a Re-derive button), and added to the reviewer prompt. Out-of-scope findings are then filtered in code, but a serious (CRITICAL or security) out-of-scope problem always keeps one signal.

## Context read
- `AGENTS.md`, `server/AGENTS.md`, `reviewer-core/AGENTS.md`, `client/AGENTS.md`:
  - modules are registered statically;
  - Zod contracts from `vendor/shared` are the route schemas;
  - external systems go through DI adapters, with mocks in `adapters/mocks.ts`;
  - reviewer-core is pure and fences untrusted text with `wrapUntrusted()`, and `groundFindings()` is never bypassed;
  - the client gets data only through `lib/hooks/*` and gets strings through next-intl;
  - `client/src/vendor/shared` is a separate copy, so a contract change goes in both;
  - migrations are not applied on boot.
- `server/INSIGHTS.md`, top 3:
  1. Routes don't touch the DB. Services get narrow deps built in `platform/container.ts`. Another module's data comes in as an injected function (`container.ts:179` usageForPulls). `pnpm lint` enforces the rings (`eslint.config.mjs:44`).
  2. `GET /pulls/:id` re-fetches from GitHub at most once per `DETAIL_REFRESH_TTL_MS`, and serves persisted rows when offline (`pulls/service.ts:205` detailFor). Reuse it rather than calling GitHub again.
  3. `schema.response` is enforced at runtime. A DB value outside a contract enum gives a 500 (`reviews/routes.ts:131`). So the new enum columns must match the contract enums exactly.
  - Also relevant: tests that call `getContext` need `overrides: { auth: fakeAuth }` (`test/fake-auth.ts:4`). The executor logs one `skills:` line only when N>0 (`run-executor.ts:394`), and the new log lines follow that style.
- `reviewer-core/INSIGHTS.md`, top 3:
  1. Tests borrow the server's mocks and diff parser by relative path (`reviewer-core/test/run.test.ts:3`).
  2. `@devdigest/shared` resolves to `server/src/vendor/shared` (`reviewer-core/vitest.config.ts:9`).
  3. `OpenRouterProvider` stays in the engine on purpose (`reviewer-core/src/llm/openrouter.ts:1`).
- `client/INSIGHTS.md`, top 3:
  1. Two cache keys hold one PR (`["pull-by-number"]` and `["pull", id]`), so invalidate both (`client/src/lib/hooks/reviews.ts:82`).
  2. A component test that renders a new namespace must pass its messages to `NextIntlClientProvider`.
  3. `Icon` names must exist in `@devdigest/ui`; `pnpm typecheck` catches this, vitest does not (`client/src/vendor/ui/icons.tsx:147`).
- `server/docs/architecture.md`, `reviewer-core/docs/architecture.md` (extension point "New prompt section → `PromptParts` + `PromptAssembly`"), `client/docs/architecture.md`.
- `server/specs/`, `client/specs/`, `reviewer-core/specs/`: empty indexes, nothing relevant.
- `docs/agent-prompts/README.md`: the prompt section order, and "the output schema is NOT in the prompt". `choosing-a-model.md`: `deepseek/deepseek-v4-flash` is the proven cheap default with strict json_schema.
- `TESTING.md`: hermetic unit tests through `adapters/mocks.ts`, plus one `*.it.test.ts` per data-backed workflow.
- `.claude/skills/frontend-architecture/references/devdigest.md`: component folder shape, `keys.ts` factories, no `features/`.
- Folded in from the coordinator:
  - researcher findings: reference caps, host allowlist, quarantined classifier, deterministic confidence, code-enforced downgrade, flash model;
  - the new user requirement: a first-class "changes-only" mode, template-body detection, a commits source, a UI label, and the listed tests.

## Scope
| Path | New / modify | Why |
|------|--------------|-----|
| `server/src/vendor/shared/contracts/brief.ts` + `client/src/vendor/shared/contracts/brief.ts` | modify (**coordinated, Step 0**) | Additive `IntentConfidence`, `IntentMode`, `IntentSource`, `MissingContext` schemas. `Intent` itself is unchanged because `PrBrief` composes it (`brief.ts:116`) |
| `server/src/vendor/shared/contracts/review-api.ts` + client copy | modify (**coordinated, Step 0**) | Additive nullish fields on `PrIntentRecord` (`review-api.ts:60`) and a new `PrIntentResponse` |
| `server/src/vendor/shared/contracts/trace.ts` + client copy | modify (**coordinated, Step 0**) | `PromptAssembly.intent: z.string().nullish()` (`trace.ts:39`) |
| `server/src/vendor/shared/contracts/platform.ts` + client copy | modify (**coordinated, Step 0**) | `review_intent` default: `openai/gpt-4.1` → `openrouter/deepseek/deepseek-v4-flash` (`platform.ts:52-57`) |
| `server/src/db/schema/reviews.ts` | modify | New `pr_intent` columns (`reviews.ts:48`) |
| `server/src/db/migrations/0013_intent_layer.sql` + `meta/*` | new (generated by `pnpm db:generate --name intent_layer`, never hand-edited) | Schema change |
| `reviewer-core/src/intent/types.ts` | new | Zod `IntentClassifierOutput` (LLM schema) and the `ReviewIntent` input type |
| `reviewer-core/src/intent/prompt.ts` | new | `buildIntentPrompt()`: classifier system and user messages, two modes, every block fenced |
| `reviewer-core/src/intent/classify.ts` | new | `classifyIntent()`: one `completeStructured` call, then clamping |
| `reviewer-core/src/review/scope.ts` | new | `ScopedReview` schema and the pure `applyScopeFilter()` |
| `reviewer-core/src/prompt.ts` | modify | Optional `intent` part, `SCOPE_RULE` when intent is present, `assembly.intent`. Export `INJECTION_GUARD` for internal reuse |
| `reviewer-core/src/review/run.ts` | modify | `ReviewInput.intent`; pick the scoped schema when intent is present; filter after grounding; `scopeFilter` stats on the outcome |
| `reviewer-core/src/index.ts` | modify | Export `classifyIntent`, `buildIntentPrompt`, `applyScopeFilter` and the types |
| `server/src/modules/intent/constants.ts` | new | Caps, allowlists, template-file candidates, generic commit words |
| `server/src/modules/intent/helpers.ts` | new | Pure helpers: body emptiness, reference extraction, hunk headers, file status, commit descriptiveness, confidence, staleness, filter decision, log-line formatting, URL redaction |
| `server/src/modules/intent/ports.ts` | new | Module-local port `RepoFileAtRef` |
| `server/src/modules/intent/deps.ts` | new | `IntentDeps`, the narrow deps interface |
| `server/src/modules/intent/repository.ts` | new | `IntentRepository`: owns `pr_intent` (`getForPull`, `upsertDerived`) |
| `server/src/modules/intent/service.ts` | new | `IntentService`: `get`, `derive`, `forReview`, with single-flight per PR |
| `server/src/modules/intent/routes.ts` | new | `GET /pulls/:id/intent`, `POST /pulls/:id/intent/derive` |
| `server/src/modules/index.ts` | modify | Register `intent` (`index.ts:26`) |
| `server/src/adapters/git/file-at-ref.ts` | new | `GitFileAtRefReader`: `git show <sha>:<path>` (argument array, no shell), size cap, timeout |
| `server/src/platform/container.ts` | modify | `repoFiles` getter + `ContainerOverrides.repoFiles`, an `intentService` getter, and `ReviewDeps.intent` wiring |
| `server/src/modules/reviews/deps.ts` | modify | Add `intent: (ws, prId, log) => Promise<ReviewIntent \| undefined>` (`deps.ts:13`) |
| `server/src/modules/reviews/run-executor.ts` | modify | Shared pre-work step "Resolving PR intent", passing intent to the engine, scope-filter log line |
| `server/src/modules/reviews/repository.ts`, `server/src/modules/reviews/repository/pull.repo.ts` | modify | Remove the unused `upsertIntent`/`getIntent` (`repository.ts:140,144`, `pull.repo.ts:49,64`); there are no callers (git grep). Ownership of `pr_intent` moves to the intent module |
| `client/src/lib/hooks/intent.ts` | new | `usePrIntent`, `useDeriveIntent` |
| `client/src/lib/hooks/keys.ts` | modify | `intentKeys.forPr(prId) = ["pr-intent", prId]` |
| `client/src/lib/hooks/reviews.ts` | modify | `useInvalidateAfterRun.all` also invalidates `intentKeys.forPr` (a run may auto-derive) |
| `client/src/lib/feature-models.ts` | modify | Mirror the new `review_intent` default (`feature-models.ts:21-27`) |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/{IntentCard.tsx,index.ts,helpers.ts,constants.ts,styles.ts}` | new | The Intent card (route-private, one user) |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` + `styles.ts` | modify | Two-column brief row at the top with `IntentCard`; widen the `pr` Pick with `id`, `head_sha` (`OverviewTab.tsx:10-21`) |
| `client/messages/en/intent.json` | new | The `intent` namespace (auto-loaded by `client/src/i18n/request.ts:16`) |
| `docs/agent-prompts/README.md` | modify | Document the new `## Stated intent` section, `SCOPE_RULE` and the filter |
| `server/docs/architecture.md`, `reviewer-core/docs/architecture.md` | modify | Add the intent module to the folder map, the intent step to the review-run flow, and the scope filter to the pipeline |

## Out of scope
- The Blast radius card. The brief row leaves its slot empty and the grid is ready for it.
- The RISK AREAS chip row: deferred. No column, no schema field.
- Jira, Linear and other ticket systems that need auth. Their URLs are recorded as `missing_context` (`host_not_allowlisted`).
- GitHub GraphQL `closingIssuesReferences`. It needs a new `GitHubClient` port method in `vendor/shared/adapters.ts:143`. Not needed (user decision 2026-11-27). v1 uses regex plus the existing `getIssue` (`adapters.ts:164`).
- Persisting GitHub's per-file `status` / `previous_filename` (not needed, user decision 2026-11-27).
- A new e2e flow. The feature needs an LLM, and e2e runs with no model key (`TESTING.md`).
- Running architecture review, security review, doc-writer, plan-verifier and `/pr-self-review` inside implementer. They are separate pipeline stages (see *Agent pipeline*).
- Applying the migration (`pnpm db:migrate`) without explicit user approval.

## UI & API map

**Overview tab, top row (2 columns; the Blast radius slot is out of scope):**
```
┌─ INTENT ──────────────────────────── [● HIGH confidence] [↻ Re-derive] ┐  ┌ (Blast radius —     ┐
│ "Add rate limiting to the public comments endpoint so that             │  │  separate feature,  │
│  spam bursts are rejected with 429."                         (italic)  │  │  slot left empty)   │
│                                                                        │  └─────────────────────┘
│ IN SCOPE                         │ OUT OF SCOPE                        │
│ ✓ comments route rate limit      │ ✗ auth changes                      │
│ ✓ 429 error body                 │ ✗ UI for comments                   │
│                                                                        │
│ Sources: title · description · issue #42 · docs/plans/rl.md · 12 files │
│          · 31 hunks · 4 commits            model: deepseek-v4-flash    │
└────────────────────────────────────────────────────────────────────────┘
```
States of the same card (one region, `aria-live="polite"`):
```
NOT DERIVED  │ INTENT                                         [Derive intent]
             │ No intent yet. It is derived automatically when a review starts.
DERIVING     │ INTENT                                     [⟳ Deriving… (disabled)]
             │ ░░░░░░░░░░ reading title, description, linked issues, files…
LOW CONF.    │ INTENT                           [● LOW confidence] [↻ Re-derive]
             │ "…summary…"   (columns as above)
             │ ⓘ Low confidence: out-of-scope filtering is off for reviews.
INFERRED     │ INTENT    [Inferred from changes] [● LOW confidence] [↻ Re-derive]
             │ ⚠ Inferred from changes, no author description. Check that this matches the PR.
             │ "…summary…"   Sources: title · 12 files · 31 hunks · 4 commits
STALE        │ INTENT   [STALE] [● MEDIUM confidence]               [↻ Re-derive]
             │ ⚠ Derived at a1b2c3d, PR head is now f00ba12. Re-derive to update.
             │   Reviews use it for context only (no filtering) until re-derived.
MISSING CTX  │ … card as derived …
             │ ⚠ Missing context (confidence lowered):
             │   • https://linear.app/acme/issue/ACM-12 — host not allowlisted
             │   • #77 — not found or no access
             │   • docs/plans/old.md — not present at head
ERROR        │ INTENT                                                [Retry]
             │ ✗ Could not derive intent: <error message from API>
```

**Settings → Feature Models (existing picker, `SettingsModels.tsx:39`; only the default changes):**
```
PR Review · Intent   [using default]
Derives a PR's intent and scope before review.
[ deepseek/deepseek-v4-flash            ▾ ]   ← searchable OpenRouter list, live prices
```

| Method | Route | What it does, in plain words |
|--------|-------|------------------------------|
| GET | `/pulls/:id/intent` | Returns the stored intent of this PR (or `null`), the PR's current head SHA and whether the intent is stale. It makes no LLM call. Response: `PrIntentResponse`. |
| POST | `/pulls/:id/intent/derive` | Collects the sources now (title, description, issues, docs, commits, files and hunk headers), calls the cheap intent model once, saves the result and returns it. Body: none. It is rate-limited to 10/min. If a derive for this PR is already running, it waits for that one instead of paying twice. Response: `PrIntentResponse`. Errors: 404 for an unknown PR, 500 `config_error` when the provider key is missing (`errors.ts:37`), 502 `external_service_error` when the model fails (`errors.ts:31`). |

## Data sources

| Source | How it's obtained | Caps | On failure |
|--------|-------------------|------|------------|
| PR title, body, files (+ `patch`), commits, head SHA | `PullsService.detail(ws, prId)` (`pulls/service.ts:86`), injected as a function. It is TTL-gated, refreshes from GitHub at most once per TTL and serves persisted rows offline (`:205`). Commits come from `pr_commits` (`pulls/repository.ts:158`) | title 300 chars; body 10,000 chars | Offline uses persisted rows. A missing PR gives a 404 |
| "No description" decision | Pure `isEffectivelyEmptyBody(body, templateText?)`. True when the body is null or whitespace-only, OR when fewer than `MIN_AUTHOR_CHARS` (= 40) non-whitespace chars remain after stripping: HTML comments `<!-- … -->`, markdown heading lines (`^#{1,6}\s`), checklist lines `^\s*[-*] \[[ xX]\]`, horizontal rules, label-only lines (`^\s*\**[\w /-]{1,40}\**:?\s*$`), placeholder lines (`^\s*(n\/a\|none\|tbd\|todo\|-)\s*$`i), and every line identical (trimmed) to a line of the repo's PR template | — | — |
| PR template (for the rule above) | `RepoFileAtRef.read(repo, headSha, path)` probing the fixed GitHub locations `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/pull_request_template.md`, `pull_request_template.md`. Same probing pattern as the conventions extractor (`conventions/constants.ts:15`) | 10,000 chars; 10 s | A missing template is not an error. The generic stripping rules still apply. Not recorded as missing context |
| Linked issues / tickets | Pure `extractReferences(title, body, repo)`, which finds: closing keywords `(close[sd]?\|fix(e[sd])?\|resolve[sd]?)\s+#N`; bare `#N`; `owner/repo#N`; `https://github.com/<o>/<r>/(issues\|pull)/N`. Order: closing keywords first, de-duplicated. Fetched with `GitHubClient.getIssue` (`adapters.ts:164`, implemented at `octokit.ts:351`, timeout and retry included) | max **3** issues; 10,000 chars per issue body; 10 s | Recorded as `missing_context { ref: "#77", reason: "not_found" \| "unreachable" \| "no_token" \| "timeout" }`, and the derive continues. The existing first-match regex at `octokit.ts:127` (resolveLinkedIssue) is NOT reused. It takes only the first `#N` |
| Plan / spec docs | Repo-relative links in the body (`[x](docs/plans/a.md)`, `./specs/b.md`, bare `docs/…md`) and same-repo blob URLs `https://github.com/<o>/<r>/blob/<ref>/<path>`. These are always read **at the PR head SHA** via `RepoFileAtRef` (`git show <sha>:<path>`). Path allowlist: normalized, no `..`, not absolute, and matching `^([\w.-]+/)?(docs\|specs)/[\w./-]+\.md$` | max **3** docs; 10,000 chars each (truncation flagged); 10 s | `missing_context { ref: path, reason: "not_present_at_head" \| "path_not_allowlisted" \| "too_large" \| "timeout" }`. The clone may lack the head; the service calls `git.fetchPullHead` (`adapters.ts:207`) once, best-effort, before reading |
| External URLs (any other host, non-https, other repos' blobs) | **Never fetched.** Extracted and recorded only. This removes the SSRF surface entirely: the only network targets are `api.github.com` through Octokit and the local clone | max 10 recorded | `missing_context { ref: redactedUrl, reason: "host_not_allowlisted" }`. The query string and fragment are stripped before storing or logging |
| Changed files + status + ±lines | From `PrDetail.files` (`platform.ts:194` PrFile). Status comes from a pure `fileStatus(patch, additions, deletions)`: patch starts `@@ -0,0 ` → added; `+0,0 @@` → deleted; otherwise modified; no patch → `unknown` (binary or huge) | max **150** files, sorted by additions+deletions desc; remainder summarized as "+N more files" | — |
| Hunk headers (incl. function/class context) | Pure `hunkHeaders(patch)`: the lines matching `^@@ [^@]+ @@.*$` from `PrFile.patch`. GitHub patches carry the git funcname context. Hunk bodies are discarded right away | max **5** per file, 160 chars each; total block ≤ 6,000 chars | — |
| Small-PR added-lines excerpt (**changes-only mode only**) | Only when `mode === 'inferred_from_changes'` AND the PR's total changed lines (Σ additions + deletions over all files) is **< 50**. Pure `addedLinesExcerpt(files)`: walks `PrFile.patch` in file order and takes lines starting with `+` (excluding the `+++` header), stripping the `+`, until **40** lines total; each line truncated to 200 chars. Removed lines and context lines are never included. Lines matching an obvious-secret pattern (`/(api[_-]?key\|secret\|token\|password)\s*[:=]/i`, PEM headers) are replaced by `[redacted]` | ≤ 40 lines, ≤ 200 chars each | Skipped when no patch (binary). Recorded in `sources` as `{ kind: 'added_lines', ref: 'N lines', chars, truncated }` |
| Commit messages | `PrDetail.commits` (`platform.ts:220`). Subject line plus the first 300 chars of the body; merge commits (`^Merge (branch\|pull request)`) are skipped | max **20** commits | — |

## Call sequence

Decision: intent is derived **automatically at review start only if absent**. It is **never re-derived automatically when stale**: the user clicks Re-derive. A stale intent is still injected as context, but filtering is off. A per-PR in-memory single-flight `Map<prId, Promise>` in `IntentService` stops a review and a concurrent Re-derive from paying twice. The same pattern as `detailRefreshedAt`, `pulls/service.ts:42`.

```mermaid
sequenceDiagram
  participant U as User / client
  participant R as intent routes
  participant EX as ReviewRunExecutor
  participant IS as IntentService
  participant SRC as sources (PullsService.detail, GitHub getIssue, RepoFileAtRef)
  participant RC as reviewer-core
  participant LLM as OpenRouter flash model
  participant DB as Postgres pr_intent
  alt explicit
    U->>R: POST /pulls/:id/intent/derive
    R->>IS: derive(ws, prId)
  else review start
    U->>EX: POST /pulls/:id/review (background)
    EX->>IS: forReview(ws, prId)
    IS->>DB: getForPull(prId)
    Note over IS: fresh → reuse; stale → reuse, filter off; absent → derive
  end
  IS->>SRC: detail, template probe, issues ≤3, docs ≤3 (caps, 10 s each)
  SRC-->>IS: texts + missing_context[]
  IS->>RC: classifyIntent(mode, fenced sources, model)
  RC->>LLM: completeStructured(IntentClassifierOutput, strict)
  LLM-->>RC: summary, in_scope[], out_of_scope[]
  RC-->>IS: clamped output + tokens + cost
  Note over IS: confidence + mode computed in code
  IS->>DB: upsertDerived(...)
  IS-->>EX: ReviewIntent {..., filter: on|off}
  EX->>RC: reviewPullRequest(..., intent)
  RC->>LLM: review prompt + "## Stated intent (unverified)" + SCOPE_RULE
  LLM-->>RC: findings with scope in|out
  RC->>RC: groundFindings (unchanged) → applyScopeFilter → score
  RC-->>EX: review + scopeFilter stats
  EX->>DB: findings, run trace (prompt_assembly.intent)
```

## Schema changes
`pr_intent` (`server/src/db/schema/reviews.ts:48`). The table has no rows in practice, because there are no writers today (git grep). Additive columns, all with non-volatile defaults:

| Column | Drizzle / PG type | Default | Notes |
|--------|-------------------|---------|-------|
| `intent`, `in_scope`, `out_of_scope` | existing | existing | `intent` keeps holding the summary (contract field name `intent`, `brief.ts:10`) |
| `mode` | `text('mode', { enum: ['author_description','inferred_from_changes'] })` NOT NULL | `'author_description'` | must equal the contract enum (server INSIGHTS: response serialization) |
| `confidence` | `text('confidence', { enum: ['high','medium','low'] })` NOT NULL | `'low'` | |
| `sources` | `jsonb.$type<IntentSource[]>()` NOT NULL | `'[]'::jsonb` | `{ kind, ref, chars, truncated }`, no content |
| `missing_context` | `jsonb.$type<MissingContext[]>()` NOT NULL | `'[]'::jsonb` | `{ ref, reason }` |
| `provider` / `model` | `text` NULL | — | |
| `head_sha` | `text` NULL | — | the SHA the intent was derived at; staleness = `head_sha !== pull_requests.head_sha` |
| `derived_at` | `timestamp('derived_at', { withTimezone: true })` NOT NULL | `now()` (via `./_shared` `now()` helper, as `reviews.ts:25`) | |
| `tokens_in`, `tokens_out` | `integer` NULL | — | |
| `cost_usd` | `doublePrecision` NULL | — | the same "no data = null" rule as runs (server INSIGHTS 2026-11-20) |

There is no new index: the access path is the PK `pr_id`. Migration: `cd server && pnpm db:generate --name intent_layer` → `0013_intent_layer.sql`. Applying it (`pnpm db:migrate`) needs **explicit user approval**.

## Contract changes (Step 0: coordinated, additive, both `vendor/shared` copies)
```ts
// brief.ts (append; Intent unchanged)
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export const IntentMode = z.enum(['author_description', 'inferred_from_changes']);
export const IntentSourceKind = z.enum(['title', 'body', 'issue', 'doc', 'files', 'hunks', 'commits', 'added_lines']);
export const IntentSource = z.object({ kind: IntentSourceKind, ref: z.string(), chars: z.number().int(), truncated: z.boolean() });
export const MissingContextReason = z.enum(['not_found','unreachable','no_token','timeout','not_present_at_head','path_not_allowlisted','too_large','host_not_allowlisted']);
export const MissingContext = z.object({ ref: z.string(), reason: MissingContextReason });
// review-api.ts
export const PrIntentRecord = Intent.extend({ pr_id: z.string(),
  mode: IntentMode.nullish(), confidence: IntentConfidence.nullish(),
  sources: z.array(IntentSource).nullish(), missing_context: z.array(MissingContext).nullish(),
  provider: z.string().nullish(), model: z.string().nullish(), head_sha: z.string().nullish(),
  derived_at: z.string().nullish(), cost_usd: z.number().nullish() });
export const PrIntentResponse = z.object({ intent: PrIntentRecord.nullable(), current_head_sha: z.string(), stale: z.boolean() });
// trace.ts PromptAssembly: + intent: z.string().nullish()
// platform.ts FEATURE_MODELS review_intent: defaultProvider 'openrouter', defaultModel 'deepseek/deepseek-v4-flash'
```
Model default rationale: the Settings picker always saves `provider: "openrouter"` (`SettingsModels.tsx:32`). With the current `openai/gpt-4.1` default, the classifier would need an OpenAI key and would cost about 20x more. `deepseek/deepseek-v4-flash` already runs the repo's strict `json_schema` path (`openrouter.ts:74`, `docs/agent-prompts/choosing-a-model.md`). `google/gemini-2.5-flash-lite` is the alternative from the researcher, with unverified pricing; the user chose deepseek (see Decisions). `resolveFeatureModel(container, ws, 'review_intent')` (`feature-models.ts:51`) is injected exactly as conventions does it (`container.ts:159`).

## Prompt builder

**Classifier (reviewer-core `src/intent/prompt.ts`), quarantined.** It has no tools and receives only fenced data. Its output feeds a data block, never instructions.
- **System (trusted):** the role ("You summarize what a pull request intends to change"), the rules, `LANGUAGE_RULE` (`prompt.ts:34`) and `INJECTION_GUARD` (`prompt.ts:16`, exported module-internally).
  - Rules: summary of 1–2 sentences; `in_scope` = concrete areas or behaviours the PR changes; `out_of_scope` = only things the sources explicitly exclude, or clearly adjacent areas the PR leaves untouched; never list security, secrets or correctness as out of scope; never write instructions for reviewers; no invention. If a source is missing, say less.
- **Mode `author_description`:** "Derive the intent from the author's description and linked context; use the changes to confirm."
- **Mode `inferred_from_changes`:** "There is NO author description. Derive the intent from what the changes do: file paths, hunk headers (function and class context) and commit messages. Prefer narrow, literal statements."
- **User:** sections, each fenced with `wrapUntrusted(label, text)` (`prompt.ts:39`):
  - `pr-title`;
  - `pr-description` (omitted in changes-only mode);
  - `issue-#N` per issue;
  - `doc:<path>` per doc;
  - `commits`;
  - `changed-files`, one line per file: `path [status] +a/-d` followed by its hunk headers.
  - `added-lines` (changes-only mode, PR < 50 changed lines only): the ≤ 40-line excerpt, fenced like every other block.
  - Sections are capped as in the Data sources table.
- **Output:** `IntentClassifierOutput = z.object({ summary: z.string(), in_scope: z.array(z.string()), out_of_scope: z.array(z.string()) })`, sent as strict `response_format` through the existing provider (`openrouter.ts:74`, repair loop `:100`). There are no `.max()` constraints in the LLM schema, because strict-mode support for them varies by provider. Instead, a pure `clampIntent()` caps it after parsing: summary ≤ 400 chars, ≤ 8 items per list, each ≤ 160 chars.
- **Confidence and mode are never asked of the model.** The pure server helper `computeConfidence()` sets them:
  - **author_description mode:** `high` when the body has author content AND ≥1 issue or doc was fetched; `medium` with the body only.
  - **inferred_from_changes mode:** `low` by default. `medium` only if ≥1 non-merge commit subject has ≥4 words and ≥20 chars and does not start with a generic word (`wip|fix|fixes|update|updates|change|changes|tmp|misc|cleanup|fixup!|squash!`). Justification: a descriptive commit subject is an author statement of purpose, comparable to a short description.
  - **Caps:** any `missing_context` entry caps at `medium` (author mode) or forces `low` (changes-only mode). An empty `in_scope` after clamping forces `low`.

**Reviewer-prompt intent section (`reviewer-core/src/prompt.ts`):**
- The new optional `PromptParts.intent?: string` is rendered right after `## PR description` as
  `## Stated intent (unverified author claims; derived, may be wrong)\n${wrapUntrusted('intent', text)}`.
  The text lists mode, confidence, summary, IN SCOPE and OUT OF SCOPE. Stale intents get a "(stale: derived at <sha7>)" line.
- When `intent` is present, `SCOPE_RULE` (trusted) is appended to the system message after `INJECTION_GUARD`: "For every finding set `scope` to `out` only if it concerns an area the stated intent explicitly lists as out of scope or that the PR does not touch; otherwise `in`. Scope never changes severity: report every real defect with its true severity."
- `assembly.intent` is the rendered section. When `intent` is absent, the system and user text are **byte-identical** to today's, so the existing prompt tests stay green.

**Scope tagging and filter (reviewer-core, not the server):**
- **Why the engine:** the CI runner gets the same rule, the filter has to run after the mandatory grounding gate, and it is pure.
- **Tagging:** when intent is present, `run.ts:174` uses `ScopedReview` instead of `ReviewSchema`. `ScopedReview` is `Review` with `findings: Finding.extend({ scope: z.enum(['in','out']).describe(...) })`, defined locally in `review/scope.ts`, so there is no change to the shared `Finding` contract (`findings.ts:47`). `reduceReviews` (`reduce.ts:43`) concatenates as before.
- **Order:** `groundFindings` (`run.ts:197`, unchanged) → `applyScopeFilter(kept, { enabled })` → `scoreFromFindings` (`reduce.ts:27`) → strip `scope`.
- **Rule** (enabled only when the server passes `filter: true`, see the decision below):
  - `scope: 'in'` → keep.
  - `scope: 'out'` and *serious* (`severity === 'CRITICAL'` OR `category === 'security'` OR `kind ∈ {secret_leak, lethal_trifecta}`) → keep **exactly one** finding: the top one by severity, then confidence, then file and line. If there are others, append to its rationale "Also out of the stated scope: <title> (<file>:<line>) …", so nothing vanishes silently.
  - `scope: 'out'` and not serious → dropped and counted.
- **Outcome:** `scopeFilter: { applied, dropped, collapsed, keptSerious }`. The model's tag is used rather than a file-based heuristic, because `in_scope` is prose, not globs. The model can only *tag*; code decides, and a tag can never remove a serious signal.
- **Filter decision (server, pure `shouldFilterByScope`):** on only when `mode === 'author_description'` AND `confidence ∈ {high, medium}` AND the intent is not stale. In changes-only mode it is always off, because an intent inferred from the same diff makes "out of scope" circular. Low confidence, stale, or no intent → off. The intent is still injected as context.

## Logging / observability
- **Live log + pino**, once per `executeRuns` in the shared pre-work (fanned out like the diff step, `run-executor.ts:96-106`). Format:
  - derived: `intent: derived via openrouter/deepseek/deepseek-v4-flash [author_description, confidence=medium] — sources: title(54) body(1820) issue#42(2400) doc:docs/plans/rl.md(10000,truncated) files(12) hunks(31) commits(4) · missing: 1 · ~3,400 tok est · in 3,512 / out 140 tok`
  - reused: `intent: reused (derived at a1b2c3d, confidence=high) — 3 in / 2 out of scope`
  - stale: `intent: stale (derived at a1b2c3d, head f00ba12) — context only, scope filter off`
  - failure: `intent: unavailable (<error message>) — reviewing without intent`
  - after the engine: `scope filter: 2 out-of-scope finding(s) dropped, 1 serious kept (CRITICAL security src/x.ts:12)` or `scope filter: off (low confidence | stale | inferred_from_changes | no intent)`
- **pino object** (`logger.info({...}, 'intent: derived')`): `{ prId, headSha, mode, confidence, provider, model, sources: [{kind, ref, chars, truncated}], missing: [{ref, reason}], tokensEst, tokensIn, tokensOut, costUsd, durationMs }`. `tokensEst` reuses `estimateTokens` (`skills/helpers.ts:116`) over the assembled user message.
- **Stored:**
  - the `pr_intent` columns above;
  - `run_traces.prompt_assembly.intent` = the rendered intent section;
  - the scope-filter line in the run log, persisted with the trace (`run-executor.ts:293`).
- **Redaction rules** (pure `redactRef`, applied before logging and storing):
  - never log body, issue or doc text, hunk header text, commit messages or the added-lines excerpt: only kinds, refs and char counts (the excerpt appears as `added_lines(N lines)`);
  - strip URL query and fragment;
  - never log tokens or keys; secrets stay behind `SecretsProvider` (`server/AGENTS.md`);
  - the LLM's raw output is not logged; the persisted record holds only the clamped fields.

## Constraints
- Every `vendor/shared` edit is additive and nullish, made in both copies, and executed as **Step 0 by the main session or user with coordination**. The implementer may not edit `vendor/shared` — source: `.claude/agents/implementer.md` (Hard rule 2), `server/AGENTS.md` (Do-not-touch), `client/AGENTS.md`.
- Migration via `pnpm db:generate --name intent_layer` only, never hand-edited; `db:migrate` needs user approval — source: `AGENTS.md` (Do-not-touch), `server/AGENTS.md` (Gotchas), implementer Hard rule 3.
- Only repositories import `drizzle-orm` / `db/schema`. `IntentRepository` owns `pr_intent`; every read and write is scoped through the PR's workspace (the service checks `getPull(ws, prId)` first, like `pull.repo.ts:9`) — skill `onion-architecture` §2.2, `drizzle-orm-patterns`.
- `IntentService` takes `IntentDeps` and never the Container or another module's repository. It receives `pullDetail`, `getPullRef`, `github`, `git.fetchPullHead`, `repoFiles`, `model`, `llm`, `now`, `log` as functions or ports — skill `onion-architecture` §3 DI, `server/INSIGHTS.md` 2026-11-24.
- Routes: Zod contract in `schema` (`IdParams`, `_shared/schemas.ts:11`; `PrIntentResponse` as the 200 response), `getContext`, one service call, no try/catch. Errors are `AppError` subclasses (`errors.ts:19,31,37`). Derive gets a per-route `rateLimit` like `reviews/routes.ts:30` — skill `fastify-best-practices`, `onion-architecture` §3.
- A new external capability (read at ref) goes behind the module port `intent/ports.ts`, with the adapter in `adapters/git/`, a Container getter and a `ContainerOverrides.repoFiles`. It is not added to `vendor/shared/adapters.ts`, because only one module uses it — skill `onion-architecture` references/adapters.md ("Port used by one module only").
- The read-at-ref adapter runs:
  - `git show <sha>:<path>` through simple-git `raw([...])` (argument array, no shell);
  - with `sha` validated `/^[0-9a-f]{7,40}$/` and the path validated against the allowlist and for `..` in the pure helper AND again in the adapter;
  - with a size cap and a timeout.
  - The same defence-in-depth intent as `simple-git.ts:267` readFile — skill `security` (A05 command injection, path traversal).
- No arbitrary URL is ever fetched (SSRF eliminated by design) — skill `security`, researcher finding 2.
- reviewer-core stays pure: the classifier and filter use only the injected `LLMProvider`. Every untrusted block goes through `wrapUntrusted`. `groundFindings` runs before the filter and is never skipped — `reviewer-core/AGENTS.md`, `reviewer-core/docs/architecture.md` (Invariants).
- Intent can never suppress a security or CRITICAL finding (one serious signal is always kept). The reviewer is never instructed to ignore findings: filtering is code — `prompt.ts:16` (INJECTION_GUARD), researcher finding 3.
- No JSON shape in the prompt prose; field meaning goes in `.describe()` — `docs/agent-prompts/README.md` ("The output schema is NOT in the prompt").
- ESM relative imports keep `.js` — `AGENTS.md` (Conventions).
- `process.env` is never read in modules; caps live in `intent/constants.ts` — skill `onion-architecture` §5.
- Client:
  - data only through `lib/hooks/intent.ts` over `api` (`client/src/lib/api.ts:65`);
  - keys only from `keys.ts`;
  - no `fetch` or URL building in components;
  - strings in `messages/en/intent.json`;
  - `IntentCard` placed route-private under `OverviewTab/_components/` (one user);
  - pure view-state mapping in `IntentCard/helpers.ts`;
  - styles in `styles.ts` with `satisfies CSSProperties`;
  - no `{count && …}`, an `aria-label` on the icon-only button, `aria-live="polite"` on the status region.
  - Sources: `client/AGENTS.md`, skill `frontend-architecture` §1, §6, §7 + `references/devdigest.md`, skill `react-best-practices` (Conditional Rendering, Accessibility, Derive don't store).
- Contract enum values are not redeclared in UI code (confidence/mode tones are keyed by the contract type) — `references/devdigest.md` (layout mapping, "Never redeclare contract types").
- The `FEATURE_MODELS` client mirror stays in sync with the shared registry — `client/src/lib/feature-models.ts:3-12`.
- A doc change gets a README row only if it is a new doc (no new docs planned; existing ones are edited) — `AGENTS.md` (Session protocol).

## Skills for implementer
| Skill | Applies? | Files it governs | Key rules for this change / reason not applicable |
|-------|----------|------------------|----------------------------------------------------|
| `onion-architecture` | yes | `server/src/modules/intent/**`, `reviews/{deps,run-executor,repository}.ts`, `platform/container.ts`, `adapters/git/file-at-ref.ts`, `reviewer-core/src/**`, server tests | Pure helpers in `helpers.ts`; repository is the only Drizzle user; narrow `IntentDeps`; module-local `ports.ts`; Container getter + override; reviewer-core never imports server; thin routes; `pnpm lint` |
| `fastify-best-practices` | yes | `intent/routes.ts`, `modules/index.ts`, `platform/container.ts` | Zod type provider, `schema.params`/`response`, per-route `rateLimit`, errors via the global handler (`app.ts:129`) |
| `drizzle-orm-patterns` | yes | `intent/repository.ts`, `db/schema/reviews.ts`, migration generation | `onConflictDoUpdate` on `prIntent.prId` (as `pull.repo.ts:58`), `$type<>()` jsonb, generate (never push or hand-edit) |
| `postgresql-table-design` | yes | `db/schema/reviews.ts` | `timestamptz`, `text` + enum (not PG ENUM), jsonb NOT NULL default `'[]'`, non-volatile defaults, no extra index (PK access) |
| `zod` | yes | `reviewer-core/src/intent/types.ts`, `review/scope.ts`, `intent/routes.ts`, `client/src/lib/hooks/intent.ts` | `z.infer` types; enums for fixed sets; `.nullish()` for additive contract fields; parse once at the edge; LLM schema without `.max()`, clamped in code |
| `typescript-expert` | yes (preloaded) | every `.ts`/`.tsx` touched | Strict types, no `any`, exhaustive switch on the mode/confidence/view-state unions, `as const` + `satisfies` |
| `frontend-architecture` | yes | `client/src/lib/hooks/{intent,keys,reviews}.ts`, `OverviewTab/**`, `lib/feature-models.ts` | Route-private `_components/IntentCard/` folder shape; hooks + keys in `lib/hooks`; helpers pure; no inline keys or URLs; narrow `index.ts` |
| `react-best-practices` | yes | `IntentCard.tsx`, `OverviewTab.tsx`, `lib/hooks/intent.ts` | Derive the view state during render (no `useState` mirror of query data), early returns per state, stable keys (`ref`), a11y labels, no render factories, ≤200 lines |
| `next-best-practices` | yes | `client/src/app/repos/[repoId]/pulls/[number]/_components/**` | `"use client"` only on the leaf `IntentCard` (OverviewTab already client); no Route Handlers or Server Actions for Fastify-owned data |
| `react-testing-library` | yes (for test-writer) | `IntentCard.test.tsx`, hook tests | userEvent, role queries, mock `fetch`, pass the `intent` messages to `NextIntlClientProvider` |
| `security` | yes | `intent/helpers.ts` (reference extraction, path allowlist, redaction), `adapters/git/file-at-ref.ts`, `intent/routes.ts`, classifier prompt | No shell; validate sha and path; never fetch external URLs; size/time caps; rate-limit derive; redact URLs; no secrets in logs; untrusted text fenced; intent never descopes security |
| `mermaid-diagram` | yes (docs only) | `server/docs/architecture.md` review-run sequence (add the intent step) | Keep under ~20 nodes; labelled arrows |
| `engineering-insights` | implementer, at the end | `server/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`, `client/INSIGHTS.md` | Not invoked by planner. Likely candidates: `pr_intent` ownership moved; the filter-decision rule |
| `pr-self-review` | no | — | User-only (`disable-model-invocation`); hand off to the user before any PR |

## Steps
0. **Coordinated contract edits (main session / user, NOT implementer)**
   - Files: `{server,client}/src/vendor/shared/contracts/{brief,review-api,trace,platform}.ts`
   - Change: exactly the additive snippets under *Contract changes*, identical in both copies (CRLF-safe edits, server INSIGHTS 2026-11-20).
   - Acceptance: `git diff` shows only additions, plus the 2-line default change in `platform.ts`. `PrBrief` is untouched.
   - Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/contracts.test.ts` · `cd client && pnpm typecheck` · `cd reviewer-core && pnpm typecheck`
1. **Schema + migration**
   - Files: `server/src/db/schema/reviews.ts`; generated `server/src/db/migrations/0013_intent_layer.sql` + meta
   - Change: add the columns in *Schema changes*; run `cd server && pnpm db:generate --name intent_layer`. Do **not** run `db:migrate` unless the user approves it in this session.
   - Acceptance: the SQL has only `ALTER TABLE "pr_intent" ADD COLUMN …` statements.
   - Verify: `cd server && pnpm typecheck`
2. **reviewer-core: classifier**
   - Files: `reviewer-core/src/intent/{types,prompt,classify}.ts`, `src/prompt.ts` (export `INJECTION_GUARD` from the module; do not add it to `index.ts`), `src/index.ts`
   - Change: `IntentClassifierOutput`, a `buildIntentPrompt({ mode, title, body?, issues[], docs[], commits[], files[] })` returning `ChatMessage[]`, a `classifyIntent({ llm, model, sessionId?, prompt })` returning the clamped output with `tokensIn/out`, `costUsd`, `raw`, and a pure `clampIntent`.
   - Acceptance: `inferred_from_changes` messages contain no `pr-description` block and do contain the "derive the intent from what the changes do" instruction. Every source sits inside `<untrusted source=…>`.
   - Verify: `cd reviewer-core && pnpm exec vitest run test/prompt.test.ts test/structured.test.ts` · `pnpm typecheck`
3. **reviewer-core: intent section, scope tagging and filter**
   - Files: `src/prompt.ts`, `src/review/scope.ts` (new), `src/review/run.ts`, `src/index.ts`
   - Change:
     - `PromptParts.intent` and `SCOPE_RULE`;
     - `PromptAssembly.intent`;
     - `ReviewInput.intent?: { text: string; filter: boolean }`;
     - the scoped schema when intent is present;
     - `applyScopeFilter` after `groundFindings`;
     - score from the filtered list; strip `scope`;
     - `ReviewOutcome.scopeFilter`;
     - emit a `scope filter:` event.
   - Acceptance: with no `intent`, the assembled messages are byte-identical to before. Grounding still runs first.
   - Verify: `cd reviewer-core && pnpm exec vitest run test/run.test.ts test/prompt.test.ts test/reduce.test.ts` · `pnpm typecheck` · `cd ../server && pnpm exec vitest run test/prompt-structured.test.ts test/prompt-callers.test.ts`
4. **server intent domain helpers + constants**
   - Files: `server/src/modules/intent/{constants,helpers}.ts`
   - Change: `isEffectivelyEmptyBody`, `extractReferences`, `isAllowlistedDocPath`, `hunkHeaders`, `fileStatus`, `addedLinesExcerpt`, `isDescriptiveCommit`, `computeConfidence`, `isStale`, `shouldFilterByScope`, `renderIntentSection`, `formatIntentLogLine`, `redactRef`. All pure, with no I/O and no `Date.now()` (a clock is injected).
   - Acceptance: compiles; `pnpm lint` passes the domain-ring rules.
   - Verify: `cd server && pnpm typecheck && pnpm lint`
5. **Port + adapter + Container**
   - Files: `intent/ports.ts`, `adapters/git/file-at-ref.ts`, `platform/container.ts`
   - Change:
     - `RepoFileAtRef { read(repo, sha, path): Promise<string> }`;
     - `GitFileAtRefReader(clonePathFor)` using simple-git `raw(['show', `${sha}:${path}`])` with a 10 s timeout and a 100 KB cap, rejecting invalid sha or path;
     - the `repoFiles` getter and `ContainerOverrides.repoFiles`.
   - Acceptance: existing container tests are unaffected.
   - Verify: `cd server && pnpm exec vitest run test/routes-smoke.test.ts test/adapters.test.ts` · `pnpm typecheck`
6. **IntentRepository; remove the dead intent methods from reviews**
   - Files: `intent/repository.ts`, `reviews/repository.ts`, `reviews/repository/pull.repo.ts`
   - Change: `getForPull(prId)` and `upsertDerived(prId, record)` (onConflictDoUpdate on the PK; map to the `PrIntentRecord` DTO). Delete `upsertIntent`/`getIntent` and the now-unused `Intent` import.
   - Acceptance: `git grep upsertIntent` returns nothing in `server/src`.
   - Verify: `cd server && pnpm typecheck && pnpm lint`
7. **IntentService**
   - Files: `intent/{deps,service}.ts`, `platform/container.ts` (`intentService` getter)
   - Change:
     - `get(ws, prId)` → `PrIntentResponse`.
     - `derive(ws, prId, log?)`, single-flight per prId:
       1. pull detail;
       2. best-effort `fetchPullHead`;
       3. template probe → mode;
       4. references (≤3 issues, ≤3 docs, each 10 s, failures go to `missing_context`);
       5. files, hunks, commits;
       6. `classifyIntent` with `model(ws)` and `llm(provider)`;
       7. `computeConfidence`;
       8. upsert;
       9. structured log;
       10. errors mapped to `ExternalServiceError` / `ConfigError`.
     - `forReview(ws, prId, log)` → `{ text, filter, record, outcome: 'reused'|'derived'|'stale' } | undefined`, best-effort (never throws).
     - Container wiring: `pullDetail: (ws,id) => this.pullsService.detail(ws,id)`, `getPullRef` via `reviewRepo.getPull`/`getRepo`, `github: () => this.github()`, `model: (ws) => resolveFeatureModel(this, ws, 'review_intent')`.
   - Acceptance: no `fastify`, `drizzle-orm` or Container import in the service (`pnpm lint`).
   - Verify: `cd server && pnpm typecheck && pnpm lint`
8. **Routes + registration**
   - Files: `intent/routes.ts`, `modules/index.ts`
   - Change: the two routes in the API table (derive rate limit `{ max: 10, timeWindow: '1 minute' }`), one service call each.
   - Acceptance: `GET` on an unknown uuid gives 404; a non-uuid id gives 422.
   - Verify: `cd server && pnpm exec vitest run test/routes-smoke.test.ts` · `pnpm typecheck` · `pnpm lint`
9. **Review executor integration**
   - Files: `reviews/deps.ts`, `reviews/run-executor.ts`, `platform/container.ts`
   - Change:
     - `ReviewDeps.intent = (ws, prId, log) => this.intentService.forReview(ws, prId, log)`;
     - after "Diff ready" (`run-executor.ts:106`): `runLog.step('Resolving PR intent', …)` once for all jobs, logging the intent line;
     - pass `intent` into `reviewPullRequest` (`:196`);
     - log the `scope filter:` line from `outcome.scopeFilter`.
     - An intent failure never fails the run.
   - Acceptance: `prompt_assembly.intent` is populated in the trace when intent exists, and null otherwise.
   - Verify: `cd server && pnpm exec vitest run test/reviews-helpers.test.ts test/run-cost.test.ts` · `pnpm typecheck` (plus `pnpm exec vitest run test/reviews.it.test.ts` with Docker)
10. **Client data layer + model default mirror**
    - Files: `client/src/lib/hooks/{intent,keys,reviews}.ts`, `client/src/lib/feature-models.ts`
    - Change:
      - `intentKeys`;
      - `usePrIntent(prId)` → `GET /pulls/:id/intent`;
      - `useDeriveIntent(prId)` → `POST …/derive`, with `onSuccess` calling `setQueryData(intentKeys.forPr)`, and `notify` on error (`lib/toast.tsx`);
      - add `intentKeys.forPr(prId)` to `useInvalidateAfterRun.all`;
      - mirror the default model.
    - Acceptance: the existing `useInvalidateAfterRun.test.tsx` stays green (it uses `arrayContaining`).
    - Verify: `cd client && pnpm exec vitest run src/lib/hooks/keys.test.ts src/lib/hooks/useInvalidateAfterRun.test.tsx` · `pnpm typecheck`
11. **Intent card on Overview**
    - Files: `OverviewTab/_components/IntentCard/*`, `OverviewTab/OverviewTab.tsx`, `OverviewTab/styles.ts`, `client/messages/en/intent.json`
    - Change:
      - a `deriveViewState(query, mutation, current_head_sha)` helper returning `'not_derived'|'deriving'|'derived'|'stale'|'error'`;
      - a tone map keyed by `IntentConfidence`;
      - the card renders every state in the mockup, including the "Inferred from changes, no author description" banner when `mode === 'inferred_from_changes'`, the missing-context list and the sources list;
      - `OverviewTab` renders a `briefRow` grid (`gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))"`) with `IntentCard` first, above the cost rows;
      - the Pick is extended with `id`, `head_sha`.
    - i18n keys (`intent.json`): `title`, `derive`, `rederive`, `deriving`, `retry`, `notDerived`, `notDerivedHint`, `inScope`, `outOfScope`, `sources`, `sourceKind.{title,body,issue,doc,files,hunks,commits}`, `confidence.{high,medium,low}`, `lowConfidenceHint`, `inferredBadge`, `inferredBanner`, `stale`, `staleHint` (`{derived}`, `{head}`), `staleReviewNote`, `missingTitle`, `missingReason.{not_found,unreachable,no_token,timeout,not_present_at_head,path_not_allowlisted,too_large,host_not_allowlisted}`, `error` (`{message}`), `model` (`{model}`).
    - Acceptance: the existing `OverviewTab.test.tsx` cost assertions still pass. The implementer may update that test's render wrapper only if the new required props or hook break it (minimum change, reported under Deviations).
    - Verify: `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab"` · `pnpm typecheck` · `pnpm lint`
12. **Docs — owner: `doc-writer`, NOT implementer** (implementer skips this step)
    - Runs after architecture review and security review (see *Agent pipeline*), so the docs describe the reviewed code.
    - Files: `docs/agent-prompts/README.md`, `server/docs/architecture.md`, `reviewer-core/docs/architecture.md`
    - Change: the prompt-order block gains `## Stated intent`; the `SCOPE_RULE` and filter semantics, including the small-PR added-lines excerpt; the intent module in the folder map and in the review-run sequence (Mermaid); `applyScopeFilter` in the pipeline. No new docs, so no README rows.
    - Acceptance: every behavioural claim cites `path:line`; every referenced path exists.
    - Verify: n/a

## Agent pipeline
| Order | Agent | Input | Output / gate |
|-------|-------|-------|---------------|
| 0 | main session | this plan, Step 0 | Additive `vendor/shared` contract edits (both copies); typechecks green |
| 1 | `implementer` | this plan (Steps 1–11) | Implementation Report; existing tests, typecheck, lint green |
| 2 | `test-writer` | this plan, *Tests* rows owned by test-writer | Test Report; real bugs left as red tests under *Suspected production defects* |
| 3 | `architecture-reviewer` | diff vs `main`, this plan | Architecture Review (layer rings, do-not-touch, ESM/aliases); findings fixed before step 5 |
| 4 | `/security-review` (built-in) | pending branch changes | Focus: prompt injection via body/issues/docs/added-lines excerpt, `git show` path/sha validation in `file-at-ref.ts`, no external URL fetch (SSRF), log/URL redaction and the secret-line redaction in `addedLinesExcerpt`, derive rate limit, the filter never dropping CRITICAL/security findings. Findings fixed before step 5 |
| 5 | `doc-writer` | this plan (Step 12) + the reviewed source | Documentation Report; insight candidates |
| 6 | `plan-verifier` | this plan, Implementation + Test Reports, diff vs `main` | Traceability matrix across Steps 0–12, acceptance criteria and tests |
| 7 | user: `/pr-self-review` | branch | Required before any `gh pr …` |

## Tests
| Owner | Path | What it pins |
|-------|------|--------------|
| implementer | `reviewer-core/test/{prompt,run,reduce,structured}.test.ts` (existing) | Unchanged prompt and pipeline when no intent is given; no assertion changes expected |
| implementer | `server/test/prompt-structured.test.ts`, `server/test/prompt-callers.test.ts` (existing) | The reviewer-core change keeps the server prompts identical without intent |
| implementer | `server/test/{routes-smoke,contracts,reviews-helpers,run-cost,pulls-service}.test.ts`, `server/test/reviews.it.test.ts` (existing) | Wiring and the executor are still green |
| implementer | `client/src/lib/hooks/{keys,useInvalidateAfterRun}.test.tsx`, `OverviewTab/OverviewTab.test.tsx` (existing) | Key values unchanged; cost rows unchanged |
| test-writer | `server/test/intent-helpers.test.ts` (new) | `isEffectivelyEmptyBody`: **empty body**, **whitespace-only body**, **template-only body** (headings + `<!-- -->` + unchecked boxes, and lines matching the provided template) → true; a short real sentence → false. `extractReferences` covers closing keywords, bare `#N`, `owner/repo#N`, issue URLs, the cap of 3, de-duplication, external URLs → host_not_allowlisted, the doc path allowlist rejecting `..`/absolute paths, and query-string redaction. Also `hunkHeaders` (≤5, 160 chars), `addedLinesExcerpt` (only `+` lines, never `-`/context/`+++`; 40-line and 200-char caps; secret-looking lines redacted; empty for PRs with ≥ 50 changed lines), `fileStatus`, `isDescriptiveCommit`, the `computeConfidence` matrix (changes-only → low; descriptive commit → medium; missing context caps), `shouldFilterByScope` (off for low, stale, inferred), and `formatIntentLogLine` containing no content |
| test-writer | `server/test/intent-service.test.ts` (new; fake deps, no DB) | (a) **empty**, **whitespace** and **template-only** bodies → `mode=inferred_from_changes`, sources `title,files,hunks,commits`, confidence `low`, and the classifier prompt carries the changes-only instruction and no description block. A changes-only PR with < 50 changed lines also has an `added-lines` block and an `added_lines` source; one with ≥ 50, and any author-description PR, has neither. (b) **Body with an unreachable link**: an issue whose `getIssue` throws, plus an external URL → `missing_context` entries, confidence capped, derive succeeds. (c) A fresh intent is reused with no LLM call; stale → `filter:false`; concurrent `derive` + `forReview` → one LLM call (single-flight). (d) The pino log object holds no body text |
| test-writer | `server/test/file-at-ref-adapter.test.ts` (new) | Rejects a non-hex sha, `../`, absolute paths and non-allowlisted paths before spawning git; enforces the size cap |
| test-writer | `server/src/adapters/mocks.ts` (`MockRepoFileAtRef`, new mock) | The hermetic double for `ContainerOverrides.repoFiles` |
| test-writer | `server/test/intent-routes.test.ts` (new; `app.inject`, `overrides: { auth: fakeAuth, llm, github, repoFiles }`) | GET null → `{intent:null, stale:false}`; POST derive → 200 with the record; unknown id → 404; the response passes the `PrIntentResponse` serializer |
| test-writer | `server/test/intent.it.test.ts` (new, Docker) | The migration applies; upsert/read round-trips every new column; the enum values serialize |
| test-writer | `reviewer-core/test/intent-classify.test.ts` (new) | Both prompt modes, all sources fenced, a `</untrusted>` injection in the body escaped, `clampIntent` caps |
| test-writer | `reviewer-core/test/scope-filter.test.ts` (new) | Out-of-scope non-serious findings dropped; two out-of-scope CRITICAL/security findings → exactly one kept, mentioning the other; disabled → no-op; the filter runs after grounding (an ungrounded serious finding is not kept); score recomputed; `scope` stripped from the output |
| test-writer | `client/.../IntentCard/IntentCard.test.tsx`, `IntentCard/helpers.test.ts` (new) | All states (not derived → Derive click → deriving → derived; stale banner + Re-derive; the **inferred-from-changes banner text**; missing-context list; error + Retry); `deriveViewState` mapping |
| test-writer | `client/src/lib/hooks/keys.test.ts` (extend) | Pins `["pr-intent", prId]` |

Acceptance criteria (whole feature):
- The Overview shows the Intent card above the cost rows in every listed state.
- A review on a PR with no intent derives it once; a second review reuses it with no extra LLM call. After a head change the card shows STALE and the review logs `context only, scope filter off`.
- An empty, whitespace or template-only body gives `inferred_from_changes` with the banner, and filtering is off.
- An unreachable or non-allowlisted link appears under Missing context, is never invented, and lowers confidence.
- With a `high`/`medium` author-description intent, non-serious out-of-scope findings are removed, and a CRITICAL/security out-of-scope problem still shows exactly one finding.
- The run trace contains `prompt_assembly.intent`, and the logs contain the source/size/model/token line with no content.

- Final run per touched package: `pnpm test` · `pnpm typecheck` · `pnpm lint` (server, client; reviewer-core has no lint script, so `pnpm test` · `pnpm typecheck`), plus `cd server && pnpm exec vitest run test/prompt-structured.test.ts test/prompt-callers.test.ts`.

## Decisions (user, 2026-11-27)
- **Step 0 (vendor/shared contracts):** approved; the main session executes it before handing the plan to implementer.
- **Default model:** `openrouter` / `deepseek/deepseek-v4-flash`.
- **"One signal":** one serious out-of-scope finding per review (per agent run), others listed in its rationale.
- **Small PRs without a description:** allowed — the added-lines excerpt (≤ 40 `+` lines, PR < 50 changed lines, changes-only mode only).
- **GraphQL `closingIssuesReferences`, persisting GitHub file `status`/`previous_filename`:** not needed; dropped (not deferred).
- **Out-of-scope WARNING bugs (drop vs downgrade):** not answered; the plan keeps the default (drop non-serious, count them in the log).

## Risks & open questions
- **vendor/shared coordination (blocking Step 0).** The four contract files change in both copies. The implementer cannot do this (Hard rule 2). **Decided:** approved; the main session executes Step 0.
- **Model default.** The plan uses `openrouter/deepseek/deepseek-v4-flash`, which is proven in-repo. The researcher suggests `google/gemini-2.5-flash-lite`, which has unverified pricing and strict-schema support in this provider path. **Decided:** deepseek/deepseek-v4-flash.
- **"Exactly one signal" semantics.** The plan keeps ONE serious out-of-scope finding per review (per agent run) and lists the others in its rationale. The alternative is one per distinct file. **Decided:** one per review.
- **Prompt injection.**
  - The body, issues and docs can try to widen `out_of_scope` to hide defects. Mitigations:
    - the classifier is quarantined, with no tools and strict schema plus clamping;
    - the intent is rendered as an "unverified author claims" data block;
    - filtering is code-only and never removes CRITICAL/security findings;
    - the model cannot set confidence.
  - Residual risk: non-serious real issues (WARNING bugs) can be dropped if the classifier is manipulated into marking an area out of scope. **Open question:** should filtering also exempt `category: 'bug'` WARNING findings, or downgrade rather than drop?
- **SSRF.** Eliminated by never fetching non-GitHub URLs. Docs are read from the local clone only. If the user later wants external fetches, that needs an allowlist adapter with IP/redirect checks.
- **Head not in clone.** `fetchPullHead` is best-effort. Offline or with no token, docs are recorded as `not_present_at_head`, which lowers confidence.
- **Token blowup.** Capped by the file, hunk, commit and source limits above (the classifier input stays around ≤ 10k tokens). Huge PRs show "+N more files".
- **Cost.** One flash call per PR per head, and only when absent or on an explicit Re-derive. The single-flight is in-memory per process, so a restart can still race once (acceptable).
- **GitHub rate limits.** ≤ 3 `getIssue` calls per derive, plus the TTL-gated detail refresh. Derive is rate-limited to 10/min.
- **File status.** `added`/`deleted` are inferred from patch headers. `renamed` is not detectable, because `PrFile` has no `status` (`platform.ts:194`) and `octokit.ts:106` drops it. Persisting GitHub `status`/`previous_filename` is not needed (user decision); renames show as delete + add or modified.
- **Changes-only quality without diff bodies.** Small single-file PRs with no function context in their hunk headers may yield a vague intent. **Decided:** the added-lines excerpt (≤ 40 `+` lines, PR < 50 changed lines, changes-only mode) mitigates this. Residual risk: the excerpt is untrusted text and could carry an injection; it is fenced, secret-looking lines are redacted, and the filter is off in changes-only mode anyway.
- **GraphQL `closingIssuesReferences`.** It would catch sidebar-linked issues but needs a new `GitHubClient` port (`vendor/shared/adapters.ts`). Not needed (user decision).
- **`provider.require_parameters: true`** (researcher finding 4) would need a `StructuredRequest` change in `vendor/shared/adapters.ts:55`, or a provider option. Not included; the repair loop (`openrouter.ts:100`) is the fallback.
- **Migration.** `0013_intent_layer` must be applied manually (`pnpm db:migrate`) after user approval. Until then the new routes fail with a column error.
- **Hermetic tests.** Every new test uses mocks (`MockLLMProvider`, `MockGitHubClient.getIssue` at `mocks.ts:233`, the new `MockRepoFileAtRef`) and `fakeAuth`; no network.
- Inference: `OverviewTab.test.tsx` may need its render props updated (new `id`/`head_sha`, hook usage). Allowed as a minimal existing-test fix under Deviations.


## Delivery notes (2026-11-27)
Verified by plan-verifier; all tests, typechecks and lint green in server, client and reviewer-core. Deviations from the text above:
- `scope` tag on scoped findings is nullish; a missing tag counts as `in` (`reviewer-core/src/review/scope.ts:16`).
- `groundFindings` / `reduceReviews` made generic over the finding type (`reviewer-core/src/grounding.ts`, `review/reduce.ts`, outside Scope).
- `forReview(ws, prId)` takes no `log` argument and returns `{ intent?, logLine, filterOffReason?, outcome }` (`server/src/modules/intent/service.ts:45-53,100`); the executor writes `logLine` itself. Same for `ReviewDeps.intent(ws, prId)`.
- `fileStatus(patch)` takes one argument; label-only lines in `isEffectivelyEmptyBody` are stripped only when they end in `:` or are fully bold.
- `ContainerLogger` type and `ContainerOverrides.intentService` added in `server/src/platform/container.ts`; route tests use the override (architecture review A5). `MockRepoFileAtRef` lives in `server/src/adapters/mocks.ts`.
- `safeErrorSummary` (first line, ≤ 120 chars) for the `intent: unavailable` log line.
- The file-at-ref adapter re-checks the docs/specs + PR-template allowlist (`server/src/adapters/git/file-at-ref.ts`).
- `client/src/lib/hooks/index.ts` barrel re-exports the intent hooks and keys; extra i18n keys in `intent.json`; derive errors use the global toast.
- Docs: doc-writer updated the two architecture docs; `docs/agent-prompts/README.md` was updated by the main session (outside doc-writer's write scope).
- Migration `0013_intent_layer` applied to the dev DB with user approval.
