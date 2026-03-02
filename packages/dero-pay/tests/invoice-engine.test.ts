import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InvoiceEngine } from "../src/server/invoice-engine.js";
import { MemoryInvoiceStore } from "../src/store/memory.js";
import type { Invoice, Payment, InvoiceStatus } from "../src/core/types.js";

// We mock the RPC modules so InvoiceEngine's internal `new WalletRpcClient()`
// and `new DaemonRpcClient()` return our controllable fakes.

const mockWalletInstance = {
  ping: vi.fn().mockResolvedValue(true),
  getAddress: vi.fn().mockResolvedValue("dero1qbase..."),
  getHeight: vi.fn().mockResolvedValue(1000),
  getBalance: vi.fn().mockResolvedValue({ balance: 500_000, unlocked_balance: 500_000 }),
  makeIntegratedAddress: vi.fn().mockResolvedValue("deti1qintegrated..."),
  getTransfers: vi.fn().mockResolvedValue([]),
  getIncomingByPaymentId: vi.fn().mockResolvedValue([]),
  getTransferByTxid: vi.fn().mockResolvedValue({}),
  splitIntegratedAddress: vi.fn().mockResolvedValue({ address: "dero1qbase...", payloadRpc: [] }),
  transfer: vi.fn().mockResolvedValue("tx-001"),
  installSc: vi.fn().mockResolvedValue("sc-001"),
  invokeSc: vi.fn().mockResolvedValue("tx-invoke-001"),
  scinvokeRaw: vi.fn().mockResolvedValue("tx-invoke-raw-001"),
};

const mockDaemonInstance = {
  ping: vi.fn().mockResolvedValue(true),
  getInfo: vi.fn().mockResolvedValue({ topoheight: 1000, stableheight: 990 }),
  getHeight: vi.fn().mockResolvedValue(1000),
  getStableHeight: vi.fn().mockResolvedValue(990),
  getTransactions: vi.fn().mockResolvedValue({ txs_as_hex: [], txs: [], status: "OK" }),
  getSc: vi.fn().mockResolvedValue({ stringkeys: {}, balance: 0, code: "", status: "OK" }),
  getScVariable: vi.fn().mockResolvedValue(undefined),
  getScBalance: vi.fn().mockResolvedValue(0),
  gasEstimate: vi.fn().mockResolvedValue({ gascompute: 100, gasstorage: 50, status: "OK" }),
  isTestnet: vi.fn().mockResolvedValue(false),
};

vi.mock("../src/rpc/wallet-rpc.js", () => ({
  WalletRpcClient: vi.fn().mockImplementation(() => mockWalletInstance),
}));

vi.mock("../src/rpc/daemon-rpc.js", () => ({
  DaemonRpcClient: vi.fn().mockImplementation(() => mockDaemonInstance),
}));

describe("InvoiceEngine", () => {
  let engine: InvoiceEngine;
  let store: MemoryInvoiceStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    store = new MemoryInvoiceStore();
    engine = new InvoiceEngine({
      walletRpcUrl: "http://mock:10103/json_rpc",
      daemonRpcUrl: "http://mock:10102/json_rpc",
      store,
      pollIntervalMs: 100,
      defaultTtlSeconds: 60,
      defaultRequiredConfirmations: 3,
    });
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
    vi.useRealTimers();
  });

  describe("start()", () => {
    it("starts successfully with reachable RPCs", async () => {
      await engine.start();
      expect(engine.running).toBe(true);
      expect(engine.getBaseAddress()).toBe("dero1qbase...");
    });

    it("is idempotent", async () => {
      await engine.start();
      await engine.start();
      expect(engine.running).toBe(true);
    });

    it("throws when wallet RPC is unreachable", async () => {
      mockWalletInstance.ping.mockResolvedValueOnce(false);
      await expect(engine.start()).rejects.toThrow("wallet RPC");
    });

    it("throws when daemon RPC is unreachable", async () => {
      mockDaemonInstance.ping.mockResolvedValueOnce(false);
      await expect(engine.start()).rejects.toThrow("daemon RPC");
    });

    it("resumes tracking active invoices from the store", async () => {
      const invoice: Invoice = {
        id: "inv-active",
        name: "Active",
        description: "",
        amount: 500_000n,
        status: "pending",
        paymentId: 99n,
        integratedAddress: "deti1q...",
        baseAddress: "dero1q...",
        ttlSeconds: 900,
        requiredConfirmations: 3,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        completedAt: null,
        amountReceived: 0n,
        payments: [],
        metadata: {},
        escrow: null,
      };
      await store.createInvoice(invoice);

      await engine.start();
      expect(engine.running).toBe(true);
    });
  });

  describe("stop() / shutdown()", () => {
    it("stops the engine", async () => {
      await engine.start();
      await engine.stop();
      expect(engine.running).toBe(false);
    });

    it("shutdown closes the store", async () => {
      await engine.start();
      await engine.shutdown();
      expect(engine.running).toBe(false);
    });
  });

  describe("createInvoice()", () => {
    it("creates an invoice with correct fields", async () => {
      await engine.start();
      const invoice = await engine.createInvoice({
        name: "Widget",
        amount: 500_000n,
        description: "A test widget",
      });

      expect(invoice.name).toBe("Widget");
      expect(invoice.amount).toBe(500_000n);
      expect(invoice.description).toBe("A test widget");
      expect(invoice.status).toBe("pending");
      expect(invoice.integratedAddress).toBe("deti1qintegrated...");
      expect(invoice.baseAddress).toBe("dero1qbase...");
      expect(invoice.paymentId).toBeTypeOf("bigint");
      expect(invoice.payments).toEqual([]);
      expect(invoice.amountReceived).toBe(0n);
      expect(invoice.escrow).toBeNull();
    });

    it("persists invoice to the store", async () => {
      await engine.start();
      const invoice = await engine.createInvoice({
        name: "Widget",
        amount: 100_000n,
      });

      const retrieved = await engine.getInvoice(invoice.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(invoice.id);
    });

    it("throws if engine not started", async () => {
      await expect(
        engine.createInvoice({ name: "Fail", amount: 100_000n })
      ).rejects.toThrow("not started");
    });

    it("throws for zero amount", async () => {
      await engine.start();
      await expect(
        engine.createInvoice({ name: "Zero", amount: 0n })
      ).rejects.toThrow("positive");
    });

    it("throws for negative amount", async () => {
      await engine.start();
      await expect(
        engine.createInvoice({ name: "Neg", amount: -1n })
      ).rejects.toThrow("positive");
    });

    it("uses custom TTL and confirmations", async () => {
      await engine.start();
      const invoice = await engine.createInvoice({
        name: "Custom",
        amount: 100_000n,
        ttlSeconds: 1800,
        requiredConfirmations: 10,
      });

      expect(invoice.ttlSeconds).toBe(1800);
      expect(invoice.requiredConfirmations).toBe(10);
    });

    it("uses default TTL and confirmations from config", async () => {
      await engine.start();
      const invoice = await engine.createInvoice({
        name: "Default",
        amount: 100_000n,
      });

      expect(invoice.ttlSeconds).toBe(60);
      expect(invoice.requiredConfirmations).toBe(3);
    });

    it("includes metadata", async () => {
      await engine.start();
      const invoice = await engine.createInvoice({
        name: "Meta",
        amount: 100_000n,
        metadata: { orderId: "ORD-123" },
      });

      expect(invoice.metadata).toEqual({ orderId: "ORD-123" });
    });
  });

  describe("getInvoice / getInvoiceByPaymentId / listInvoices", () => {
    it("returns null for nonexistent invoice", async () => {
      await engine.start();
      expect(await engine.getInvoice("nonexistent")).toBeNull();
    });

    it("finds by payment ID", async () => {
      await engine.start();
      const invoice = await engine.createInvoice({
        name: "Find Me",
        amount: 100_000n,
      });

      const found = await engine.getInvoiceByPaymentId(invoice.paymentId);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(invoice.id);
    });

    it("lists all invoices", async () => {
      await engine.start();
      await engine.createInvoice({ name: "A", amount: 100_000n });
      await engine.createInvoice({ name: "B", amount: 200_000n });

      const list = await engine.listInvoices();
      expect(list).toHaveLength(2);
    });
  });

  describe("getStats", () => {
    it("returns stats from the store", async () => {
      await engine.start();
      await engine.createInvoice({ name: "A", amount: 100_000n });
      await engine.createInvoice({ name: "B", amount: 200_000n });

      const stats = await engine.getStats();
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(2);
    });
  });

  describe("getBalance", () => {
    it("returns wallet balance", async () => {
      await engine.start();
      const balance = await engine.getBalance();
      expect(balance.balance).toBe(500_000n);
      expect(balance.unlockedBalance).toBe(500_000n);
    });
  });

  describe("event emission", () => {
    it("emits invoiceStatusChanged when invoice status changes", async () => {
      await engine.start();
      const statusChanged = vi.fn();
      engine.on("invoiceStatusChanged", statusChanged);

      const invoice = await engine.createInvoice({
        name: "Event Test",
        amount: 500_000n,
      });

      // Manually expire it via the store and trigger expiry check
      const pastExpiry = new Date(Date.now() - 10_000).toISOString();
      await store.updateInvoice(invoice.id, {});
      // Overwrite the expiresAt by re-creating
      // Instead, advance timers past the invoice TTL
      await vi.advanceTimersByTimeAsync(61_000); // past 60s TTL

      // The expiry checker runs every 30s, so advance to trigger it
      await vi.advanceTimersByTimeAsync(30_000);

      // Invoice should now be expired
      const updated = await engine.getInvoice(invoice.id);
      expect(updated!.status).toBe("expired");
      expect(statusChanged).toHaveBeenCalled();
    });

    it("returns unsubscribe function", async () => {
      await engine.start();
      const fn = vi.fn();
      const unsub = engine.on("error", fn);
      unsub();
      // No way to trigger error easily, but unsub should not throw
    });
  });

  describe("escrow integration", () => {
    it("returns null escrow manager when escrow disabled", () => {
      expect(engine.getEscrowManager()).toBeNull();
    });

    it("throws escrowAction when no escrow on invoice", async () => {
      await engine.start();
      const invoice = await engine.createInvoice({
        name: "No Escrow",
        amount: 100_000n,
      });

      await expect(
        engine.escrowAction(invoice.id, "confirmDelivery")
      ).rejects.toThrow("no escrow");
    });

    it("throws escrowAction for nonexistent invoice", async () => {
      await engine.start();
      await expect(
        engine.escrowAction("nonexistent", "confirmDelivery")
      ).rejects.toThrow("not found");
    });
  });

  describe("invoice expiry checker", () => {
    it("expires invoices past their TTL", async () => {
      await engine.start();

      const invoice = await engine.createInvoice({
        name: "Will Expire",
        amount: 100_000n,
        ttlSeconds: 10,
      });

      expect(invoice.status).toBe("pending");

      // Advance past TTL + expiry check interval
      await vi.advanceTimersByTimeAsync(11_000);
      await vi.advanceTimersByTimeAsync(30_000);

      const updated = await engine.getInvoice(invoice.id);
      expect(updated!.status).toBe("expired");
    });

    it("does not expire completed invoices", async () => {
      // Pre-seed a completed invoice with an expired TTL in the store.
      // The engine's checkExpiredInvoices should skip it because
      // getActiveInvoices excludes "completed" status.
      const completedInvoice: Invoice = {
        id: "inv-completed",
        name: "Already Done",
        description: "",
        amount: 100_000n,
        status: "completed",
        paymentId: 77n,
        integratedAddress: "deti1q...",
        baseAddress: "dero1q...",
        ttlSeconds: 1,
        requiredConfirmations: 3,
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() - 50_000).toISOString(),
        completedAt: new Date(Date.now() - 30_000).toISOString(),
        amountReceived: 100_000n,
        payments: [],
        metadata: {},
        escrow: null,
      };
      await store.createInvoice(completedInvoice);

      await engine.start();

      // Trigger the 30s expiry check
      await vi.advanceTimersByTimeAsync(31_000);

      const updated = await engine.getInvoice("inv-completed");
      expect(updated!.status).toBe("completed");
    });
  });
});
