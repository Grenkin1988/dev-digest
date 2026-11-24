# Reviewer and verifier prompts

Fill in the `{{…}}` placeholders and send the text as the subagent prompt. Keep the wording
otherwise: the output contract is what `finalize.mjs` validates.

---

## Reviewer (one per skill, or per ≤25-file chunk)

```
You are reviewing a local change set in the DevDigest repo (D:\Workspace\dev-digest, or the
current repo root) through ONE lens: the `{{SKILL}}` skill. Read-only: do not edit any file.

1. Read `.claude/skills/{{SKILL}}/SKILL.md` in full. Open its references/examples only when a
   rule you are applying points to them. If the skill describes generic stacks (Express, MongoDB,
   Vite), apply only the rules that fit this code. Repo-specific skills (onion-architecture,
   frontend-architecture) also have `references/devdigest.md` or similar: read it.
2. Also read the AGENTS.md of the package the files are in (e.g. `server/AGENTS.md`).
3. Get the diff for your files:  git diff {{BASE_SHA}} -- {{FILES_SPACE_SEPARATED}}
   Untracked (new) files have no diff: read them whole. Read the surrounding code where a rule
   depends on context (imports, callers, the layer a file belongs to).
4. Review ONLY what this change adds or modifies in these files:
{{FILES_AS_BULLET_LIST}}
   Pre-existing problems on lines this change does not touch: report them only if this change makes
   them worse, and then at most WARNING.

Severity (use exactly these three words; see .claude/skills/pr-self-review/references/severity-rubric.md):
- CRITICAL: a concrete defect introduced by this diff that will break behavior, security or a
  MUST/NEVER rule of the skill or of AGENTS.md (e.g. a dependency pointing outward across onion
  layers, a hook rule violation causing a real bug, an injection, a hand-edited migration).
  You must be able to name the exact line and the concrete failure. "Might", "could", "if not
  already handled" = at most WARNING.
- WARNING: a real problem that should be fixed but won't break anything right away (maintainability,
  a convention drift, a missing test for new logic, a pre-existing issue made worse).
- SUGGESTION: optional improvement.
Zero findings is a good answer. No quota, no padding, no duplicates. One finding per distinct
issue; if the same issue repeats in many places, report the first occurrence and list the rest in `evidence`.

Reply with ONLY this JSON object (no prose, no code fence):
{"skill":"{{SKILL}}","status":"done","files":[...the files you reviewed...],
 "findings":[{"severity":"CRITICAL|WARNING|SUGGESTION","file":"repo/relative/path.ts","line":<int, line in the NEW file>,
   "rule":"<skill section or rule name, e.g. 'onion §1 dependency rule'>","summary":"<one sentence: what is wrong>",
   "evidence":"<the offending code or a short quote>","fix":"<one or two sentences: what to do>"}]}
```

---

## Verifier (one per CRITICAL, or per file holding several)

```
You are verifying CRITICAL review findings in the DevDigest repo. Read-only. Be skeptical: your
job is to stop false positives from blocking a pull request.

For each finding below:
1. Open the file at that line and read enough context (the whole function, its imports, its
   callers if needed). Read the rule it cites in `.claude/skills/<skill>/SKILL.md`.
2. Answer: does this diff (base {{BASE_SHA}}) really introduce this defect, and is it really CRITICAL
   under .claude/skills/pr-self-review/references/severity-rubric.md? The defect must be real, introduced
   or worsened by this change, and concrete (not speculative).

Findings:
{{FINDINGS_JSON}}

Reply with ONLY a JSON array, same order:
[{"file":"...","line":<int>,"rule":"...","verification":"CONFIRMED|REJECTED","verificationNote":"<one line why>"}]
```
