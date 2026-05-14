import { test, expect } from "bun:test";
import { signReceipt, verifyReceipt } from "../src/receipts/sign";
import * as ed from "@noble/ed25519";

test("signReceipt produces a verifiable signature", async () => {
  const sk = ed.utils.randomPrivateKey();
  const pk = await ed.getPublicKeyAsync(sk);
  const payload = {
    transaction: "tx-1",
    network: "dero-mainnet",
    payer: "deto1qyagent" + "0".repeat(56),
    amount: "1500",
    paidAtHeight: 1_000_000,
  };
  const signed = await signReceipt(payload, "ed25519:" + Buffer.from(sk).toString("hex"));
  const ok = await verifyReceipt(signed, Buffer.from(pk).toString("hex"));
  expect(ok).toBe(true);
});

test("verifyReceipt fails on tampered payload", async () => {
  const sk = ed.utils.randomPrivateKey();
  const pk = await ed.getPublicKeyAsync(sk);
  const payload = {
    transaction: "tx-1",
    network: "dero-mainnet",
    payer: "deto1qyagent" + "0".repeat(56),
    amount: "1500",
    paidAtHeight: 1_000_000,
  };
  const signed = await signReceipt(payload, "ed25519:" + Buffer.from(sk).toString("hex"));
  signed.payload.amount = "999999";
  const ok = await verifyReceipt(signed, Buffer.from(pk).toString("hex"));
  expect(ok).toBe(false);
});
