import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";
import { makeInvoice, makePayment } from "./helpers.js";

describe("SqliteInvoiceStore", () => {
  let store: SqliteInvoiceStore;

  beforeEach(() => {
    store = new SqliteInvoiceStore({ path: ":memory:" });
  });

  afterEach(async () => {
    await store.close();
  });

  describe("createInvoice", () => {
    it("stores an invoice", async () => {
      const invoice = makeInvoice();
      await store.createInvoice(invoice);
      const retrieved = await store.getInvoice("inv-001");
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe("inv-001");
      expect(retrieved!.amount).toBe(500_000n);
    });

    it("throws on duplicate ID", async () => {
      await store.createInvoice(makeInvoice());
      await expect(store.createInvoice(makeInvoice())).rejects.toThrow();
    });
  });

  describe("getInvoice", () => {
    it("returns null for missing invoice", async () => {
      expect(await store.getInvoice("nonexistent")).toBeNull();
    });
  });

  describe("getInvoiceByPaymentId", () => {
    it("finds invoice by payment ID", async () => {
      await store.createInvoice(makeInvoice({ paymentId: 99999n }));
      const found = await store.getInvoiceByPaymentId(99999n);
      expect(found).not.toBeNull();
      expect(found!.id).toBe("inv-001");
    });

    it("returns null for unknown payment ID", async () => {
      expect(await store.getInvoiceByPaymentId(11111n)).toBeNull();
    });
  });

  describe("updateInvoice", () => {
    it("updates status", async () => {
      await store.createInvoice(makeInvoice());
      await store.updateInvoice("inv-001", { status: "pending" });
      const updated = await store.getInvoice("inv-001");
      expect(updated!.status).toBe("pending");
    });

    it("updates amountReceived", async () => {
      await store.createInvoice(makeInvoice());
      await store.updateInvoice("inv-001", {
        amountReceived: 200_000n,
      });
      const updated = await store.getInvoice("inv-001");
      expect(updated!.amountReceived).toBe(200_000n);
    });
  });

  describe("addPayment", () => {
    it("adds a payment to an invoice", async () => {
      await store.createInvoice(makeInvoice());
      await store.addPayment("inv-001", makePayment());
      const invoice = await store.getInvoice("inv-001");
      expect(invoice!.payments).toHaveLength(1);
      expect(invoice!.payments[0].txid).toBe("tx-abc123");
      expect(invoice!.amountReceived).toBe(500_000n);
    });

    it("is idempotent for same txid", async () => {
      await store.createInvoice(makeInvoice());
      await store.addPayment("inv-001", makePayment());
      await store.addPayment("inv-001", makePayment());
      const invoice = await store.getInvoice("inv-001");
      expect(invoice!.payments).toHaveLength(1);
      expect(invoice!.amountReceived).toBe(500_000n);
    });

    it("accumulates multiple payments", async () => {
      await store.createInvoice(makeInvoice());
      await store.addPayment(
        "inv-001",
        makePayment({ txid: "tx-1", amount: 200_000n })
      );
      await store.addPayment(
        "inv-001",
        makePayment({ txid: "tx-2", amount: 300_000n })
      );
      const invoice = await store.getInvoice("inv-001");
      expect(invoice!.payments).toHaveLength(2);
      expect(invoice!.amountReceived).toBe(500_000n);
    });
  });

  describe("updatePayment", () => {
    it("updates confirmation count", async () => {
      await store.createInvoice(makeInvoice());
      await store.addPayment("inv-001", makePayment());
      await store.updatePayment("inv-001", "tx-abc123", {
        confirmations: 5,
        status: "confirmed",
      });
      const invoice = await store.getInvoice("inv-001");
      expect(invoice!.payments[0].confirmations).toBe(5);
      expect(invoice!.payments[0].status).toBe("confirmed");
    });
  });

  describe("listInvoices", () => {
    it("returns all invoices sorted newest first", async () => {
      const now = Date.now();
      await store.createInvoice(
        makeInvoice({ id: "old", createdAt: new Date(now - 1000).toISOString() })
      );
      await store.createInvoice(
        makeInvoice({
          id: "new",
          paymentId: 99n,
          createdAt: new Date(now).toISOString(),
        })
      );
      const list = await store.listInvoices();
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe("new");
      expect(list[1].id).toBe("old");
    });

    it("filters by status", async () => {
      await store.createInvoice(makeInvoice({ id: "a", paymentId: 1n }));
      await store.createInvoice(
        makeInvoice({ id: "b", paymentId: 2n, status: "completed" })
      );
      const list = await store.listInvoices({ status: "created" });
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("a");
    });

    it("filters by multiple statuses", async () => {
      await store.createInvoice(
        makeInvoice({ id: "a", paymentId: 1n, status: "created" })
      );
      await store.createInvoice(
        makeInvoice({ id: "b", paymentId: 2n, status: "pending" })
      );
      await store.createInvoice(
        makeInvoice({ id: "c", paymentId: 3n, status: "completed" })
      );
      const list = await store.listInvoices({
        status: ["created", "pending"],
      });
      expect(list).toHaveLength(2);
    });

    it("supports limit and offset", async () => {
      for (let i = 0; i < 5; i++) {
        await store.createInvoice(
          makeInvoice({
            id: `inv-${i}`,
            paymentId: BigInt(i + 1),
            createdAt: new Date(Date.now() + i * 1000).toISOString(),
          })
        );
      }
      const page = await store.listInvoices({ limit: 2, offset: 1 });
      expect(page).toHaveLength(2);
    });
  });

  describe("getActiveInvoices", () => {
    it("returns only active invoices", async () => {
      await store.createInvoice(
        makeInvoice({ id: "a", paymentId: 1n, status: "created" })
      );
      await store.createInvoice(
        makeInvoice({ id: "b", paymentId: 2n, status: "pending" })
      );
      await store.createInvoice(
        makeInvoice({ id: "c", paymentId: 3n, status: "completed" })
      );
      await store.createInvoice(
        makeInvoice({ id: "d", paymentId: 4n, status: "expired" })
      );
      const active = await store.getActiveInvoices();
      expect(active).toHaveLength(2);
      const ids = active.map((i) => i.id).sort();
      expect(ids).toEqual(["a", "b"]);
    });
  });

  describe("getStats", () => {
    it("returns correct counts and totals", async () => {
      await store.createInvoice(
        makeInvoice({
          id: "a",
          paymentId: 1n,
          status: "completed",
          amountReceived: 500_000n,
        })
      );
      await store.createInvoice(
        makeInvoice({
          id: "b",
          paymentId: 2n,
          status: "completed",
          amountReceived: 300_000n,
        })
      );
      await store.createInvoice(
        makeInvoice({ id: "c", paymentId: 3n, status: "expired" })
      );

      const stats = await store.getStats();
      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(2);
      expect(stats.expired).toBe(1);
      expect(stats.created).toBe(0);
      expect(stats.totalAmountReceived).toBe(800_000n);
    });
  });

  describe("escrow data", () => {
    it("stores and retrieves escrow data on an invoice", async () => {
      const invoice = makeInvoice({
        escrow: {
          scid: "sc-123",
          deployTxid: "sc-123",
          escrowStatus: "awaiting_deposit",
          sellerAddress: "dero1qseller...",
          arbitratorAddress: "dero1qarbitrator...",
          feeBasisPoints: 250,
          blockExpiration: 60,
          buyerAddress: null,
          depositHeight: null,
          disputedAt: null,
          resolution: null,
        },
      });
      await store.createInvoice(invoice);

      const retrieved = await store.getInvoice("inv-001");
      expect(retrieved!.escrow).not.toBeNull();
      expect(retrieved!.escrow!.scid).toBe("sc-123");
      expect(retrieved!.escrow!.escrowStatus).toBe("awaiting_deposit");
    });

    it("handles null escrow", async () => {
      await store.createInvoice(makeInvoice({ escrow: null }));
      const retrieved = await store.getInvoice("inv-001");
      expect(retrieved!.escrow).toBeNull();
    });
  });

  describe("metadata", () => {
    it("stores and retrieves metadata", async () => {
      const invoice = makeInvoice({
        metadata: { orderId: "ORD-123", customer: "John" },
      });
      await store.createInvoice(invoice);

      const retrieved = await store.getInvoice("inv-001");
      expect(retrieved!.metadata).toEqual({ orderId: "ORD-123", customer: "John" });
    });
  });

  describe("close", () => {
    it("closes the database connection", async () => {
      await store.createInvoice(makeInvoice());
      await store.close();
      // Accessing after close should throw
      await expect(store.getInvoice("inv-001")).rejects.toThrow();
    });
  });
});
