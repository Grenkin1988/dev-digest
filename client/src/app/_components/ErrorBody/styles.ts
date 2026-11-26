import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12 } satisfies CSSProperties,
  text: { margin: 0 } satisfies CSSProperties,
} as const;
