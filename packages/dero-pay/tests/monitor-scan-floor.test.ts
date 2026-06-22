import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PaymentMonitor } from "../src/monitor/payment-monitor.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import { makeInvoice, makePayment } from "./helpers.js";

/**
 * Restart scan-floor correctness (O35/O32, invariant 10).
 *
 * `min_height` filters TransferEntry.height (BLOCK height). The floor must be
 * anchored at/below an invoice's earliest KNOWN payment block height — never
 * re-anchored to the live current height — so a payment that landed during
 * downtime is always re-scanned on restart.
 */
describe("PaymentMonitor scan floor never re-anchors above a known payment", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(walletOverrides = {}) {
    const walletRpc = createMockWalletRpc(walletOverrides);
    const daemonRpc = createMockDaemonRpc();
    const monitor = new PaymentMonitor({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletRpc: walletRpc as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      daemonRpc: daemonRpc as any,
      pollIntervalMs: 100,
    });
    return { monitor, walletRpc, daemonRpc };
  }

  it("anchors the floor BELOW a known payment height on re-track, not at current height", async () => {
    // Simulate restart after long downtime: current height is far ahead (5000)
    // but the invoice already has a payment that landed at block 100.
    const { monitor, walletRpc } = setup({
      getHeight: vi.fn().mockResolvedValue(5000),
    });

    const invoice = makeInvoice({
      id: "inv-1",
      status: "confirming",
      payments: [makePayment({ txid: "tx-1", height: 100, amount: 500_000n })],
    });

    await monitor.track(invoice);
    monitor.start();
    await vi.advanceTimersByTimeAsync(150); // let one poll run

    // The floor passed to GetTransfers must be <= the payment's block height
    // (100 - reorg buffer = 95), NOT current-height-derived (~4995).
    const call = walletRpc.getIncomingByPaymentId.mock.calls[0];
    expect(call).toBeDefined();
    const minHeight = call[1] as number;
    expect(minHeight).toBe(95);
    expect(minHeight).toBeLessThan(100); // below the payment — it gets re-scanned

    monitor.stop();
  });

  it("anchors a fresh (no-payment) invoice at current block height minus buffer", async () => {
    const { monitor, walletRpc } = setup({
      getHeight: vi.fn().mockResolvedValue(1000),
    });

    await monitor.track(makeInvoice({ id: "inv-2", payments: [] }));
    monitor.start();
    await vi.advanceTimersByTimeAsync(150);

    const minHeight = walletRpc.getIncomingByPaymentId.mock.calls[0][1] as number;
    expect(minHeight).toBe(995); // 1000 - 5
    monitor.stop();
  });

  it("clamps the floor at 0 (never negative)", async () => {
    const { monitor, walletRpc } = setup({
      getHeight: vi.fn().mockResolvedValue(3),
    });
    await monitor.track(makeInvoice({ id: "inv-3", payments: [] }));
    monitor.start();
    await vi.advanceTimersByTimeAsync(150);
    expect(walletRpc.getIncomingByPaymentId.mock.calls[0][1]).toBe(0);
    monitor.stop();
  });
});
