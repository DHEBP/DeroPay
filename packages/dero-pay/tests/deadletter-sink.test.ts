import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";
import { WebhookOutbox } from "../src/webhook/outbox.js";
import { WebhookDeliveryWorker } from "../src/webhook/delivery-worker.js";
import { writeHeartbeat, readHeartbeat, evaluateHealth } from "../src/bridge/health.js";
import { makeInvoice, makePayment } from "./helpers.js";
import { vi } from "vitest";

/**
 * Dead-letters must be DURABLE, never a dropped in-memory emit (invariant /
 * O20-adjacent). A parked 'dead' row survives in the store, and the heartbeat
 * surfaces the count so `status` reports unhealthy.
 */
describe("durable dead-letter reaches the heartbeat", () => {
  let store: SqliteInvoiceStore;
  let outbox: WebhookOutbox;
  let clock: number;
  let hbPath: string;

  beforeEach(async () => {
    store = new SqliteInvoiceStore({ path: ":memory:" });
    outbox = new WebhookOutbox(store);
    clock = 2_000_000;
    hbPath = `/tmp/deropay-test-hb-${process.pid}-${clock}.json`;
    await store.createInvoice(makeInvoice({ id: "inv-1", amount: 1_000_000n }));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await store.close();
  });

  it("a webhook that exhausts retries is parked dead AND fires a durable callback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 500 }) as Response));
    store.applyPaymentWithOutbox("inv-1", makePayment({ txid: "tx-1", amount: 1n }), () => ({
      id: "d-1",
      eventType: "invoice.partial",
      invoiceId: "inv-1",
      payload: "{}",
    }));

    const deadIds: string[] = [];
    const worker = new WebhookDeliveryWorker(outbox, {
      url: "https://merchant.example/hook",
      secret: "s",
      maxAttempts: 2,
      baseBackoffMs: 1,
      now: () => clock,
      jitter: () => 0,
      onDeadLetter: (dl) => {
        deadIds.push(dl.id);
      },
    });

    // attempt 1 reschedules, attempt 2 hits the ceiling -> dead + callback.
    await worker.tick();
    const r = await outbox.get("d-1");
    if (r?.status === "pending") clock = r.nextAttemptAt + 1;
    await worker.tick();

    // Durable: the row is still there, parked dead (never deleted).
    const dead = await outbox.get("d-1");
    expect(dead!.status).toBe("dead");
    expect(deadIds).toEqual(["d-1"]);

    // The heartbeat reflects the store's dead count, so `status` => unhealthy.
    const counts = await outbox.counts();
    writeHeartbeat(hbPath, {
      ts: new Date(clock).toISOString(),
      epochMs: clock,
      pid: process.pid,
      deadLetters: counts.dead,
      pending: counts.pending,
      delivering: counts.delivering,
    });

    const hb = readHeartbeat(hbPath);
    expect(hb!.deadLetters).toBe(1);
    const health = evaluateHealth(hb, clock, 60_000);
    expect(health.healthy).toBe(false);
    expect(health.reason).toMatch(/dead-lettered/);
  });
});
