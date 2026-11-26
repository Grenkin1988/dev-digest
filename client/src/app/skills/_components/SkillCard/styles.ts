import type { CSSProperties } from "react";

/** Co-located styles for SkillCard (same card language as AgentCard). */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
    marginBottom: 10,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  deleteBtn: (pending: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    cursor: pending ? "not-allowed" : "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 2,
    flexShrink: 0,
    opacity: pending ? 0.5 : 1,
  }),
  description: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "8px 0 4px",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  accept: (pct: number | null): CSSProperties => ({
    color: pct == null ? "var(--text-muted)" : pct >= 75 ? "var(--ok)" : pct >= 50 ? "var(--warn)" : "var(--crit)",
    fontWeight: 600,
  }),
} as const;
