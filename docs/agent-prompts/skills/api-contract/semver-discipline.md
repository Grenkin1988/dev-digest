---
name: semver-discipline
description: Decide what version bump a contract change requires and flag the PR when the bump it ships (package.json version, API version prefix, changelog entry) is smaller than that. Any breaking change requires a MAJOR bump or a new API version; never accept a breaking change under a minor or patch.
type: rubric
---

# semver-discipline

Version numbers are a promise to clients: **MAJOR** = may break you, **MINOR** = new
things, nothing broken, **PATCH** = fixes only, nothing new, nothing broken.

## Classify the change
| Change in the diff | Required bump |
|---|---|
| Anything listed in `breaking-change` or the CRITICAL cases of `response-schema` | **MAJOR** (or a new API version: `/v2/…`) |
| New route, new optional input field, new output field, new export | MINOR |
| Bug fix that makes behavior match the documented contract | PATCH |
| Deprecation marker added (nothing removed) | MINOR |
| Removal of something already deprecated for the agreed period | MAJOR |

The bump is decided by the **most severe** change in the PR, not the majority.

## Flag these
- A breaking change with a MINOR or PATCH bump in `package.json`, a library
  `version` constant, or the changelog. → CRITICAL.
- A breaking change to a versioned HTTP API (`/v1/…`) made in place instead of in a
  new version. → CRITICAL.
- A breaking change in a package or API that is versioned, with no version change
  and no changelog entry at all. → WARNING (the reviewer may not see release
  tooling; say so).
- A MAJOR bump with no breaking change listed in the changelog. → SUGGESTION.
- A changelog entry that describes a breaking change as "refactor", "cleanup" or
  "chore". → WARNING.

## Do not flag
- Projects with no versioning (unpublished apps, no version prefix, no changelog) —
  `breaking-change` already covers the break itself; do not duplicate it here.
- Pre-1.0 packages (`0.x`) where the project explicitly documents that minors may
  break — mention it in the summary instead.

## Example

**Bad** — field removed, shipped as a minor:
```diff
- "version": "2.4.1"
+ "version": "2.5.0"
  ## 2.5.0
- - Removed `legacyId` from `Review` responses
+ - Cleanup: dropped unused `legacyId`
```

**Good** — breaking removal shipped as a major, called out as breaking:
```diff
+ "version": "3.0.0"
  ## 3.0.0
+ ### BREAKING
+ - `Review.legacyId` removed (deprecated since 2.3.0). Use `Review.id`.
```

**Bad** — in-place change of a versioned route:
```ts
app.get('/v1/pulls/:id', newShapeHandler);
```

**Good** — new version added, old one kept:
```ts
app.get('/v1/pulls/:id', oldShapeHandler);
app.get('/v2/pulls/:id', newShapeHandler);
```
