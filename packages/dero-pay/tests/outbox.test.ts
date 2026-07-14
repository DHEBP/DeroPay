import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";
import { WebhookOutbox } from "../src/webhook/outbox.js";
import { deriveDeliveryId } from "../src/webhook/delivery-id.js";
import { makeInvoice, makePayment } from "./helpers.js";
import type { OutboxEvent } from "../src/webhook/outbox-types.js";

/**
 * Status-aware UPSERT + deterministic-id dedupe (invariants 4 & 5; O20/O23).
 */
describe("WebhookOutbox dedupe + status-aware UPSERT", () => {
  let store: SqliteInvoiceStore;
  let outbox: WebhookOutbox;

  beforeEach(async () => {
    store = new SqliteInvoiceStore({ path: ":memory:" });
    outbox = new WebhookOutbox(store);
    await store.createInvoice(makeInvoice({ id: "inv-1", amount: 1_000_000n }));
  });

  afterEach(async () => {
    await store.close();
  });

  const event = (id: string, payload = "{}"): OutboxEvent => ({
    id,
    eventType: "invoice.partial",
    invoiceId: "inv-1",
    payload,
  });

  function enqueue(ev: OutboxEvent, txid: string) {
    // Enqueue happens via the combined store method (the real path).
    store.applyPaymentWithOutbox(
      "inv-1",
      makePayment({ txid, amount: 1n }),
      () => ev
    );
  }

  it("a replayed logical event collapses to one row (deterministic id PK)", async () => {
    const id = deriveDeliveryId("inv-1", "invoice.partial", "partial|100|tx-1");
    enqueue(event(id, JSON.stringify({ v: 1 })), "tx-a");
    enqueue(event(id, JSON.stringify({ v: 2 })), "tx-b"); // same id, replay

    const counts = await outbox.counts();
    expect(counts.pending).toBe(1);
    // First write wins for a live (pending) row — payload NOT overwritten.
    const row = await outbox.get(id);
    expect(row!.payload).toBe(JSON.stringify({ v: 1 }));
  });

  it("distinct discriminators produce distinct rows (no over-coarse collapse)", async () => {
    const id1 = deriveDeliveryId("inv-1", "invoice.partial", "partial|100|tx-1");
    const id2 = deriveDeliveryId("inv-1", "invoice.partial", "partial|200|tx-2");
    enqueue(event(id1), "tx-1");
    enqueue(event(id2), "tx-2");

    const counts = await outbox.counts();
    expect(counts.pending).toBe(2);
  });

  it("REVIVES a dead row and refreshes its payload (self-heals secret rotation)", async () => {
    const id = deriveDeliveryId("inv-1", "invoice.partial", "partial|100|tx-1");
    enqueue(event(id, JSON.stringify({ v: "old" })), "tx-1");

    // Drive it to dead.
    await outbox.markDead(id, "401 after secret rotation");
    expect((await outbox.counts()).dead).toBe(1);

    // Re-enqueue the same logical event with a fresh (re-signed) payload.
    enqueue(event(id, JSON.stringify({ v: "new" })), "tx-1-again");

    const row = await outbox.get(id);
    expect(row!.status).toBe("pending");
    expect(row!.attempts).toBe(0);
    expect(row!.lastError).toBeNull();
    expect(row!.payload).toBe(JSON.stringify({ v: "new" }));
    expect((await outbox.counts()).dead).toBe(0);
  });

  it("does NOT revive a delivered row (no resurrection of completed deliveries)", async () => {
    const id = deriveDeliveryId("inv-1", "invoice.partial", "partial|100|tx-1");
    enqueue(event(id), "tx-1");
    await outbox.markDelivered(id, Date.now());

    enqueue(event(id, "{}"), "tx-1-again"); // same id, already delivered

    const row = await outbox.get(id);
    expect(row!.status).toBe("delivered");
  });

  it("pruneDelivered removes only old delivered rows", async () => {
    const id = deriveDeliveryId("inv-1", "invoice.partial", "p|1|tx");
    enqueue(event(id), "tx-1");
    await outbox.markDelivered(id, 1_000);

    expect(await outbox.pruneDelivered(2_000)).toBe(1);
    expect(await outbox.get(id)).toBeNull();
  });
});
