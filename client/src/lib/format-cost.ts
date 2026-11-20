/**
 * Formatting for run usage (USD cost + token counts).
 * "No data" always renders as an em dash — never "$0.00".
 */

export const NO_DATA = "—";

/**
 * USD with precision scaled to the magnitude, so sub-cent runs stay readable:
 * 0.0013 → "$0.0013", 0.014 → "$0.014", 1.5 → "$1.50". A genuine 0 (free model)
 * is "$0"; null/undefined/NaN is "—".
 */
export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return NO_DATA;
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Compact token count: 950 → "950", 8200 → "8.2K", 12011 → "12K", 1.3M → "1.3M". */
export function formatTokensCompact(n: number): string {
  const unit = (v: number, suffix: string) =>
    `${v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)}${suffix}`;
  if (n >= 1_000_000) return unit(n / 1_000_000, "M");
  if (n >= 1_000) return unit(n / 1_000, "K");
  return String(Math.round(n));
}

/** Full token count with grouping: 9119 → "9,119". */
export function formatTokensFull(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** True when there is any usage to show (tokens or cost). */
export function hasUsage(
  costUsd: number | null | undefined,
  tokensIn?: number | null,
  tokensOut?: number | null,
): boolean {
  return costUsd != null || (tokensIn ?? 0) + (tokensOut ?? 0) > 0;
}
