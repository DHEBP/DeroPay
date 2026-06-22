import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";
import { makeInvoice, makePayment } from "./helpers.js";
import type { OutboxEvent } from "../src/webhook/outbox-types.js";

/**
 * Invariant 7 (O5/O21): applyPaymentWithOutbox / applyInvoiceUpdateWithOutbox
 * commit the invoice mutation AND the outbox row in ONE synchronous
 * better-sqlite3 transaction. Either both land or neither does, and no async
 * can interleave (db.transaction throws on an async fn).
 */
describe("combined apply*WithOutbox atomicity", () => {
  let store: SqliteInvoiceStore;

  beforeEach(async () => {
    store = new SqliteInvoiceStore({ path: ":memory:" });
    await store.createInvoice(makeInvoice({ id: "inv-1", amount: 1_000_000n }));
  });

  afterEach(async () => {
    await store.close();
  });

  const buildEvent =
    (id: string): ((total: bigint) => OutboxEvent) =>
    () => ({
      id,
      eventType: "invoice.partial",
      invoiceId: "inv-1",
      payload: JSON.stringify({ id }),
    });

  it("commits payment + outbox row together", async () => {
    const { total } = store.applyPaymentWithOutbox(
      "inv-1",
      makePayment({ txid: "tx-1", amount: 400_000n }),
      buildEvent("d-1")
    );

    expect(total).toBe(400_000n);
    const invoice = await store.getInvoice("inv-1");
    expect(invoice!.amountReceived).toBe(400_000n);
    expect(invoice!.payments).toHaveLength(1);
    const row = await store.getOutboxRecord("d-1");
    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
  });

  it("rolls BOTH back when the event builder throws mid-tx (neither persists)", () => {
    expect(() =>
      store.applyPaymentWithOutbox(
        "inv-1",
        makePayment({ txid: "tx-boom", amount: 500_000n }),
        () => {
          throw new Error("boom inside tx");
        }
      )
    ).toThrow("boom inside tx");

    // Neither the payment nor the outbox row should exist.
    return Promise.all([
      store.getInvoice("inv-1").then((inv) => {
        expect(inv!.amountReceived).toBe(0n);
        expect(inv!.payments).toHaveLength(0);
      }),
      store.getOutboxRecord("d-boom").then((row) => expect(row).toBeNull()),
    ]);
  });

  it("applyInvoiceUpdateWithOutbox commits status + outbox together", async () => {
    store.applyInvoiceUpdateWithOutbox(
      "inv-1",
      { status: "completed", completedAt: new Date().toISOString() },
      () => ({
        id: "d-complete",
        eventType: "invoice.completed",
        invoiceId: "inv-1",
        payload: "{}",
      })
    );

    const invoice = await store.getInvoice("inv-1");
    expect(invoice!.status).toBe("completed");
    const row = await store.getOutboxRecord("d-complete");
    expect(row!.eventType).toBe("invoice.completed");
  });

  it("better-sqlite3 db.transaction rejects an async fn (no await can interleave)", () => {
    // This is the structural guard behind the atomicity claim: if any apply*
    // method's tx body were made async, better-sqlite3 would throw at call
    // time. We assert that contract directly on the raw db handle.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (store as any).db;
    const asyncTx = db.transaction(async () => {
      /* async body is illegal in better-sqlite3 */
    });
    expect(() => asyncTx()).toThrow();
  });
});
