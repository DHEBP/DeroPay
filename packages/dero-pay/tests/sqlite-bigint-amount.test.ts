import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteInvoiceStore } from "../src/store/sqlite.js";
import { makeInvoice, makePayment } from "./helpers.js";

/**
 * Regression for O3/O4/O26/O37: amount columns are TEXT holding the full
 * atomic-unit value and must be summed in app-side bigint, never via
 * SUM(CAST(... AS INTEGER)).
 *
 * SQLite INTEGER is a signed 64-bit int (CAST clamps > 2^63) AND the Database
 * here sets no `safeIntegers`, so an aggregate > 2^53 is rounded to a double
 * BEFORE BigInt() ever runs. Both addPayment (the decision path) and getStats
 * (analytics) previously read through SUM(CAST), so both could corrupt the
 * total. These tests pin the exact round-trip.
 */

// Above 2^53 (where a JS double can no longer represent every integer), so a
// rounding bug shows up as a wrong-by-one (or more) total, not a clamp.
const BIG_A = 9_007_199_254_740_993n; // 2^53 + 1, not exactly representable as a double
const BIG_B = 9_007_199_254_740_995n; // 2^53 + 3

describe("sqlite amount columns are bigint-exact (O37)", () => {
  let store: SqliteInvoiceStore;

  beforeEach(() => {
    store = new SqliteInvoiceStore({ path: ":memory:" });
  });

  afterEach(async () => {
    await store.close();
  });

  it("addPayment sums payments in exact bigint, not a rounded SUM(CAST)", async () => {
    const invoice = makeInvoice({
      id: "inv-big",
      amount: BIG_A + BIG_B,
      amountReceived: 0n,
    });
    await store.createInvoice(invoice);

    await store.addPayment(
      "inv-big",
      makePayment({ txid: "tx-1", amount: BIG_A })
    );
    await store.addPayment(
      "inv-big",
      makePayment({ txid: "tx-2", amount: BIG_B })
    );

    const got = await store.getInvoice("inv-big");
    expect(got).not.toBeNull();
    // Exact bigint sum — a SUM(CAST) double-round would land off by >= 1 here.
    expect(got!.amountReceived).toBe(BIG_A + BIG_B);
  });

  it("getStats totals amount_received in exact bigint across invoices", async () => {
    const a = makeInvoice({ id: "inv-a", paymentId: 111n, amountReceived: BIG_A });
    const b = makeInvoice({ id: "inv-b", paymentId: 222n, amountReceived: BIG_B });
    await store.createInvoice(a);
    await store.createInvoice(b);

    const stats = await store.getStats();
    expect(stats.totalAmountReceived).toBe(BIG_A + BIG_B);
  });
});
