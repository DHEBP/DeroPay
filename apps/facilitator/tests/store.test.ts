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

test("ReceiptStore.put is idempotent — duplicate puts keep first record", () => {
  store.put("hash-1", { transaction: "tx-1", network: "dero-mainnet", payer: "p", signed: "s1" });
  store.put("hash-1", { transaction: "tx-1", network: "dero-mainnet", payer: "p", signed: "s2" });
  expect(store.lookup("hash-1")?.signed).toBe("s1");
});
