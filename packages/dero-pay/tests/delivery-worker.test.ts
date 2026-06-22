import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";
import { WebhookOutbox } from "../src/webhook/outbox.js";
import {
  WebhookDeliveryWorker,
  type DeadLetter,
} from "../src/webhook/delivery-worker.js";
import { makeInvoice, makePayment } from "./helpers.js";
import type { OutboxEvent } from "../src/webhook/outbox-types.js";

/**
 * Delivery worker lifecycle (Step 3): fail->reschedule->deliver, durable
 * backoff across restart, crash-mid-delivery lease reclaim, dead-letter park
 * (never delete), no replay of delivered.
 */
describe("WebhookDeliveryWorker", () => {
  let store: SqliteInvoiceStore;
  let outbox: WebhookOutbox;
  let clock: number;
  const now = () => clock;

  beforeEach(async () => {
    store = new SqliteInvoiceStore({ path: ":memory:" });
    outbox = new WebhookOutbox(store);
    clock = 1_000_000;
    await store.createInvoice(makeInvoice({ id: "inv-1", amount: 1_000_000n }));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await store.close();
  });

  function enqueue(id: string, txid: string) {
    const ev: OutboxEvent = {
      id,
      eventType: "invoice.partial",
      invoiceId: "inv-1",
      payload: JSON.stringify({ id }),
    };
    store.applyPaymentWithOutbox("inv-1", makePayment({ txid, amount: 1n }), () => ev);
  }

  function stubFetch(sequence: number[]) {
    let i = 0;
    const fn = vi.fn(async () => {
      const status = sequence[Math.min(i, sequence.length - 1)];
      i++;
      return { status } as Response;
    });
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  function makeWorker(
    overrides: Partial<ConstructorParameters<typeof WebhookDeliveryWorker>[1]> = {}
  ) {
    return new WebhookDeliveryWorker(outbox, {
      url: "https://merchant.example/hook",
      secret: "shh",
      now,
      jitter: () => 0, // deterministic backoff (min of the jitter window)
      ...overrides,
    });
  }

  it("delivers a pending row on 2xx and marks it delivered", async () => {
    stubFetch([200]);
    enqueue("d-1", "tx-1");
    const worker = makeWorker();

    await worker.tick();

    expect((await outbox.counts()).delivered).toBe(1);
  });

  it("reschedules on failure with durable backoff, then delivers on retry", async () => {
    const fetchFn = stubFetch([500, 200]);
    enqueue("d-1", "tx-1");
    const worker = makeWorker({ baseBackoffMs: 5_000 });

    // First tick: 500 -> reschedule, attempts=1, next_attempt_at in the future.
    await worker.tick();
    let row = await outbox.get("d-1");
    expect(row!.status).toBe("pending");
    expect(row!.attempts).toBe(1);
    // jitter=0 => delay = baseBackoff * 0.5 = 2500
    expect(row!.nextAttemptAt).toBe(clock + 2_500);

    // A tick BEFORE next_attempt_at must NOT pick it up (durable backoff).
    await worker.tick();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Advance the clock past next_attempt_at; now it delivers.
    clock = row!.nextAttemptAt + 1;
    await worker.tick();
    row = await outbox.get("d-1");
    expect(row!.status).toBe("delivered");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("backoff survives a 'restart' (a fresh worker over the same store honors next_attempt_at)", async () => {
    stubFetch([500, 200]);
    enqueue("d-1", "tx-1");

    await makeWorker().tick(); // fail -> reschedule (stored in the row)
    const due = await outbox.get("d-1");
    expect(due!.attempts).toBe(1);

    // Brand-new worker instance (simulates a process restart). Before the
    // stored next_attempt_at, it claims nothing.
    const fresh = makeWorker();
    await fresh.tick();
    expect((await outbox.get("d-1"))!.attempts).toBe(1); // untouched

    // After the stored deadline, it delivers.
    clock = due!.nextAttemptAt + 1;
    await fresh.tick();
    expect((await outbox.get("d-1"))!.status).toBe("delivered");
  });

  it("reclaims a row stuck 'delivering' past its lease (crash mid-delivery)", async () => {
    stubFetch([200]);
    enqueue("d-1", "tx-1");

    // Simulate a crash: the row was claimed (delivering) but never acked, with
    // a lease that has now expired.
    await store.markOutboxDelivered; // no-op ref to keep store in scope
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (store as any).db
      .prepare(
        "UPDATE webhook_outbox SET status='delivering', lease_until=@lease WHERE id='d-1'"
      )
      .run({ lease: clock - 1 }); // lease already expired

    const worker = makeWorker({ leaseMs: 60_000 });
    await worker.tick(); // should reclaim + deliver

    expect((await outbox.get("d-1"))!.status).toBe("delivered");
  });

  it("does NOT reclaim a freshly-leased delivering row (another worker owns it)", async () => {
    stubFetch([200]);
    enqueue("d-1", "tx-1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (store as any).db
      .prepare(
        "UPDATE webhook_outbox SET status='delivering', lease_until=@lease WHERE id='d-1'"
      )
      .run({ lease: clock + 60_000 }); // lease still valid

    await makeWorker().tick();
    expect((await outbox.get("d-1"))!.status).toBe("delivering"); // left alone
  });

  it("parks a row dead after maxAttempts and fires a durable dead-letter (never deletes)", async () => {
    stubFetch([500]); // always fails
    enqueue("d-1", "tx-1");
    const deadLetters: DeadLetter[] = [];
    const worker = makeWorker({
      maxAttempts: 3,
      baseBackoffMs: 1,
      onDeadLetter: (dl) => {
        deadLetters.push(dl);
      },
    });

    // attempts 1,2 reschedule; attempt 3 hits the ceiling -> dead.
    for (let i = 0; i < 3; i++) {
      const row = await outbox.get("d-1");
      if (row && row.status === "pending") clock = Math.max(clock, row.nextAttemptAt + 1);
      await worker.tick();
    }

    const row = await outbox.get("d-1");
    expect(row).not.toBeNull(); // NOT deleted
    expect(row!.status).toBe("dead");
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].id).toBe("d-1");
  });

  it("never re-delivers an already-delivered row", async () => {
    const fetchFn = stubFetch([200]);
    enqueue("d-1", "tx-1");
    const worker = makeWorker();

    await worker.tick();
    await worker.tick(); // second pass finds nothing due
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
