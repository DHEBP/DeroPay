import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PaymentMonitor } from "../src/monitor/payment-monitor.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import { makeInvoice, makeTransferEntry } from "./helpers.js";
import type { Invoice } from "../src/core/types.js";

function createMonitor(
  walletOverrides = {},
  daemonOverrides = {},
  pollIntervalMs = 100
) {
  const walletRpc = createMockWalletRpc(walletOverrides);
  const daemonRpc = createMockDaemonRpc(daemonOverrides);
  const monitor = new PaymentMonitor({
    walletRpc: walletRpc as any,
    daemonRpc: daemonRpc as any,
    pollIntervalMs,
  });
  return { monitor, walletRpc, daemonRpc };
}

describe("PaymentMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("track / untrack", () => {
    it("increments trackedCount when tracking", async () => {
      const { monitor } = createMonitor();
      expect(monitor.trackedCount).toBe(0);
      await monitor.track(makeInvoice({ id: "inv-1" }));
      expect(monitor.trackedCount).toBe(1);
      await monitor.track(makeInvoice({ id: "inv-2", paymentId: 99n }));
      expect(monitor.trackedCount).toBe(2);
    });

    it("decrements trackedCount when untracking", async () => {
      const { monitor } = createMonitor();
      await monitor.track(makeInvoice({ id: "inv-1" }));
      monitor.untrack("inv-1");
      expect(monitor.trackedCount).toBe(0);
    });
  });

  describe("start / stop", () => {
    it("starts and stops the polling loop", async () => {
      const { monitor } = createMonitor();
      expect(monitor.running).toBe(false);
      monitor.start();
      expect(monitor.running).toBe(true);
      monitor.stop();
      expect(monitor.running).toBe(false);
    });

    it("is idempotent on start", async () => {
      const { monitor } = createMonitor();
      monitor.start();
      monitor.start();
      expect(monitor.running).toBe(true);
      monitor.stop();
    });
  });

  describe("payment detection", () => {
    it("emits paymentDetected when a new transfer appears", async () => {
      const entry = makeTransferEntry({ txid: "tx-new-1", amount: 500_000 });
      const { monitor, walletRpc, daemonRpc } = createMonitor({
        getIncomingByPaymentId: vi.fn().mockResolvedValue([entry]),
      });

      const detected = vi.fn();
      monitor.on("paymentDetected", detected);

      const invoice = makeInvoice({ id: "inv-1", status: "pending" });
      await monitor.track(invoice);
      monitor.start();

      await vi.advanceTimersByTimeAsync(1);

      expect(detected).toHaveBeenCalledOnce();
      expect(detected.mock.calls[0][0]).toBe("inv-1");
      expect(detected.mock.calls[0][1].txid).toBe("tx-new-1");
      expect(detected.mock.calls[0][1].amount).toBe(500_000n);

      monitor.stop();
    });

    it("does not re-emit for already-seen TXIDs", async () => {
      const entry = makeTransferEntry({ txid: "tx-dup", amount: 500_000 });
      const { monitor } = createMonitor({
        getIncomingByPaymentId: vi.fn().mockResolvedValue([entry]),
      });

      const detected = vi.fn();
      monitor.on("paymentDetected", detected);

      await monitor.track(makeInvoice({ id: "inv-1", status: "pending" }));
      monitor.start();

      await vi.advanceTimersByTimeAsync(1);
      expect(detected).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(100);
      expect(detected).toHaveBeenCalledOnce();

      monitor.stop();
    });

    it("skips invoices already in payments list (pre-seeded)", async () => {
      const entry = makeTransferEntry({ txid: "tx-preseen", amount: 500_000 });
      const { monitor } = createMonitor({
        getIncomingByPaymentId: vi.fn().mockResolvedValue([entry]),
      });

      const detected = vi.fn();
      monitor.on("paymentDetected", detected);

      const invoice = makeInvoice({
        id: "inv-1",
        status: "pending",
        payments: [
          {
            txid: "tx-preseen",
            amount: 500_000n,
            height: 100,
            topoHeight: 100,
            confirmations: 1,
            status: "confirming",
            detectedAt: new Date().toISOString(),
            destinationPort: 12345n,
          },
        ],
      });
      await monitor.track(invoice);
      monitor.start();

      await vi.advanceTimersByTimeAsync(1);
      expect(detected).not.toHaveBeenCalled();

      monitor.stop();
    });
  });

  describe("payment confirmation", () => {
    it("emits paymentConfirmed when confirmations reach threshold", async () => {
      const entry = makeTransferEntry({ txid: "tx-conf", amount: 500_000, topoheight: 990 });

      let daemonHeight = 990;
      const { monitor } = createMonitor(
        { getIncomingByPaymentId: vi.fn().mockResolvedValue([entry]) },
        { getHeight: vi.fn().mockImplementation(() => Promise.resolve(daemonHeight)) }
      );

      const detected = vi.fn();
      const confirmed = vi.fn();
      monitor.on("paymentDetected", detected);
      monitor.on("paymentConfirmed", confirmed);

      const invoice = makeInvoice({
        id: "inv-1",
        status: "pending",
        requiredConfirmations: 3,
      });
      await monitor.track(invoice);
      monitor.start();

      // First poll: topoheight 990, entry at 990 => 1 confirmation
      await vi.advanceTimersByTimeAsync(1);
      expect(detected).toHaveBeenCalledOnce();
      // Payment detected with status "confirming" (1 < 3)
      expect(detected.mock.calls[0][1].status).toBe("confirming");

      // Advance daemon height so confirmations = 3 (992 - 990 + 1 = 3)
      daemonHeight = 992;

      // Update the invoice's payments so checkConfirmationUpdates can find confirming ones
      const updatedInvoice = makeInvoice({
        id: "inv-1",
        status: "pending",
        requiredConfirmations: 3,
        amountReceived: 500_000n,
        payments: [
          {
            txid: "tx-conf",
            amount: 500_000n,
            height: 100,
            topoHeight: 990,
            confirmations: 1,
            status: "confirming",
            detectedAt: new Date().toISOString(),
            destinationPort: 12345n,
          },
        ],
      });
      monitor.updateInvoice(updatedInvoice);

      await vi.advanceTimersByTimeAsync(100);
      expect(confirmed).toHaveBeenCalled();
      expect(confirmed.mock.calls[0][1].confirmations).toBe(3);

      monitor.stop();
    });
  });

  describe("invoice completion", () => {
    it("emits invoiceCompleted when full amount is confirmed on first detection", async () => {
      const entry = makeTransferEntry({
        txid: "tx-full",
        amount: 500_000,
        topoheight: 990,
      });

      const { monitor } = createMonitor(
        { getIncomingByPaymentId: vi.fn().mockResolvedValue([entry]) },
        { getHeight: vi.fn().mockResolvedValue(993) } // 993 - 990 + 1 = 4 >= 3
      );

      const completed = vi.fn();
      monitor.on("invoiceCompleted", completed);

      const invoice = makeInvoice({
        id: "inv-1",
        amount: 500_000n,
        status: "pending",
        requiredConfirmations: 3,
      });
      await monitor.track(invoice);
      monitor.start();

      await vi.advanceTimersByTimeAsync(1);
      expect(completed).toHaveBeenCalledWith("inv-1");

      monitor.stop();
    });
  });

  describe("invoice expiry", () => {
    it("emits invoiceExpired when invoice is past expiry", async () => {
      const { monitor } = createMonitor();

      const expired = vi.fn();
      monitor.on("invoiceExpired", expired);

      const invoice = makeInvoice({
        id: "inv-exp",
        status: "pending",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      await monitor.track(invoice);
      monitor.start();

      await vi.advanceTimersByTimeAsync(1);
      expect(expired).toHaveBeenCalledWith("inv-exp");

      monitor.stop();
    });

    it("does not expire already completed invoices", async () => {
      const { monitor } = createMonitor();

      const expired = vi.fn();
      monitor.on("invoiceExpired", expired);

      const invoice = makeInvoice({
        id: "inv-done",
        status: "completed",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      await monitor.track(invoice);
      monitor.start();

      await vi.advanceTimersByTimeAsync(1);
      expect(expired).not.toHaveBeenCalled();

      monitor.stop();
    });
  });

  describe("partial payment", () => {
    it("emits invoicePartial when payment is less than invoice amount", async () => {
      const entry = makeTransferEntry({ txid: "tx-partial", amount: 200_000 });

      const { monitor } = createMonitor({
        getIncomingByPaymentId: vi.fn().mockResolvedValue([entry]),
      });

      const partial = vi.fn();
      monitor.on("invoicePartial", partial);

      const invoice = makeInvoice({
        id: "inv-1",
        amount: 500_000n,
        status: "pending",
      });
      await monitor.track(invoice);
      monitor.start();

      await vi.advanceTimersByTimeAsync(1);
      expect(partial).toHaveBeenCalledWith("inv-1", 200_000n);

      monitor.stop();
    });
  });

  describe("error handling", () => {
    it("emits error when daemon height fetch fails", async () => {
      const { monitor } = createMonitor(
        {},
        { getHeight: vi.fn().mockRejectedValue(new Error("daemon down")) }
      );

      const errorFn = vi.fn();
      monitor.on("error", errorFn);

      await monitor.track(makeInvoice({ id: "inv-1", status: "pending" }));
      monitor.start();

      await vi.advanceTimersByTimeAsync(1);
      expect(errorFn).toHaveBeenCalled();
      expect(errorFn.mock.calls[0][0].message).toContain("daemon height");

      monitor.stop();
    });

    it("emits error when wallet query fails for specific invoice", async () => {
      const { monitor } = createMonitor({
        getIncomingByPaymentId: vi.fn().mockRejectedValue(new Error("wallet error")),
      });

      const errorFn = vi.fn();
      monitor.on("error", errorFn);

      await monitor.track(makeInvoice({ id: "inv-1", status: "pending" }));
      monitor.start();

      await vi.advanceTimersByTimeAsync(1);
      expect(errorFn).toHaveBeenCalled();
      expect(errorFn.mock.calls[0][0].message).toContain("inv-1");

      monitor.stop();
    });
  });

  describe("updateInvoice", () => {
    it("updates the tracked invoice reference", async () => {
      const { monitor } = createMonitor({
        getIncomingByPaymentId: vi.fn().mockResolvedValue([]),
      });

      const invoice = makeInvoice({ id: "inv-1", status: "pending" });
      await monitor.track(invoice);

      const updated = makeInvoice({ id: "inv-1", status: "confirming" });
      monitor.updateInvoice(updated);

      // No assertion on internal state—this just verifies no crash
      expect(monitor.trackedCount).toBe(1);
    });
  });

  describe("no-op when empty", () => {
    it("does nothing when no invoices are tracked", async () => {
      const { monitor, daemonRpc } = createMonitor();

      monitor.start();
      await vi.advanceTimersByTimeAsync(100);

      // Daemon height should not even be queried if no invoices tracked
      expect(daemonRpc.getHeight).not.toHaveBeenCalled();

      monitor.stop();
    });
  });

  describe("event unsubscribe", () => {
    it("stops receiving events after unsubscribe", async () => {
      const entry = makeTransferEntry({ txid: "tx-unsub" });
      const { monitor } = createMonitor({
        getIncomingByPaymentId: vi.fn().mockResolvedValue([entry]),
      });

      const detected = vi.fn();
      const unsub = monitor.on("paymentDetected", detected);
      unsub();

      await monitor.track(makeInvoice({ id: "inv-1", status: "pending" }));
      monitor.start();

      await vi.advanceTimersByTimeAsync(1);
      expect(detected).not.toHaveBeenCalled();

      monitor.stop();
    });
  });
});
