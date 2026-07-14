import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";
import { WebhookOutbox } from "../src/webhook/outbox.js";
import { WebhookDeliveryWorker } from "../src/webhook/delivery-worker.js";
import { makeInvoice, makePayment } from "./helpers.js";

/**
 * Restart survivability: a new process (fresh store handle over the same file)
 * re-delivers ONLY undelivered rows — never replays delivered ones — and the
 * durable rows (incl. backoff state) survive the restart.
 */
describe("restart re-delivers only undelivered outbox rows", () => {
  let dir: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("a delivered row is not re-sent after restart; an undelivered one is", async () => {
    dir = mkdtempSync(join(tmpdir(), "deropay-restart-"));
    const path = join(dir, "store.db");

    // --- Process 1: enqueue two events, deliver only the first. ---
    let store = new SqliteInvoiceStore({ path });
    await store.createInvoice(makeInvoice({ id: "inv-1", amount: 1_000_000n }));
    store.applyPaymentWithOutbox("inv-1", makePayment({ txid: "tx-1", amount: 1n }), () => ({
      id: "d-delivered",
      eventType: "invoice.partial",
      invoiceId: "inv-1",
      payload: "{}",
    }));
    store.applyInvoiceUpdateWithOutbox("inv-1", { status: "partial" }, () => ({
      id: "d-undelivered",
      eventType: "invoice.partial",
      invoiceId: "inv-1",
      payload: "{}",
    }));

    let clock = 3_000_000;
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200 }) as Response));
    const outbox1 = new WebhookOutbox(store);
    // Manually mark the first delivered, leave the second pending.
    await outbox1.markDelivered("d-delivered", clock);
    await store.close();

    // --- Process 2: a brand-new worker over the SAME file. ---
    store = new SqliteInvoiceStore({ path });
    const outbox2 = new WebhookOutbox(store);
    const sent: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
        sent.push(init.headers["X-DeroPay-Delivery"]);
        return { status: 200 } as Response;
      })
    );
    const worker = new WebhookDeliveryWorker(outbox2, {
      url: "https://merchant.example/hook",
      secret: "s",
      now: () => clock,
    });

    await worker.tick();

    // Only the undelivered row was sent; the delivered one was not replayed.
    expect(sent).toEqual(["d-undelivered"]);
    expect((await outbox2.get("d-delivered"))!.status).toBe("delivered");
    expect((await outbox2.get("d-undelivered"))!.status).toBe("delivered");
    await store.close();
  });
});
