/* useFindingShortcuts — j/k moves the focused finding, a/d accepts/dismisses
   it. One window listener for the component's lifetime: the handler reads the
   latest list/focus through a ref, so it never re-subscribes on render. */
"use client";

import React from "react";
import type { FindingActionKind } from "@devdigest/shared";
import { KEY_TO_ACTION } from "./constants";

/** Typing in a field must not trigger shortcuts. */
function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function useFindingShortcuts<T extends { id: string }>(opts: {
  items: T[];
  focusIdx: number;
  setFocusIdx: React.Dispatch<React.SetStateAction<number>>;
  onAction: (item: T, action: FindingActionKind) => void;
}) {
  const latest = React.useRef(opts);
  latest.current = opts;

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const { items, focusIdx, setFocusIdx, onAction } = latest.current;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, items.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else {
        const action = KEY_TO_ACTION[e.key];
        const item = items[focusIdx];
        if (action && item) onAction(item, action);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
