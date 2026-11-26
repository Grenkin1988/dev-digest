import type { CSSProperties } from "react";
import type { DiffLine } from "../../helpers";

/** Co-located styles for VersionDiffModal. */
export const s = {
  pre: { margin: 0, padding: "12px 0", fontSize: 13, lineHeight: "20px", overflow: "auto" } satisfies CSSProperties,
  line: (kind: DiffLine["kind"]): CSSProperties => ({
    padding: "0 20px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background:
      kind === "add"
        ? "color-mix(in srgb, var(--ok) 14%, transparent)"
        : kind === "del"
          ? "color-mix(in srgb, var(--crit) 14%, transparent)"
          : "transparent",
    color: kind === "same" ? "var(--text-secondary)" : "var(--text-primary)",
  }),
  sign: { display: "inline-block", width: 16, color: "var(--text-muted)" } satisfies CSSProperties,
  same: { padding: 24, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
