/**
 * Durable webhook outbox types.
 *
 * The outbox is the at-least-once, restart-survivable spine of the DeroPay
 * Bridge: every payment/invoice event is committed to a SQLite row IN THE SAME
 * TRANSACTION as the invoice state change, then delivered by a separate worker.
 * A crash between "state changed" and "merchant notified" can therefore never
 * lose a notification — the row is already on disk.
 */

import type { WebhookEventType } from "../core/types.js";

export type OutboxStatus = "pending" | "delivering" | "delivered" | "dead";

/**
 * One durable outbox row.
 *
 * `id` is the deterministic delivery id (see {@link deriveDeliveryId}); it is
 * BOTH the primary key (so a replayed logical event collapses) AND the
 * `X-DeroPay-Delivery` header the merchant dedupes on.
 *
 * `payload` is the FROZEN signed JSON of the event, serialized (bigint->string)
 * at enqueue time INSIDE the enqueue transaction. Re-signing these exact bytes
 * yields an identical signature on every replay, so a redelivery after restart
 * is byte-identical to the first attempt.
 */
export type OutboxRecord = {
  id: string;
  eventType: WebhookEventType;
  invoiceId: string;
  /** Frozen signed JSON (bigint already stringified). */
  payload: string;
  status: OutboxStatus;
  attempts: number;
  /** Epoch ms; when this row is next eligible to be claimed. Durable backoff. */
  nextAttemptAt: number;
  /** Epoch ms; a delivering row's claim lease. A stale lease is reclaimable. */
  leaseUntil: number;
  lastError: string | null;
  createdAt: number;
  deliveredAt: number | null;
};

/** What the engine hands the store to enqueue, before durable fields are set. */
export type OutboxEvent = {
  id: string;
  eventType: WebhookEventType;
  invoiceId: string;
  payload: string;
};

/**
 * Durable store surface for the outbox. Implemented by SqliteInvoiceStore
 * (durable) and MemoryInvoiceStore (non-durable, tests only). All members are
 * OPTIONAL on the InvoiceStore interface (same `?:` pattern as the payment-link
 * methods) so a store that doesn't support the outbox simply omits them and the
 * bridge fails closed at config time.
 */
export type OutboxStore = {
  /**
   * Claim up to `limit` rows due for delivery: status='pending', OR
   * status='delivering' with an expired lease (recovers a process killed
   * mid-delivery), AND nextAttemptAt <= now. Atomically flips them to
   * 'delivering' with a fresh lease. Returns the claimed rows.
   */
  claimDueOutbox(now: number, leaseMs: number, limit: number): Promise<OutboxRecord[]>;
  markOutboxDelivered(id: string, deliveredAt: number): Promise<void>;
  /** Reschedule a failed attempt: bump attempts, set nextAttemptAt, back to 'pending'. */
  rescheduleOutbox(
    id: string,
    nextAttemptAt: number,
    lastError: string,
  ): Promise<void>;
  /** Park a row that exhausted its retry ceiling. Never deleted. */
  markOutboxDead(id: string, lastError: string): Promise<void>;
  /** Delete delivered rows older than `olderThan` (epoch ms). Housekeeping only. */
  pruneDeliveredOutbox(olderThan: number): Promise<number>;
  /** Count rows by status (for the durable dead-letter / heartbeat counters). */
  countOutboxByStatus(): Promise<Record<OutboxStatus, number>>;
  getOutboxRecord(id: string): Promise<OutboxRecord | null>;
};

/**
 * The seam the InvoiceEngine writes through when a sink is configured.
 *
 * The engine NEVER builds the durable row itself — it describes the state
 * transition, and the sink (a) derives the deterministic id, (b) freezes +
 * signs the payload, and (c) commits the invoice mutation AND the outbox row in
 * ONE transaction via the store's combined methods. This keeps the single
 * writer of `amount_received` and the single point of id derivation in one
 * place. When no sink is configured the engine's default path is byte-identical
 * to today (the 223-test regression gate).
 */
export type WebhookSink = {
  /**
   * A payment arrived (new txid). The sink re-sums in-tx (single writer),
   * decides the resulting status, and enqueues the matching event.
   */
  onPaymentDetected(invoiceId: string, txid: string): Promise<void>;
  /**
   * A confirmation-depth crossing. The sink re-reads store-authoritative
   * totals and enqueues completion/confirming on the confirmation edge.
   */
  onPaymentConfirmed(invoiceId: string, txid: string): Promise<void>;
  /** A terminal expiry decided by the engine/sweep (payment-aware). */
  onInvoiceExpired(invoiceId: string): Promise<void>;
};
