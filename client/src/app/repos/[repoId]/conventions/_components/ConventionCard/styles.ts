import type { CSSProperties } from "react";
import type { ConventionStatus } from "@/lib/hooks/conventions";

/** Co-located styles for ConventionCard. */
export const s = {
  card: (status: ConventionStatus): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 16,
    borderRadius: 10,
    border: `1px solid ${status === "accepted" ? "var(--ok)" : "var(--border)"}`,
    background: "var(--bg-surface)",
    opacity: status === "rejected" ? 0.6 : 1,
  }),
  top: { display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between" } satisfies CSSProperties,
  rule: { fontSize: 14, lineHeight: 1.5, flex: 1, margin: 0 } satisfies CSSProperties,
  actions: { display: "flex", gap: 6, flexShrink: 0 } satisfies CSSProperties,
  editWrap: { flex: 1, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  editActions: { display: "flex", gap: 8 } satisfies CSSProperties,
  badges: { display: "flex", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  evidence: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" } satisfies CSSProperties,
  evidenceHead: {
    padding: "6px 12px",
    fontSize: 12,
    background: "var(--bg-hover)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12,
    lineHeight: 1.5,
    overflow: "auto",
    maxHeight: 220,
    whiteSpace: "pre",
  } satisfies CSSProperties,
} as const;
