import { test, expect } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import {
  verifyX402Receipt,
  ConsumedReceiptLedger,
  type X402ReceiptPayload,
  type X402SignedReceipt,
} from "../src/x402/receipt";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBKEY_HEX = Buffer.from(publicKey.export({ format: "der", type: "spki" })).subarray(-32).toString("hex");

function canonicalize(p: X402ReceiptPayload): string {
  return JSON.stringify({
    network: p.network, payer: p.payer,
    amount: p.amount, paidAtHeight: p.paidAtHeight, resource: p.resource,
    merchantId: p.merchantId, orderId: p.orderId, expiresAt: p.expiresAt,
  });
}

function make(over: Partial<X402ReceiptPayload> = {}): X402SignedReceipt {
  const payload: X402ReceiptPayload = {
    network: "dero-mainnet", payer: "deto1" + "z".repeat(60),
    amount: "1500", paidAtHeight: 1_000_000, resource: "https://api/x",
    merchantId: "shop-1", orderId: "ord-42",
    expiresAt: Math.floor(Date.now() / 1000) + 900, ...over,
  };
  const sig = cryptoSign(null, Buffer.from(canonicalize(payload), "utf8"), privateKey);
  return { payload, signature: sig.toString("hex"), algorithm: "ed25519" };
}

const base = { publicKeyHex: PUBKEY_HEX, expectedResource: "https://api/x" };

test("accepts a validly signed, resource-bound, unexpired receipt", () => {
  const r = verifyX402Receipt(make(), base);
  expect(r.ok).toBe(true);
});

// LOCKSTEP GUARD: the SDK's canonicalize() must be byte-identical to the
// facilitator's (apps/facilitator/src/receipts/sign.ts). If either drifts,
// every real receipt fails verification. Freeze the exact field order + shape.
test("canonicalization matches the facilitator's fixed shape", () => {
  const payload: X402ReceiptPayload = {
    network: "n", payer: "p", amount: "1",
    paidAtHeight: 2, resource: "r", merchantId: "m", orderId: "o", expiresAt: 3,
  };
  expect(canonicalize(payload)).toBe(
    '{"network":"n","payer":"p","amount":"1","paidAtHeight":2,"resource":"r","merchantId":"m","orderId":"o","expiresAt":3}',
  );
});

test("rejects a missing receipt", () => {
  expect(verifyX402Receipt(null, base)).toEqual({ ok: false, reason: "missing_receipt" });
  expect(verifyX402Receipt({ ok: true } as never, base)).toEqual({ ok: false, reason: "missing_receipt" });
});

test("rejects a tampered payload (signature no longer covers it)", () => {
  const r = make();
  r.payload.amount = "999999"; // tamper after signing
  expect(verifyX402Receipt(r, base)).toEqual({ ok: false, reason: "bad_signature" });
});

test("rejects a receipt signed by a different key", () => {
  const other = generateKeyPairSync("ed25519");
  const otherHex = Buffer.from(other.publicKey.export({ format: "der", type: "spki" })).subarray(-32).toString("hex");
  expect(verifyX402Receipt(make(), { ...base, publicKeyHex: otherHex })).toEqual({ ok: false, reason: "bad_signature" });
});

test("rejects resource substitution", () => {
  expect(verifyX402Receipt(make({ resource: "https://api/OTHER" }), base))
    .toEqual({ ok: false, reason: "resource_mismatch" });
});

test("rejects an expired receipt", () => {
  expect(verifyX402Receipt(make({ expiresAt: Math.floor(Date.now() / 1000) - 1 }), base))
    .toEqual({ ok: false, reason: "receipt_expired" });
});

test("rejects merchant/order mismatch when asserted", () => {
  expect(verifyX402Receipt(make(), { ...base, expectedMerchantId: "other" }))
    .toEqual({ ok: false, reason: "merchant_mismatch" });
  expect(verifyX402Receipt(make(), { ...base, expectedOrderId: "other" }))
    .toEqual({ ok: false, reason: "order_mismatch" });
});

test("ConsumedReceiptLedger allows first use, rejects replay of the same identity", async () => {
  const ledger = new ConsumedReceiptLedger();
  const r = make().payload;
  expect(await ledger.consume(r)).toBe(true);
  expect(await ledger.consume(r)).toBe(false);
  // A different order with the same payer is a distinct identity -> allowed.
  expect(await ledger.consume({ ...r, orderId: "ord-99" })).toBe(true);
});

test("ConsumedReceiptLedger includes resource in the one-time-use identity", async () => {
  const ledger = new ConsumedReceiptLedger();
  const r = make().payload;
  expect(await ledger.consume(r)).toBe(true);
  // Same merchant/order/payer but a DIFFERENT served resource is a distinct
  // identity: a receipt spent on resource A must not be counted as spent for
  // resource B (guards against pay-per-handler collapse when the resource
  // resolver distinguishes requests).
  expect(await ledger.consume({ ...r, resource: r.resource + "?other" })).toBe(true);
  // ...and re-presenting the exact same resource is still a replay.
  expect(await ledger.consume(r)).toBe(false);
});

test("ConsumedReceiptLedger uses a durable store atomically when supplied", async () => {
  // A shared store is what makes replay defense survive across serverless
  // instances/cold starts. Model it with a single Map two ledger instances
  // share; a receipt consumed via ledger A must be seen as spent by ledger B.
  const shared = new Map<string, number>();
  const store = {
    async reserve(key: string, expiresAtMs: number): Promise<boolean> {
      if (shared.has(key)) return false;
      shared.set(key, expiresAtMs);
      return true;
    },
  };
  const a = new ConsumedReceiptLedger(store);
  const b = new ConsumedReceiptLedger(store);
  const r = make().payload;
  expect(await a.consume(r)).toBe(true);
  expect(await b.consume(r)).toBe(false); // cross-instance replay blocked
});

test("O18: rejects a receipt whose amount is below the served tier price", () => {
  // Receipt attests amount=1500 (a cheap tier's on-chain deposit) but the
  // server is serving a tier priced at 5000. Without expectedMinAmount the
  // amount is signed-but-decorative and the downgraded receipt would unlock the
  // expensive resource. With it, the consumer rejects underpaid_receipt.
  const r = verifyX402Receipt(make({ amount: "1500" }), { ...base, expectedMinAmount: "5000" });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toBe("underpaid_receipt");
});

test("O18: accepts a receipt whose amount meets or exceeds the tier price", () => {
  const exact = verifyX402Receipt(make({ amount: "5000" }), { ...base, expectedMinAmount: "5000" });
  expect(exact.ok).toBe(true);
  const over = verifyX402Receipt(make({ amount: "9999" }), { ...base, expectedMinAmount: "5000" });
  expect(over.ok).toBe(true);
});

test("O18: enforces amount on values beyond 2^53 without float truncation", () => {
  // uint64 amounts above Number.MAX_SAFE_INTEGER must compare via BigInt.
  const big = "18446744073709551615"; // 2^64 - 1
  const min = "18446744073709551614"; // one less
  const ok = verifyX402Receipt(make({ amount: big }), { ...base, expectedMinAmount: min });
  expect(ok.ok).toBe(true);
  const bad = verifyX402Receipt(make({ amount: min }), { ...base, expectedMinAmount: big });
  expect(bad.ok).toBe(false);
});
