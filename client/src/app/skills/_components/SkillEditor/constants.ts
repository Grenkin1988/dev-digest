import type { IconName } from "@devdigest/ui";

export const TAB_KEYS = ["config", "preview", "stats", "versions"] as const;
export type SkillTab = (typeof TAB_KEYS)[number];
export const DEFAULT_TAB: SkillTab = "config";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: SkillTab;
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];

/** Above this many diff cells (lines x lines) we skip the LCS and show a plain replace. */
export const MAX_DIFF_CELLS = 4_000_000;
