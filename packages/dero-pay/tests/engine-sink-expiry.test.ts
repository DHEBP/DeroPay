import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InvoiceEngine } from "../src/server/invoice-engine.js";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";
import { OutboxWebhookSink } from "../src/webhook/outbox-sink.js";
import { WebhookOutbox } from "../src/webhook/outbox.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

/**
 * Bug 2 regression: the engine's own 30s expiry sweep (checkExpiredInvoices)
 * must route through the durable outbox in sink mode, NOT the bare
 * store.updateInvoice (which would set status=expired with no outbox row and a
 * null webhook — a silently dropped terminal notification). It must also be
 * payment-aware (never expire a funded invoice).
 */
describe("engine expiry sweep in sink mode", () => {
  let store: SqliteInvoiceStore;
  let outbox: WebhookOutbox;
  let engine: InvoiceEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new SqliteInvoiceStore({ path: ":memory:" });
    outbox = new WebhookOutbox(store);
    const sink = new OutboxWebhookSink(store);
    engine = new InvoiceEngine({
      walletRpc: createMockWalletRpc({
        getAddress: vi.fn().mockResolvedValue("dero1qbase..."),
        getHeight: vi.fn().mockResolvedValue(1000),
      }) as unknown as WalletRpcClient,
      daemonRpc: createMockDaemonRpc() as unknown as DaemonRpcClient,
      store,
      webhookSink: sink,
      pollIntervalMs: 100,
    });
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
    vi.useRealTimers();
    await store.close();
  });

  it("enqueues a durable invoice.expired through the outbox, not a bare update", async () => {
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "Will Expire",
      amount: 100_000n,
      ttlSeconds: 10,
    });
    expect(invoice.status).toBe("pending");

    await vi.advanceTimersByTimeAsync(11_000); // past TTL
    await vi.advanceTimersByTimeAsync(30_000); // trigger the 30s sweep

    const updated = await engine.getInvoice(invoice.id);
    expect(updated!.status).toBe("expired");

    // The fix: a durable outbox row exists for the expiry (it would be ZERO
    // before the fix, because the sweep called the bare store.updateInvoice).
    const counts = await outbox.counts();
    expect(counts.pending + counts.delivering + counts.delivered + counts.dead).toBeGreaterThanOrEqual(1);
  });

  it("does NOT expire a funded invoice (payment-aware)", async () => {
    await engine.start();
    const invoice = await engine.createInvoice({
      name: "Funded",
      amount: 100_000n,
      ttlSeconds: 10,
    });
    // Simulate a partial payment landing before TTL.
    store.applyPaymentWithOutbox(
      invoice.id,
      {
        txid: "tx-1",
        amount: 40_000n,
        height: 990,
        topoHeight: 990,
        confirmations: 1,
        status: "detected",
        detectedAt: new Date().toISOString(),
        destinationPort: invoice.paymentId,
      },
      () => null // no event needed for this test
    );

    await vi.advanceTimersByTimeAsync(11_000);
    await vi.advanceTimersByTimeAsync(30_000);

    const updated = await engine.getInvoice(invoice.id);
    expect(updated!.status).not.toBe("expired"); // funded => not expired
  });
});
