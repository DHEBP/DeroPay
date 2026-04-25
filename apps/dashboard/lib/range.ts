/**
 * Date-range helpers for the period-aware dashboard.
 *
 * A `Range` is either a preset ("7d", "30d", "90d") or a custom window
 * encoded as "custom:YYYY-MM-DD:YYYY-MM-DD". This shape is URL-safe so it
 * can round-trip through `?range=` without encoding weirdness.
 */

export type Range = "7d" | "30d" | "90d" | `custom:${string}:${string}`;

const DAY_MS = 86_400_000;

/** Normalize a raw string (query param, cookie, etc.) into a Range. */
export function parseRange(value: string | null | undefined): Range {
  if (value === "7d" || value === "30d" || value === "90d") return value;
  if (value && value.startsWith("custom:")) {
    const parts = value.split(":");
    if (parts.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) && /^\d{4}-\d{2}-\d{2}$/.test(parts[2])) {
      return value as Range;
    }
  }
  return "30d";
}

/**
 * Convert a Range into absolute UTC millisecond bounds. Custom windows use
 * [00:00:00Z, 23:59:59Z] UTC for the from/to dates so day buckets line up.
 */
export function rangeToBounds(r: Range): { fromMs: number; toMs: number } {
  const now = Date.now();
  if (r === "7d") return { fromMs: now - 7 * DAY_MS, toMs: now };
  if (r === "30d") return { fromMs: now - 30 * DAY_MS, toMs: now };
  if (r === "90d") return { fromMs: now - 90 * DAY_MS, toMs: now };
  const [, from, to] = r.split(":");
  return {
    fromMs: new Date(from + "T00:00:00Z").getTime(),
    toMs: new Date(to + "T23:59:59Z").getTime(),
  };
}

/**
 * How many buckets a Range should produce, and the bucket granularity.
 * 7d gets hourly resolution (168 buckets); wider ranges get daily buckets.
 */
export function rangeBucketCount(r: Range): { count: number; granularity: "hour" | "day" } {
  if (r === "7d") return { count: 168, granularity: "hour" };
  if (r === "30d") return { count: 30, granularity: "day" };
  if (r === "90d") return { count: 90, granularity: "day" };
  const { fromMs, toMs } = rangeToBounds(r);
  return { count: Math.max(1, Math.ceil((toMs - fromMs) / DAY_MS)), granularity: "day" };
}

/** Human-friendly label used in the picker button and elsewhere. */
export function rangeLabel(r: Range): string {
  if (r === "7d") return "Last 7 days";
  if (r === "30d") return "Last 30 days";
  if (r === "90d") return "Last 90 days";
  const [, from, to] = r.split(":");
  return `Custom (${from} – ${to})`;
}
