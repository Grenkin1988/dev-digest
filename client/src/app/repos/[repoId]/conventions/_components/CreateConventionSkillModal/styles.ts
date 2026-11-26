import type { CSSProperties } from "react";

/** Co-located styles for CreateConventionSkillModal. */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 } satisfies CSSProperties,
  includeList: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  path: { color: "var(--text-muted)" } satisfies CSSProperties,
  error: { marginTop: 6, fontSize: 12, color: "var(--crit)" } satisfies CSSProperties,
  footer: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    padding: "14px 24px",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
