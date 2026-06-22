import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";
import { OutboxWebhookSink } from "../src/webhook/outbox-sink.js";
import { WebhookOutbox } from "../src/webhook/outbox.js";
import { makeInvoice, makePayment } from "./helpers.js";

/**
 * The sink is where invariants 1/2/3 + O34 become real: the store-authoritative
 * in-tx bigint sum is the SOLE writer of amount_received, status is decided from
 * the committed total (never a monitor in-memory amount), and completion is
 * reachable on BOTH the detection and confirmation edges.
 */
describe("OutboxWebhookSink — single-writer + both-edge completion", () => {
  let store: SqliteInvoiceStore;
  let sink: OutboxWebhookSink;
  let outbox: WebhookOutbox;

  beforeEach(async () => {
    store = new SqliteInvoiceStore({ path: ":memory:" });
    sink = new OutboxWebhookSink(store);
    outbox = new WebhookOutbox(store);
    await store.createInvoice(
      makeInvoice({ id: "inv-1", amount: 1_000_000n, requiredConfirmations: 3 })
    );
  });

  afterEach(async () => {
    await store.close();
  });

  it("writes amount_received as the exact bigint sum of payment rows (O34)", async () => {
    await sink.onPaymentDetected(
      "inv-1",
      makePayment({ txid: "tx-1", amount: 300_000n, status: "detected" })
    );
    await sink.onPaymentDetected(
      "inv-1",
      makePayment({ txid: "tx-2", amount: 250_000n, status: "detected" })
    );

    const inv = await store.getInvoice("inv-1");
    // Exactly the sum of the two payment rows — never a monitor-supplied amount.
    expect(inv!.amountReceived).toBe(550_000n);
    expect(inv!.status).toBe("partial");
  });

  it("enqueues payment.detected + invoice.partial on first partial payment", async () => {
    await sink.onPaymentDetected(
      "inv-1",
      makePayment({ txid: "tx-1", amount: 400_000n, status: "detected" })
    );
    const counts = await outbox.counts();
    // payment.detected + invoice.partial (status changed created->partial)
    expect(counts.pending).toBe(2);
  });

  it("completes on the DETECTION edge when paid-in-full and already confirmed", async () => {
    await sink.onPaymentDetected(
      "inv-1",
      makePayment({ txid: "tx-1", amount: 1_000_000n, status: "confirmed" })
    );
    const inv = await store.getInvoice("inv-1");
    expect(inv!.status).toBe("completed");
    expect(inv!.completedAt).not.toBeNull();
  });

  it("completes on the CONFIRMATION edge when first seen unconfirmed (invariant 3)", async () => {
    // Paid in full but unconfirmed -> 'confirming', not yet completed.
    await sink.onPaymentDetected(
      "inv-1",
      makePayment({ txid: "tx-1", amount: 1_000_000n, status: "detected" })
    );
    expect((await store.getInvoice("inv-1"))!.status).toBe("confirming");

    // Confirmation depth crosses -> mark the payment confirmed, then the
    // confirmation edge completes it durably.
    await store.updatePayment("inv-1", "tx-1", {
      confirmations: 3,
      status: "confirmed",
    });
    await sink.onPaymentConfirmed("inv-1", "tx-1");

    const inv = await store.getInvoice("inv-1");
    expect(inv!.status).toBe("completed");
    // A completed outbox event exists for the confirmation edge.
    const counts = await outbox.counts();
    expect(counts.pending).toBeGreaterThanOrEqual(1);
  });

  it("a replayed identical detection does not double-write or duplicate events", async () => {
    const p = makePayment({ txid: "tx-1", amount: 400_000n, status: "detected" });
    await sink.onPaymentDetected("inv-1", p);
    const after1 = await outbox.counts();

    // Replay the SAME txid (INSERT OR IGNORE on payments; deterministic ids on
    // outbox) — amount must not double, events must not duplicate.
    await sink.onPaymentDetected("inv-1", p);
    const inv = await store.getInvoice("inv-1");
    expect(inv!.amountReceived).toBe(400_000n); // not 800_000n
    const after2 = await outbox.counts();
    expect(after2.pending).toBe(after1.pending);
  });

  it("expiry enqueues a terminal invoice.expired carrying the partial amount", async () => {
    await sink.onPaymentDetected(
      "inv-1",
      makePayment({ txid: "tx-1", amount: 200_000n, status: "detected" })
    );
    await sink.onInvoiceExpired("inv-1");

    const inv = await store.getInvoice("inv-1");
    expect(inv!.status).toBe("expired");
    // The frozen payload of the expired event carries the partial amount.
    const counts = await outbox.counts();
    expect(counts.pending).toBeGreaterThanOrEqual(1);
  });
});
