import { z } from 'zod';
import { Finding, Review } from '@devdigest/shared';

/**
 * Scope tagging + filter. The model only TAGS each finding `in` / `out`; the
 * decision to drop is code, and a tag can never remove a serious signal.
 * Defined locally so the shared `Finding` contract is unchanged.
 */

export const FindingScope = z.enum(['in', 'out']);
export type FindingScope = z.infer<typeof FindingScope>;

export const ScopedFinding = Finding.extend({
  // nullish like the other optional Finding fields (strict-schema friendly). A missing
  // tag is treated as "in": the filter only ever drops what the model explicitly tagged "out".
  scope: FindingScope.nullish().describe(
    'Whether the finding concerns an area inside the stated intent ("in") or one the intent explicitly leaves out / the PR does not touch ("out").',
  ),
});
export type ScopedFinding = z.infer<typeof ScopedFinding>;

/** `Review` whose findings carry a `scope` tag (used only when an intent is present). */
export const ScopedReview = Review.extend({ findings: z.array(ScopedFinding) });
export type ScopedReview = z.infer<typeof ScopedReview>;

export interface ScopeFilterStats {
  /** Filter was enabled for this run. */
  applied: boolean;
  /** Non-serious out-of-scope findings removed. */
  dropped: number;
  /** Extra serious out-of-scope findings folded into the single kept one. */
  collapsed: number;
  /** The one serious out-of-scope finding that was kept, if any. */
  keptSerious: Finding | null;
}

export interface ScopeFilterResult {
  kept: Finding[];
  stats: ScopeFilterStats;
}

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  CRITICAL: 2,
  WARNING: 1,
  SUGGESTION: 0,
};

const SERIOUS_KINDS = new Set<string>(['secret_leak', 'lethal_trifecta']);

export function isSerious(f: Finding): boolean {
  return f.severity === 'CRITICAL' || f.category === 'security' || SERIOUS_KINDS.has(f.kind ?? '');
}

/** Worst first: severity, then confidence, then file and line (stable, deterministic). */
function compareSerious(a: Finding, b: Finding): number {
  return (
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    b.confidence - a.confidence ||
    a.file.localeCompare(b.file) ||
    a.start_line - b.start_line
  );
}

function stripScope(f: ScopedFinding): Finding {
  const { scope: _scope, ...rest } = f;
  return rest;
}

/**
 * Pure. Runs AFTER grounding. When disabled it only strips the tag.
 * Enabled: `in` → keep; `out` + serious → keep exactly one (the worst) and note
 * the others in its rationale; `out` + not serious → drop and count.
 */
export function applyScopeFilter(
  findings: ScopedFinding[],
  opts: { enabled: boolean },
): ScopeFilterResult {
  if (!opts.enabled) {
    return {
      kept: findings.map(stripScope),
      stats: { applied: false, dropped: 0, collapsed: 0, keptSerious: null },
    };
  }

  const serious: ScopedFinding[] = [];
  let dropped = 0;
  for (const f of findings) {
    if (f.scope !== 'out') continue;
    if (isSerious(f)) serious.push(f);
    else dropped += 1;
  }

  const sorted = [...serious].sort(compareSerious);
  const top = sorted[0];
  const others = sorted.slice(1);
  const keptSerious: Finding | null = top
    ? stripScope(
        others.length === 0
          ? top
          : {
              ...top,
              rationale:
                `${top.rationale}\n\nAlso out of the stated scope: ` +
                others.map((o) => `${o.title} (${o.file}:${o.start_line})`).join('; '),
            },
      )
    : null;

  // Original order is preserved: the one serious finding stays where it came from.
  const kept: Finding[] = [];
  for (const f of findings) {
    if (f.scope !== 'out') kept.push(stripScope(f));
    else if (f === top && keptSerious) kept.push(keptSerious);
  }

  return { kept, stats: { applied: true, dropped, collapsed: others.length, keptSerious } };
}
