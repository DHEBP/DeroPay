import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";
import { unlinkSync } from "node:fs";

describe("SqliteInvoiceStore - x402 quotas", () => {
  const dbPath = "tests/integration/test-quotas.db";
  let store: SqliteInvoiceStore;

  beforeEach(() => {
    try {
      unlinkSync(dbPath);
    } catch {
      // ignore
    }
    store = new SqliteInvoiceStore({ path: dbPath });
  });

  afterEach(async () => {
    await store.close();
    try {
      unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  it("enforces maxReceipts limit", async () => {
    const reservation = {
      resource: "/api/test",
      windowKey: "receipts:/api/test:window1",
      windowStart: new Date().toISOString(),
      windowEnd: new Date(Date.now() + 60000).toISOString(),
      amountAtomic: 0n,
      maxReceipts: 2,
    };

    // First use
    const res1 = await store.reserveX402Usage!(reservation);
    expect(res1.allowed).toBe(true);
    expect(res1.receiptCount).toBe(1);

    // Second use
    const res2 = await store.reserveX402Usage!(reservation);
    expect(res2.allowed).toBe(true);
    expect(res2.receiptCount).toBe(2);

    // Third use (should fail)
    const res3 = await store.reserveX402Usage!(reservation);
    expect(res3.allowed).toBe(false);
    expect(res3.receiptCount).toBe(2);
  });

  it("enforces maxAmountAtomic limit", async () => {
    const reservation = {
      resource: "/api/test",
      windowKey: "amount:/api/test:window1",
      windowStart: new Date().toISOString(),
      windowEnd: new Date(Date.now() + 60000).toISOString(),
      amountAtomic: 500n,
      maxAmountAtomic: 1000n,
    };

    // First use (500)
    const res1 = await store.reserveX402Usage!(reservation);
    expect(res1.allowed).toBe(true);
    expect(res1.totalAmountAtomic).toBe(500n);

    // Second use (500 -> 1000)
    const res2 = await store.reserveX402Usage!(reservation);
    expect(res2.allowed).toBe(true);
    expect(res2.totalAmountAtomic).toBe(1000n);

    // Third use (500 -> 1500, should fail)
    const res3 = await store.reserveX402Usage!(reservation);
    expect(res3.allowed).toBe(false);
    expect(res3.totalAmountAtomic).toBe(1000n);
  });

  it("enforces batch reservations atomically", async () => {
    const reservations = [
      {
        resource: "/api/test",
        windowKey: "receipts:/api/test:batch1",
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 60000).toISOString(),
        amountAtomic: 0n,
        maxReceipts: 2,
      },
      {
        resource: "/api/test",
        windowKey: "amount:/api/test:batch1",
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 60000).toISOString(),
        amountAtomic: 500n,
        maxAmountAtomic: 1000n,
      },
    ];

    // First use
    const res1 = await store.reserveX402UsageBatch!(reservations);
    expect(res1.allowed).toBe(true);
    expect(res1.results[0].receiptCount).toBe(1);
    expect(res1.results[1].totalAmountAtomic).toBe(500n);

    // Second use
    const res2 = await store.reserveX402UsageBatch!(reservations);
    expect(res2.allowed).toBe(true);
    expect(res2.results[0].receiptCount).toBe(2);
    expect(res2.results[1].totalAmountAtomic).toBe(1000n);

    // Third use (should fail both limits)
    const res3 = await store.reserveX402UsageBatch!(reservations);
    expect(res3.allowed).toBe(false);
    expect(res3.results[0].allowed).toBe(false);
    expect(res3.results[0].receiptCount).toBe(2);
    expect(res3.results[1].allowed).toBe(false);
    expect(res3.results[1].totalAmountAtomic).toBe(1000n);

    // Verify state didn't change
    const res4 = await store.reserveX402UsageBatch!([
      { ...reservations[0], maxReceipts: 3 }, // Relax first limit
      reservations[1], // Keep second limit tight
    ]);
    expect(res4.allowed).toBe(false); // Fails because second limit is still tight
    expect(res4.results[0].receiptCount).toBe(2); // State didn't advance
  });
});
