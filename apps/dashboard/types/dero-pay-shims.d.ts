/**
 * Dashboard-local type shim for the `dero-pay/events` module.
 *
 * The live `dero-pay` package does not export `/events` yet.
 * Dirtybird's dashboard imports event types + helpers from it; we
 * provide a loose, dashboard-local contract so the UI compiles and
 * the SSE feed can be stubbed out by the mock backend.
 *
 * When the real module ships in `dero-pay`, delete this file.
 */

declare module "dero-pay/events" {
  export type EventType =
    | "invoice.created"
    | "invoice.detected"
    | "invoice.confirming"
    | "invoice.confirmed"
    | "invoice.expired"
    | "invoice.archived"
    | "invoice.unarchived"
    | "escrow.proposed"
    | "escrow.funded"
    | "escrow.released"
    | "escrow.disputed"
    | "escrow.evidence_submitted"
    | "webhook.delivered"
    | "webhook.failed"
    | "daemon.disconnected"
    | "daemon.synced"
    | "daemon.mempool_depth"
    | "customer.group_changed"
    | "customer.archived"
    | "customer.unarchived"
    | "customer.identified"
    | "payment_link.used"
    | "sweep.executed";

  export type EventRow = {
    id: string;
    type: EventType;
    ts: number;
    entity_type: string | null;
    entity_id: string | null;
    payload: Record<string, unknown>;
    read_at: number | null;
    snoozed_until?: number | null;
    done_at?: number | null;
  };

  export type TimelineEvent = {
    id: string;
    ts: number;
    tone: "success" | "warn" | "info" | "system";
    icon?: string;
    title: string;
    subtitle?: string;
    entityType?: string;
    entityId?: string;
    href?: string;
  };

  export type EventListState = "all" | "unread" | "snoozed" | "done";

  export function hrefForEvent(row: EventRow): string | null;
  export function toTimelineEvent(row: EventRow): TimelineEvent;
  export function publish(...args: unknown[]): unknown;
  export function listEvents(...args: unknown[]): EventRow[];
  export function subscribe(...args: unknown[]): () => void;
  export function markEventsRead(...args: unknown[]): unknown;
  export function markEventsDone(...args: unknown[]): unknown;
  export function snoozeEvents(...args: unknown[]): unknown;
  export function unsnoozeEvents(...args: unknown[]): unknown;
}
