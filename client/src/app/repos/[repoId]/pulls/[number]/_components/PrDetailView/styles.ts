import type { CSSProperties } from "react";

const column = { maxWidth: 1080, margin: "0 auto" } as const;

export const s = {
  body: { padding: "24px 32px 44px", display: "flex", flexDirection: "column", gap: 24, ...column } satisfies CSSProperties,
  skeleton: { padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16, ...column } satisfies CSSProperties,
} as const;
