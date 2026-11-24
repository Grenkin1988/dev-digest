# Report to the user (terminal)

`finalize.mjs` writes the full `report.md`. In chat, summarize it in this shape. Keep it short and
put the blocking items first.

```
PR self-review: BLOCKED. 2 CRITICAL · 5 WARNING · 3 SUGGESTION
(base origin/main @ 25d19b5, 14 files, skills: onion-architecture, fastify-best-practices, zod, security, …;
 checks: server lint fail · server typecheck pass · client lint pass · client typecheck pass)

Blocking:
1. server/src/modules/pulls/service.ts:12 (onion §1 dependency rule, lint): service imports
   drizzle-orm. Fix: move the query into pulls/repository.ts and call it through the repository.
2. server/src/modules/pulls/routes.ts:40 (security, verified): `req.query.path` reaches
   fs.readFile without containment. Fix: resolve it with platform/contained-read.ts.

Warnings (top 3 of 5):
- client/src/app/repos/[repoId]/page.tsx:88 (react: derive, don't store): …
- …

The PR can't be opened until the CRITICALs are fixed and /pr-self-review is re-run.
Want me to fix them?
```

- Verdict line: `BLOCKED` for request_changes, `PASS` for approve, `PASS (non-blocking findings)` for comment.
- Name the rule and the skill (or `lint`/`typecheck`/`rules`) for every CRITICAL, and add "verified" when a
  verifier confirmed it.
- Mention anything listed under `unreviewed`, and any drift warning, in one line.
- When it passes and the user wants a PR: say the gate will let `gh pr create` through and will post the
  GitHub status, or run `post-status.mjs` after pushing.
