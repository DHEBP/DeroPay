import { test, expect, beforeEach } from "bun:test";
import { ReceiptStore } from "../src/receipts/store";

let store: ReceiptStore;
beforeEach(() => {
  store = new ReceiptStore(":memory:");
});

test("ReceiptStore.lookup returns null for unseen payload hash", () => {
  expect(store.lookup("hash-1")).toBeNull();
});

test("ReceiptStore.put then lookup returns the receipt", () => {
  store.put("hash-1", { transaction: "tx-1", network: "dero-mainnet", payer: "p", signed: "s" });
  expect(store.lookup("hash-1")).toEqual({
    transaction: "tx-1",
    network: "dero-mainnet",
    payer: "p",
    signed: "s",
  });
});

test("ReceiptStore.put upserts — a re-settle after expiry replaces the stale receipt", () => {
  // The store no longer freezes the first record: once a receipt expires,
  // settle.ts re-signs and re-puts a FRESH one on the same canonical hash. The
  // one-time-use guard (consumer side), not this row, is what prevents a double
  // unlock — so the store must let the new receipt overwrite the dead one.
  store.put("hash-1", { transaction: "tx-1", network: "dero-mainnet", payer: "p", signed: "s1" });
  store.put("hash-1", { transaction: "tx-1", network: "dero-mainnet", payer: "p", signed: "s2" });
  expect(store.lookup("hash-1")?.signed).toBe("s2");
});
