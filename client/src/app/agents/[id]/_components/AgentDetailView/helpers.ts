import { VALID_TABS, DEFAULT_TAB } from "./constants";

/** The editor tab from `?tab`, falling back to the default for unknown values. */
export function resolveTab(raw: string | null): string {
  return raw && (VALID_TABS as readonly string[]).includes(raw) ? raw : DEFAULT_TAB;
}
