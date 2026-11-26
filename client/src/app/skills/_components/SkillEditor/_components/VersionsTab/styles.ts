import type { CSSProperties } from "react";

/** Co-located styles for the skill VersionsTab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 18px" } satisfies CSSProperties,
  row: (current: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    marginBottom: 10,
    borderRadius: 8,
    border: "1px solid " + (current ? "var(--border-strong)" : "var(--border)"),
    background: "var(--bg-elevated)",
  }),
  versionChip: (current: boolean): CSSProperties => ({
    minWidth: 34,
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 5,
    color: current ? "var(--accent)" : "var(--text-secondary)",
    background: current ? "var(--accent-bg)" : "var(--bg-hover)",
  }),
  text: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  message: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
