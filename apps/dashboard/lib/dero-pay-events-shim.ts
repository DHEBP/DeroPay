/**
 * Runtime stub for `dero-pay/events`.
 *
 * The live `dero-pay` package does not ship an `/events` subpath; this
 * module provides a no-op event bus so Dirtybird's dashboard code that
 * imports from `dero-pay/events` can compile and render. When the real
 * module ships in `dero-pay`, delete this file and the webpack alias
 * in `next.config.ts`.
 */

// Types are provided by `types/dero-pay-shims.d.ts`. The runtime values
// below are intentionally minimal — publish is a no-op, subscribe returns
// a noop unsubscribe, listEvents returns an empty array.

export function hrefForEvent(row: {
  type: string;
  entity_id: string | null;
}): string | null {
  if (row.type.startsWith("invoice."))
    return row.entity_id
      ? `/invoices?drawer=invoice:${encodeURIComponent(row.entity_id)}`
      : "/invoices";
  if (row.type.startsWith("escrow."))
    return row.entity_id
      ? `/escrow?drawer=escrow:${encodeURIComponent(row.entity_id)}`
      : "/escrow";
  if (row.type.startsWith("webhook.")) return "/developers";
  if (row.type.startsWith("daemon.")) return "/settings#connection";
  if (row.type.startsWith("customer.")) return "/customers";
  if (row.type.startsWith("payment_link.")) return "/payment-links";
  if (row.type.startsWith("sweep.")) return "/payouts#sweeps";
  return null;
}

export function toTimelineEvent(row: {
  id: string;
  ts: number;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
}): {
  id: string;
  ts: number;
  tone: "success" | "warn" | "info" | "system";
  title: string;
  href?: string;
  entityType?: string;
  entityId?: string;
} {
  return {
    id: row.id,
    ts: row.ts,
    tone: "info",
    title: row.type,
    href: hrefForEvent(row) ?? undefined,
    entityType: row.entity_type ?? undefined,
    entityId: row.entity_id ?? undefined,
  };
}

export function publish(..._args: unknown[]): void {}
export function listEvents(..._args: unknown[]): unknown[] {
  return [];
}
export function subscribe(..._args: unknown[]): () => void {
  return () => {};
}
export function markEventsRead(..._args: unknown[]): void {}
export function markEventsDone(..._args: unknown[]): void {}
export function snoozeEvents(..._args: unknown[]): void {}
export function unsnoozeEvents(..._args: unknown[]): void {}
