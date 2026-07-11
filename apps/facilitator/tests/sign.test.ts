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
    resource: "https://api.example.com/premium",
    merchantId: "merchant-1",
    orderId: "order-1",
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
    resource: "https://api.example.com/premium",
    merchantId: "merchant-1",
    orderId: "order-1",
  };
  const signed = await signReceipt(payload, "ed25519:" + Buffer.from(sk).toString("hex"));
  signed.payload.amount = "999999";
  const ok = await verifyReceipt(signed, Buffer.from(pk).toString("hex"));
  expect(ok).toBe(false);
});

test("resource binding: a receipt cannot be replayed for a different resource", async () => {
  const sk = ed.utils.randomPrivateKey();
  const pk = await ed.getPublicKeyAsync(sk);
  const payload = {
    transaction: "tx-1",
    network: "dero-mainnet",
    payer: "deto1qyagent" + "0".repeat(56),
    amount: "1500",
    paidAtHeight: 1_000_000,
    resource: "https://api.example.com/cheap",
    merchantId: "merchant-1",
    orderId: "order-1",
  };
  const signed = await signReceipt(payload, "ed25519:" + Buffer.from(sk).toString("hex"));
  // Attacker points the receipt at a pricier resource on the same server.
  signed.payload.resource = "https://api.example.com/expensive";
  const ok = await verifyReceipt(signed, Buffer.from(pk).toString("hex"));
  expect(ok).toBe(false);
});
