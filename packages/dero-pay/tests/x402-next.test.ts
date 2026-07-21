import { test, expect } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { withX402 } from "../src/x402/next";
import { ConsumedReceiptLedger, type X402ReceiptPayload, type X402SignedReceipt } from "../src/x402/receipt";
import type { VerifySettleClient } from "../src/x402/server";

const SCID = "1".repeat(64);
const AGENT = "deto1qy" + "z".repeat(58);
const RESOURCE = "https://api/x";

// A throwaway Ed25519 keypair standing in for the facilitator. We sign
// receipts here the same way apps/facilitator/src/receipts/sign.ts does
// (canonical JSON, fixed key order) and hand withX402 the raw 32-byte public
// key as hex — proving the consumer now cryptographically enforces the receipt.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const facilitatorPublicKey = Buffer.from(
  publicKey.export({ format: "der", type: "spki" }),
).subarray(-32).toString("hex");

function canonicalize(p: X402ReceiptPayload): string {
  return JSON.stringify({
    network: p.network,
    payer: p.payer,
    amount: p.amount,
    paidAtHeight: p.paidAtHeight,
    resource: p.resource,
    merchantId: p.merchantId,
    orderId: p.orderId,
    expiresAt: p.expiresAt,
  });
}

function signReceipt(payload: X402ReceiptPayload): X402SignedReceipt {
  const sig = cryptoSign(null, Buffer.from(canonicalize(payload), "utf8"), privateKey);
  return { payload, signature: sig.toString("hex"), algorithm: "ed25519" };
}

function receipt(over: Partial<X402ReceiptPayload> = {}): X402SignedReceipt {
  return signReceipt({
    network: "dero-mainnet",
    payer: AGENT,
    amount: "1500",
    paidAtHeight: 1_000_000,
    resource: RESOURCE,
    merchantId: "shop-1",
    orderId: "ord-42",
    expiresAt: Math.floor(Date.now() / 1000) + 900,
    ...over,
  });
}

function facilitatorReturning(r: unknown): VerifySettleClient {
  return {
    async verify() { return { isValid: true, payer: AGENT }; },
    async settle() { return { success: true, transaction: "tx-1", network: "dero-mainnet", receipt: r }; },
  };
}

// A REALISTIC facilitator: it signs receipt.resource = the resource carried in
// the paymentRequirements it is HANDED (exactly what apps/facilitator settle.ts
// does — signReceipt(resource: req.paymentRequirements.resource)). This proves
// withX402 forwards the RESOLVED per-request resource to settle, rather than the
// static accepts[].resource — the O14 split. A middleware that forwarded the
// static value would make this facilitator sign the static string and every
// resolver-differing request would fail resource_mismatch.
function realisticFacilitator(): VerifySettleClient {
  return {
    async verify() { return { isValid: true, payer: AGENT }; },
    async settle(req) {
      const signed = signReceipt({
        network: "dero-mainnet",
        payer: AGENT,
        amount: "1500",
        paidAtHeight: 1_000_000,
        resource: req.paymentRequirements.resource,
        merchantId: req.paymentRequirements.extra.merchantId,
        orderId: req.paymentRequirements.extra.orderId,
        expiresAt: Math.floor(Date.now() / 1000) + 900,
      });
      return { success: true, transaction: "tx-1", network: "dero-mainnet", receipt: signed };
    },
  };
}

const accepts = [{
  scheme: "dero-exact", network: "dero-mainnet", asset: "DERO",
  payTo: SCID, maxAmountRequired: "1000", resource: RESOURCE,
  extra: { merchantId: "shop-1", orderId: "ord-42" },
}] as const;

function header(): string {
  return Buffer.from(JSON.stringify({
    x402Version: 1,
    scheme: "dero-exact",
    network: "dero-mainnet",
    payload: {
      txHash: "a".repeat(64), scid: SCID, merchantId: "shop-1",
      orderId: "ord-42", payer: AGENT, amount: "1500",
    },
  })).toString("base64");
}

test("withX402 returns 402 when X-PAYMENT is missing", async () => {
  const handler = withX402({
    facilitator: facilitatorReturning(receipt()),
    accepts: [...accepts],
    resource: RESOURCE,
    facilitatorPublicKey,
  }, async () => new Response("paid content"));

  const res = await handler(new Request(RESOURCE));
  expect(res.status).toBe(402);
  const body = await res.json();
  expect(body.accepts[0].scheme).toBe("dero-exact");
});

test("withX402 serves content when the receipt is validly signed and resource-bound", async () => {
  const handler = withX402({
    facilitator: facilitatorReturning(receipt()),
    accepts: [...accepts],
    resource: RESOURCE,
    facilitatorPublicKey,
  }, async () => new Response("paid content"));

  const res = await handler(new Request(RESOURCE, { headers: { "X-PAYMENT": header() } }));
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("paid content");
  expect(res.headers.get("X-PAYMENT-RESPONSE")).toBeTruthy();
});

// O7: a facilitator (compromised or MITM'd) that returns success with a
// GARBAGE receipt must NOT unlock — the signature is checked here.
test("withX402 rejects settle.success with an unsigned/garbage receipt", async () => {
  const handler = withX402({
    facilitator: facilitatorReturning({ ok: true }),
    accepts: [...accepts],
    resource: RESOURCE,
    facilitatorPublicKey,
  }, async () => new Response("paid content"));

  const res = await handler(new Request(RESOURCE, { headers: { "X-PAYMENT": header() } }));
  expect(res.status).toBe(402);
  const body = await res.json();
  expect(body.error).toBe("missing_receipt");
});

// O7: a receipt validly signed for a DIFFERENT resource must not unlock THIS
// resource (substitution / privilege escalation).
test("withX402 rejects a receipt bound to a different resource", async () => {
  const handler = withX402({
    facilitator: facilitatorReturning(receipt({ resource: "https://api/OTHER" })),
    accepts: [...accepts],
    resource: RESOURCE,
    facilitatorPublicKey,
  }, async () => new Response("paid content"));

  const res = await handler(new Request(RESOURCE, { headers: { "X-PAYMENT": header() } }));
  expect(res.status).toBe(402);
  const body = await res.json();
  expect(body.error).toBe("resource_mismatch");
});

// O5: an expired receipt (past its signed TTL) must not unlock.
test("withX402 rejects an expired receipt", async () => {
  const handler = withX402({
    facilitator: facilitatorReturning(receipt({ expiresAt: Math.floor(Date.now() / 1000) - 1 })),
    accepts: [...accepts],
    resource: RESOURCE,
    facilitatorPublicKey,
  }, async () => new Response("paid content"));

  const res = await handler(new Request(RESOURCE, { headers: { "X-PAYMENT": header() } }));
  expect(res.status).toBe(402);
  const body = await res.json();
  expect(body.error).toBe("receipt_expired");
});

// O5: one-time use. The SAME valid receipt (which any public-chain observer can
// reconstruct within the TTL) unlocks ONCE; a replay is rejected.
test("withX402 rejects a replayed receipt (one-time use)", async () => {
  const ledger = new ConsumedReceiptLedger();
  const r = receipt();
  const handler = withX402({
    facilitator: facilitatorReturning(r),
    accepts: [...accepts],
    resource: RESOURCE,
    facilitatorPublicKey,
    consumedLedger: ledger,
  }, async () => new Response("paid content"));

  const first = await handler(new Request(RESOURCE, { headers: { "X-PAYMENT": header() } }));
  expect(first.status).toBe(200);

  const second = await handler(new Request(RESOURCE, { headers: { "X-PAYMENT": header() } }));
  expect(second.status).toBe(402);
  const body = await second.json();
  expect(body.error).toBe("receipt_replayed");
});

// O12: resource is resolved PER REQUEST. A receipt whose signed resource is the
// per-request value unlocks; a receipt bound to a DIFFERENT request's resource
// is rejected as resource_mismatch even though the handler is the same.
test("withX402 binds the receipt to the per-request resolved resource", async () => {
  const resolver = (req: Request) => `${RESOURCE}?${new URL(req.url).searchParams}`;
  // Use the REALISTIC facilitator that signs whatever resource it is handed —
  // this is what the real apps/facilitator does. It catches the O14 split: if
  // the middleware forwarded the static accepts[].resource instead of the
  // resolved value, the facilitator would sign the static string and BOTH
  // requests below would fail resource_mismatch (a DoS), not just the wrong one.
  const handler = withX402({
    facilitator: realisticFacilitator(),
    accepts: [...accepts],
    resource: resolver,
    facilitatorPublicKey,
  }, async () => new Response("paid content"));

  const btcResource = `${RESOURCE}?symbol=BTC`;
  // The matching request unlocks: the facilitator signed the ?symbol=BTC
  // resource (proving the resolved value reached settle) and the consumer's
  // check passes.
  const ok = await handler(new Request(btcResource, { headers: { "X-PAYMENT": header() } }));
  expect(ok.status).toBe(200);

  // A DIFFERENT request (?symbol=ETH) presenting a receipt for ?symbol=BTC must
  // not unlock — pay-per-handler collapse stays closed. Feed a BTC-bound receipt
  // via the static-return facilitator to isolate the consumer check.
  const wrongHandler = withX402({
    facilitator: facilitatorReturning(receipt({ resource: btcResource })),
    accepts: [...accepts],
    resource: resolver,
    facilitatorPublicKey,
  }, async () => new Response("paid content"));
  const wrong = await wrongHandler(new Request(`${RESOURCE}?symbol=ETH`, { headers: { "X-PAYMENT": header() } }));
  expect(wrong.status).toBe(402);
  expect((await wrong.json()).error).toBe("resource_mismatch");
});

// O14: forwarding the RESOLVED resource to the facilitator is load-bearing. A
// resolver whose value differs from the static accepts[].resource must still
// unlock (the facilitator signs the resolved value), NOT brick with a
// resource_mismatch DoS. This is the exact case the old test masked.
test("withX402 forwards the resolved resource to the facilitator (no DoS on resolver!=static)", async () => {
  const distinctResource = `${RESOURCE}?tier=premium`;
  const handler = withX402({
    facilitator: realisticFacilitator(),
    accepts: [...accepts], // accepts[].resource === RESOURCE (the STATIC value)
    resource: () => distinctResource, // resolver returns a DIFFERENT value
    facilitatorPublicKey,
  }, async () => new Response("paid content"));

  const ok = await handler(new Request(distinctResource, { headers: { "X-PAYMENT": header() } }));
  expect(ok.status).toBe(200);
});

// O18: the facilitator signs the ACTUAL on-chain amount (1500 here). If the
// served tier is priced above that, the consumer must reject the downgraded
// receipt via the internal expectedMinAmount = matching.maxAmountRequired check.
test("O18: withX402 rejects a receipt whose amount is below the served tier price", async () => {
  const expensiveAccepts = [{ ...accepts[0], maxAmountRequired: "5000" }];
  const handler = withX402({
    facilitator: realisticFacilitator(), // signs amount 1500
    accepts: expensiveAccepts,
    resource: RESOURCE,
    facilitatorPublicKey,
  }, async () => new Response("paid content"));

  const res = await handler(new Request(RESOURCE, { headers: { "X-PAYMENT": header() } }));
  expect(res.status).toBe(402);
  const body = await res.json();
  expect(body.error).toBe("underpaid_receipt");
});

test("O18: withX402 serves when the receipt amount covers the tier price", async () => {
  // Tier priced at exactly the on-chain amount the realistic facilitator signs.
  const handler = withX402({
    facilitator: realisticFacilitator(), // signs amount 1500
    accepts: [{ ...accepts[0], maxAmountRequired: "1500" }],
    resource: RESOURCE,
    facilitatorPublicKey,
  }, async () => new Response("paid content"));

  const res = await handler(new Request(RESOURCE, { headers: { "X-PAYMENT": header() } }));
  expect(res.status).toBe(200);
});

// O19: with an orderIdMinter, the 402 challenge carries a fresh server-issued
// orderId, NOT the static config literal — so an integrator using the "static
// accepts" shape still gets server-authoritative order identity.
test("O19: orderIdMinter overrides the static orderId in the 402 challenge", async () => {
  const { createOrderIdMinter } = await import("../src/x402/order-id");
  const minter = createOrderIdMinter("s".repeat(32));
  const handler = withX402({
    facilitator: realisticFacilitator(),
    accepts: [...accepts], // static orderId "ord-42"
    resource: RESOURCE,
    facilitatorPublicKey,
    orderIdMinter: minter,
  }, async () => new Response("paid content"));

  const res = await handler(new Request(RESOURCE)); // no X-PAYMENT -> 402
  expect(res.status).toBe(402);
  const body = await res.json();
  const issued = body.accepts[0].extra.orderId;
  expect(issued).not.toBe("ord-42");
  expect(minter.isServerIssued(issued, `shop-1|${RESOURCE}`)).toBe(true);
});
