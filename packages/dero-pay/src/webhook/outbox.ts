/**
 * WebhookOutbox — a thin, store-agnostic facade over the durable outbox rows.
 *
 * It does NOT own the enqueue path: enqueue happens INSIDE the store's combined
 * `apply*WithOutbox` transactions (so the invoice mutation and the outbox row
 * are atomic). This class is what the delivery worker and the bridge use for
 * the read/claim/ack side of the lifecycle, plus housekeeping.
 */

import type { InvoiceStore } from "../store/types.js";
import type { OutboxRecord, OutboxStatus } from "./outbox-types.js";

/** The subset of the store the outbox needs; lets a store fail closed if absent. */
type OutboxCapableStore = Pick<
  InvoiceStore,
  | "claimDueOutbox"
  | "markOutboxDelivered"
  | "rescheduleOutbox"
  | "markOutboxDead"
  | "pruneDeliveredOutbox"
  | "countOutboxByStatus"
  | "getOutboxRecord"
>;

export function storeSupportsOutbox(store: InvoiceStore): boolean {
  return (
    typeof store.applyPaymentWithOutbox === "function" &&
    typeof store.claimDueOutbox === "function"
  );
}

export class WebhookOutbox {
  constructor(private readonly store: OutboxCapableStore) {}

  /**
   * Atomically claim up to `limit` rows due at `now`: pending rows and
   * delivering rows whose lease has expired (a process killed mid-delivery).
   */
  claimDue(now: number, leaseMs: number, limit: number): Promise<OutboxRecord[]> {
    return this.store.claimDueOutbox!(now, leaseMs, limit);
  }

  markDelivered(id: string, deliveredAt: number): Promise<void> {
    return this.store.markOutboxDelivered!(id, deliveredAt);
  }

  reschedule(id: string, nextAttemptAt: number, lastError: string): Promise<void> {
    return this.store.rescheduleOutbox!(id, nextAttemptAt, lastError);
  }

  markDead(id: string, lastError: string): Promise<void> {
    return this.store.markOutboxDead!(id, lastError);
  }

  pruneDelivered(olderThan: number): Promise<number> {
    return this.store.pruneDeliveredOutbox!(olderThan);
  }

  counts(): Promise<Record<OutboxStatus, number>> {
    return this.store.countOutboxByStatus!();
  }

  get(id: string): Promise<OutboxRecord | null> {
    return this.store.getOutboxRecord!(id);
  }
}
