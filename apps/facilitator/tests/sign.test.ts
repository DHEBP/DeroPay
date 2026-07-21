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

test("txHash is NOT covered by the signature (facilitator never verifies it)", async () => {
  // O9: the facilitator proves payment from on-chain (scid, merchant, order)
  // state, not from the client-supplied txHash — so txHash must not be part of
  // the signed attestation. Mutating a `transaction` field must NOT invalidate
  // the signature (it isn't in the canonical message at all).
  const sk = ed.utils.randomPrivateKey();
  const pk = await ed.getPublicKeyAsync(sk);
  const payload = {
    network: "dero-mainnet",
    payer: "deto1qyagent" + "0".repeat(56),
    amount: "1500",
    paidAtHeight: 1_000_000,
    resource: "https://api.example.com/premium",
    merchantId: "merchant-1",
    orderId: "order-1",
    expiresAt: Math.floor(Date.now() / 1000) + 900,
  };
  const signed = await signReceipt(payload, "ed25519:" + Buffer.from(sk).toString("hex"));
  // Attach an arbitrary attacker-chosen tx id post-signing.
  (signed.payload as Record<string, unknown>).transaction = "f".repeat(64);
  const ok = await verifyReceipt(signed, Buffer.from(pk).toString("hex"));
  expect(ok).toBe(true);
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
