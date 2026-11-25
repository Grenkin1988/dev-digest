---
name: flaky-test-detector
description: Flag tests that depend on real time, execution order, shared state or the network, and say how to make them deterministic.
type: rubric
---

# Flaky test detector

For every test added or changed in the diff, look for the usual sources of flakiness.
Report only what you can point at in the diff.

## What to flag
- Real timers or sleeps (`setTimeout`, `sleep`, fixed delays) instead of waiting for a condition.
- `Date.now()`, `new Date()` or `Math.random()` in the code under test without a controlled clock or seed.
- Tests that share mutable state (module-level variables, a shared database row) and only pass in a certain order.
- Real network, filesystem or fixed-port usage where a mock or a temp resource would do.
- Unawaited promises, or assertions that are not awaited, so the test can finish before it checks anything.

## How to report
- Cite the exact line of the test.
- Name the source of non-determinism and the replacement (fake timers, an injected clock, a seeded RNG,
  `await expect(...).resolves`, a per-test fixture).
- A test that is flaky by construction is a WARNING; a test that can never fail is CRITICAL.
- Do not flag stable patterns, and do not ask for retries as the fix.
