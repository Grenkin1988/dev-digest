---
name: engineering-insights
description: Captures non-obvious, verified engineering findings from the current session and appends them to the INSIGHTS.md of the module being worked in (client, server, reviewer-core, e2e). Use proactively whenever a session uncovers a surprising root cause, a dead end or failed approach, an undocumented constraint or convention, a dependency/tool quirk, a recurring error and its fix, or a decision with a non-obvious reason — and at the end of any session that solved a problem. Also use when the user says "record this", "add an insight", "wrap up", or "what did we learn".
---

# Engineering insights

Turn what this session learned into notes the next session can act on cold.

## When
- As you go: right after a finding is **confirmed** (fix works, test passes, user confirms). Never mid-hypothesis.
- At the end of a session that solved or discovered something. If nothing qualifies, write nothing and say so.

## What to capture
- User corrections ("no, in this repo we do X")
- Surprising root causes and gotchas
- Dead ends and failed approaches
- Undocumented constraints and conventions
- Dependency and tool quirks
- Decisions whose reason is not obvious from the code

## Where
Route by the files the finding is about (touched or investigated):

| Files under | Write to |
|---|---|
| `client/**` | `client/INSIGHTS.md` |
| `server/**` (incl. `server/src/modules/repo-intel`) | `server/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |

If a finding spans several modules, split it: each module's INSIGHTS.md gets only the part relevant to it,
phrased from that module's side (e.g. server half of an API-contract quirk → server, client half → client).
Never copy the same whole entry into several files. Findings outside these modules (root config, `scripts/`)
are not written — mention them in the summary instead.

## Sections (fixed — every entry goes in exactly one)
- **What Works** — approaches and solutions that worked
- **What Doesn't Work** — dead ends and antipatterns (most often skipped, most valuable)
- **Codebase Patterns** — conventions and architectural decisions, with the reason
- **Tool & Library Notes** — dependency and tool quirks
- **Recurring Errors & Fixes** — error text + the fix
- **Session Notes** — dated summary of what the session accomplished / decided
- **Open Questions** — unresolved or unverified items (low-confidence findings go here)

Never create other headings.

## Entry format
Append a bullet under the matching `##` section:

```
- **YYYY-MM-DD** — <concrete, actionable insight → what to do>. Evidence: `path/file.ts:NN` (<symbol>).
```

Session Notes instead group under a dated subheading:

```
### YYYY-MM-DD
- <what the session accomplished / decided, one line per point>
```

Quality bar: a reader acting "cold" knows exactly what to do. If it would be obvious to anyone reading the
code — don't write it. Good/bad examples: [references/examples.md](references/examples.md).

## Workflow
Copy this checklist and work through it:

```
- [ ] 1. Gate check — was this session substantial?
- [ ] 2. Read the touched module's INSIGHTS.md
- [ ] 3. Draft ≤5 candidates, ranked by signal
- [ ] 4. Dedup against what's already there
- [ ] 5. Append automatically (append-only)
- [ ] 6. One-line summary
```

1. **Gate check.** Did the session produce something substantial — a problem solved, a decision made, a
   non-obvious discovery? Each finding must be verified (otherwise → Open Questions) and save the next
   session 5+ minutes. If nothing qualifies → **write nothing** and stop.
2. **Read first.** Open each touched module's `INSIGHTS.md` (see "Where") before drafting anything.
3. **Draft ≤5 candidates**, ranked by signal (user corrections and gotchas highest; nice-to-know patterns
   lowest). Each candidate = the exact proposed line + target section + `file:line` evidence.
4. **Dedup.** Grep the file for the key symbol / error text; drop any candidate already covered. If reality
   contradicts an old entry, add a new dated note `Supersedes YYYY-MM-DD entry: …` — never edit the old one.
5. **Append** the survivors (automatic — no approval prompt).
6. **Summary.** One line: what was written, to which file, what was skipped.

## Non-destructive write contract (hard rule)
- **Re-read the target `INSIGHTS.md` immediately before writing** — it may have changed since the session started.
- **Insert with an anchored `Edit`** that adds the bullet at the end of the correct `##` section.
  **Never use `Write` on an existing `INSIGHTS.md`** — it replaces the whole file.
- **Preserve verbatim** the header, preamble, every heading and every existing entry. Content is only ever added.
- **Corrections are additive** — supersede with a new dated note; never rewrite or delete.
- **Idempotent** — if an equivalent entry already exists, skip it.
