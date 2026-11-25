import type { CSSProperties } from "react";

/** Co-located styles for BodyEditor (code-style markdown editor). */
export const s = {
  box: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  fileName: { fontWeight: 600 } satisfies CSSProperties,
  tokens: { marginLeft: "auto", color: "var(--text-muted)" } satisfies CSSProperties,
  editor: { display: "flex", maxHeight: 520, overflow: "auto" } satisfies CSSProperties,
  gutter: {
    padding: "12px 10px 12px 12px",
    textAlign: "right",
    color: "var(--text-muted)",
    fontSize: 13,
    lineHeight: "20px",
    userSelect: "none",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
    flexShrink: 0,
    whiteSpace: "pre",
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    minWidth: 0,
    padding: "12px 14px",
    border: "none",
    outline: "none",
    resize: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: "20px",
    whiteSpace: "pre",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
