import type { Settings } from '@devdigest/shared';

/** A persisted settings key/value row (non-secret prefs). */
export interface SettingsRow {
  key: string;
  value: unknown;
}

/** Collapse key/value setting rows into a flat `Settings` object. */
export function rowsToSettings(rows: SettingsRow[]): Settings {
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

/** Remove every occurrence of a candidate key from an error message. */
export function redactKey(message: string, key: string | undefined): string {
  return key ? message.split(key).join('[redacted]') : message;
}
