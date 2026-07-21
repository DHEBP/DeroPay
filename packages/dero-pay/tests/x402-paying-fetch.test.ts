import { test, expect } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { withX402 } from "../src/x402/next";
import type { X402ReceiptPayload, X402SignedReceipt } from "../src/x402/receipt";
import type { VerifySettleClient } from "../src/x402/server";
import type { PaymentRequirements } from "../src/x402/types";
import type { WalletInvoke } from "../src/x402/client";
import { SpendPolicy, SpendPolicyError } from "../src/x402/policy";
import {
  mintSpendCredential,
  attenuate,
  CredentialPolicy,
  CredentialError,
} from "../src/x402/credentials";
import {
  createPayingFetch,
  X402PaymentRejectedError,
  X402UnpayableError,
  type PaymentEvidence,
} from "../src/x402/paying-fetch";

const ORIGIN = "http://merchant.test";
const RESOURCE = `${ORIGIN}/api/data`;
const SCID = "2".repeat(64);
const TXID = "a".repeat(64);
const PAYER = "deto1" + "q".repeat(60);

function makeAccepts(orderId = "order-1"): PaymentRequirements {
  return {
    scheme: "dero-exact",
    network: "dero-mainnet",
    asset: "DERO",
    payTo: SCID,
    maxAmountRequired: "500",
    resource: RESOURCE,
    extra: { merchantId: "merchant-1", orderId },
  };
}

// Throwaway facilitator keypair; sign receipts as the real facilitator does so
// the consumer's cryptographic enforcement (O7) is exercised, not bypassed.
const { publicKey: FAC_PUB, privateKey: FAC_PRIV } = generateKeyPairSync("ed25519");
const FACILITATOR_PUBLIC_KEY = Buffer.from(
  FAC_PUB.export({ format: "der", type: "spki" }),
).subarray(-32).toString("hex");

function canonicalize(p: X402ReceiptPayload): string {
  return JSON.stringify({
    network: p.network, payer: p.payer,
    amount: p.amount, paidAtHeight: p.paidAtHeight, resource: p.resource,
    merchantId: p.merchantId, orderId: p.orderId, expiresAt: p.expiresAt,
  });
}

// Bind the receipt to whatever the settle request asked for (resource +
// merchant/order), matching real facilitator behaviour.
function signReceiptFor(pr: { resource: string; extra: { merchantId: string; orderId: string } }): X402SignedReceipt {
  const payload: X402ReceiptPayload = {
    network: "dero-mainnet", payer: PAYER, amount: "500",
    paidAtHeight: 1, resource: pr.resource,
    merchantId: pr.extra.merchantId, orderId: pr.extra.orderId,
    expiresAt: Math.floor(Date.now() / 1000) + 900,
  };
  const sig = cryptoSign(null, Buffer.from(canonicalize(payload), "utf8"), FAC_PRIV);
  return { payload, signature: sig.toString("hex"), algorithm: "ed25519" };
}

function okFacilitator(): VerifySettleClient {
  return {
    verify: async () => ({ isValid: true, payer: PAYER }),
    settle: async (req) => ({
      success: true, transaction: TXID, network: "dero-mainnet",
      receipt: signReceiptFor(req.paymentRequirements),
    }),
  };
}

function makeWalletInvoke() {
  const calls: unknown[] = [];
  const invoke: WalletInvoke = async (args) => {
    calls.push(args);
    return { txid: TXID, payer: PAYER };
  };
  return { invoke, calls };
}

function makePolicy() {
  return new SpendPolicy({ allowOrigins: [ORIGIN], maxAtomicPerRequest: 10_000n });
}

/** Route payingFetch's underlying fetch into an in-process guarded handler. */
function fetchInto(handler: (req: Request) => Promise<Response>) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
    return handler(request);
  };
}

test("non-402 responses pass through untouched, nothing is paid", async () => {
  const { invoke, calls } = makeWalletInvoke();
  const payingFetch = createPayingFetch({
    walletInvoke: invoke,
    policy: makePolicy(),
    fetch: fetchInto(async () => Response.json({ free: true })),
  });
  const res = await payingFetch(RESOURCE);
  expect(res.status).toBe(200);
  expect(calls.length).toBe(0);
});

test("pays a 402, retries with X-PAYMENT, returns 200 with settle response header", async () => {
  const guarded = withX402(
    { facilitator: okFacilitator(), accepts: [makeAccepts()], resource: RESOURCE, facilitatorPublicKey: FACILITATOR_PUBLIC_KEY },
    async () => Response.json({ secret: 42 })
  );
  const { invoke, calls } = makeWalletInvoke();
  const evidence: PaymentEvidence[] = [];

  const payingFetch = createPayingFetch({
    walletInvoke: invoke,
    policy: makePolicy(),
    fetch: fetchInto(guarded),
    onPayment: (e) => evidence.push(e),
  });

  const res = await payingFetch(RESOURCE);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ secret: 42 });
  expect(res.headers.get("X-PAYMENT-RESPONSE")).toBeTruthy();

  expect(calls.length).toBe(1);
  const call = calls[0] as Record<string, unknown>;
  expect(call.scid).toBe(SCID);
  expect(call.entrypoint).toBe("Pay");
  expect(call.ringsize).toBe(2);
  expect(call.deroDeposit).toBe(500n);
  expect(call.args).toEqual({ merchant_id: "merchant-1", order_id: "order-1" });

  expect(evidence.length).toBe(1);
  expect(evidence[0]).toMatchObject({
    origin: ORIGIN,
    resource: RESOURCE,
    scid: SCID,
    merchantId: "merchant-1",
    orderId: "order-1",
    amountAtomic: "500",
    txid: TXID,
    payer: PAYER,
  });
});

test("policy denial throws before any wallet call", async () => {
  const guarded = withX402(
    { facilitator: okFacilitator(), accepts: [makeAccepts()], resource: RESOURCE, facilitatorPublicKey: FACILITATOR_PUBLIC_KEY },
    async () => Response.json({ secret: 42 })
  );
  const { invoke, calls } = makeWalletInvoke();
  const payingFetch = createPayingFetch({
    walletInvoke: invoke,
    policy: new SpendPolicy({ allowOrigins: ["http://other.test"], maxAtomicPerRequest: 10_000n }),
    fetch: fetchInto(guarded),
  });

  await expect(payingFetch(RESOURCE)).rejects.toThrowError(SpendPolicyError);
  expect(calls.length).toBe(0);
});

test("per-request cap denial throws before any wallet call", async () => {
  const guarded = withX402(
    { facilitator: okFacilitator(), accepts: [makeAccepts()], resource: RESOURCE, facilitatorPublicKey: FACILITATOR_PUBLIC_KEY },
    async () => Response.json({ ok: 1 })
  );
  const { invoke, calls } = makeWalletInvoke();
  const payingFetch = createPayingFetch({
    walletInvoke: invoke,
    policy: new SpendPolicy({ allowOrigins: [ORIGIN], maxAtomicPerRequest: 499n }),
    fetch: fetchInto(guarded),
  });

  await expect(payingFetch(RESOURCE)).rejects.toThrowError(SpendPolicyError);
  expect(calls.length).toBe(0);
});

test("failed wallet payment releases the reservation (budget is not burned)", async () => {
  const guarded = withX402(
    { facilitator: okFacilitator(), accepts: [makeAccepts()], resource: RESOURCE, facilitatorPublicKey: FACILITATOR_PUBLIC_KEY },
    async () => Response.json({ ok: 1 })
  );
  const policy = new SpendPolicy({
    allowOrigins: [ORIGIN],
    maxAtomicPerRequest: 10_000n,
    maxAtomicPerWindow: { amountAtomic: 500n, windowSeconds: 3600 },
  });
  let fail = true;
  const calls: unknown[] = [];
  const flaky: WalletInvoke = async (args) => {
    calls.push(args);
    if (fail) throw new Error("wallet offline");
    return { txid: TXID, payer: PAYER };
  };
  const payingFetch = createPayingFetch({ walletInvoke: flaky, policy, fetch: fetchInto(guarded) });

  await expect(payingFetch(RESOURCE)).rejects.toThrowError("wallet offline");
  expect(policy.spentInWindow()).toBe(0n);

  fail = false;
  const res = await payingFetch(RESOURCE);
  expect(res.status).toBe(200);
  expect(policy.spentInWindow()).toBe(500n);
  expect(calls.length).toBe(2);
});

test("concurrent requests for the same order share one payment", async () => {
  const guarded = withX402(
    { facilitator: okFacilitator(), accepts: [makeAccepts("order-shared")], resource: RESOURCE, facilitatorPublicKey: FACILITATOR_PUBLIC_KEY },
    async () => Response.json({ ok: 1 })
  );
  const { calls } = makeWalletInvoke();
  const slowInvoke: WalletInvoke = async (args) => {
    calls.push(args);
    await new Promise((r) => setTimeout(r, 20));
    return { txid: TXID, payer: PAYER };
  };
  const payingFetch = createPayingFetch({
    walletInvoke: slowInvoke,
    policy: makePolicy(),
    fetch: fetchInto(guarded),
  });

  const [a, b] = await Promise.all([payingFetch(RESOURCE), payingFetch(RESOURCE)]);
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  expect(calls.length).toBe(1);
});

test("402 after payment throws X402PaymentRejectedError instead of paying again", async () => {
  const rejectingFacilitator: VerifySettleClient = {
    verify: async () => ({ isValid: false, invalidReason: "tx not found" }),
    settle: async () => ({ success: false, error: "unreachable" }),
  };
  const guarded = withX402(
    { facilitator: rejectingFacilitator, accepts: [makeAccepts()], resource: RESOURCE, facilitatorPublicKey: FACILITATOR_PUBLIC_KEY },
    async () => Response.json({ ok: 1 })
  );
  const { invoke, calls } = makeWalletInvoke();
  const payingFetch = createPayingFetch({
    walletInvoke: invoke,
    policy: makePolicy(),
    fetch: fetchInto(guarded),
    settleTimeoutMs: 0,
  });

  await expect(payingFetch(RESOURCE)).rejects.toThrowError(X402PaymentRejectedError);
  expect(calls.length).toBe(1);
});

test("settlement lag: keeps replaying the SAME payment until confirmations land, then 200", async () => {
  // Facilitator refuses until the 3rd verify — models tx mined + depth reached.
  let verifies = 0;
  const lagging: VerifySettleClient = {
    verify: async () => {
      verifies++;
      return verifies < 3
        ? { isValid: false, invalidReason: "not_finalized" }
        : { isValid: true, payer: PAYER };
    },
    settle: async (req) => ({
      success: true, transaction: TXID, network: "dero-mainnet",
      receipt: signReceiptFor(req.paymentRequirements),
    }),
  };
  const guarded = withX402(
    { facilitator: lagging, accepts: [makeAccepts("order-lag")], resource: RESOURCE, facilitatorPublicKey: FACILITATOR_PUBLIC_KEY },
    async () => Response.json({ ok: 1 })
  );
  const { invoke, calls } = makeWalletInvoke();
  const payingFetch = createPayingFetch({
    walletInvoke: invoke,
    policy: makePolicy(),
    fetch: fetchInto(guarded),
    settleTimeoutMs: 5_000,
    settlePollIntervalMs: 1,
  });

  const res = await payingFetch(RESOURCE);
  expect(res.status).toBe(200);
  expect(calls.length).toBe(1); // exactly one payment despite three attempts
  expect(verifies).toBe(3);
});

test("402 with no matching rail throws X402UnpayableError by default, passes through when configured", async () => {
  const foreign402 = async () =>
    new Response(
      JSON.stringify({
        x402Version: 1,
        resource: RESOURCE,
        accepts: [{ scheme: "exact", network: "base", asset: "USDC" }],
      }),
      { status: 402, headers: { "Content-Type": "application/json" } }
    );
  const { invoke, calls } = makeWalletInvoke();

  const throwing = createPayingFetch({
    walletInvoke: invoke,
    policy: makePolicy(),
    fetch: fetchInto(foreign402),
  });
  await expect(throwing(RESOURCE)).rejects.toThrowError(X402UnpayableError);

  const passthrough = createPayingFetch({
    walletInvoke: invoke,
    policy: makePolicy(),
    fetch: fetchInto(foreign402),
    unpayable: "passthrough",
  });
  const res = await passthrough(RESOURCE);
  expect(res.status).toBe(402);
  expect(calls.length).toBe(0);
});

test("replays a POST body on the paid retry", async () => {
  const received: string[] = [];
  const guarded = withX402(
    { facilitator: okFacilitator(), accepts: [makeAccepts("order-post")], resource: RESOURCE, facilitatorPublicKey: FACILITATOR_PUBLIC_KEY },
    async (req) => {
      received.push(await req.text());
      return Response.json({ ok: 1 });
    }
  );
  const { invoke } = makeWalletInvoke();
  const payingFetch = createPayingFetch({
    walletInvoke: invoke,
    policy: makePolicy(),
    fetch: fetchInto(guarded),
  });

  const res = await payingFetch(
    new Request(RESOURCE, { method: "POST", body: JSON.stringify({ q: "hello" }) })
  );
  expect(res.status).toBe(200);
  expect(received).toEqual([JSON.stringify({ q: "hello" })]);
});

// --- CredentialPolicy drops into createPayingFetch unchanged (SpendGuard) ---

const CRED_ROOT = "c".repeat(64);

test("createPayingFetch pays through a verified CredentialPolicy", async () => {
  const guarded = withX402(
    { facilitator: okFacilitator(), accepts: [makeAccepts("order-cred")], resource: RESOURCE, facilitatorPublicKey: FACILITATOR_PUBLIC_KEY },
    async () => Response.json({ ok: 1 })
  );
  const { invoke, calls } = makeWalletInvoke();
  const cred = mintSpendCredential({
    rootKeyHex: CRED_ROOT,
    id: "worker-1",
    caveats: [
      { type: "origin", value: ORIGIN },
      { type: "max-spend-atomic", value: "10000" },
      { type: "resource-prefix", value: `${ORIGIN}/api/` },
    ],
  });
  const payingFetch = createPayingFetch({
    walletInvoke: invoke,
    policy: new CredentialPolicy(cred, CRED_ROOT),
    fetch: fetchInto(guarded),
  });

  const res = await payingFetch(RESOURCE);
  expect(res.status).toBe(200);
  expect(calls.length).toBe(1);
});

test("an attenuated credential's tighter cap blocks the wallet call through createPayingFetch", async () => {
  const guarded = withX402(
    { facilitator: okFacilitator(), accepts: [makeAccepts("order-cred2")], resource: RESOURCE, facilitatorPublicKey: FACILITATOR_PUBLIC_KEY },
    async () => Response.json({ ok: 1 })
  );
  const { invoke, calls } = makeWalletInvoke();
  // Parent allows 10000; worker attenuates to 100 — below the 500 price.
  const parent = mintSpendCredential({
    rootKeyHex: CRED_ROOT,
    id: "worker-2",
    caveats: [{ type: "origin", value: ORIGIN }, { type: "max-spend-atomic", value: "10000" }],
  });
  const worker = attenuate(parent, { type: "max-spend-atomic", value: "100" });
  const payingFetch = createPayingFetch({
    walletInvoke: invoke,
    policy: new CredentialPolicy(worker, CRED_ROOT),
    fetch: fetchInto(guarded),
  });

  await expect(payingFetch(RESOURCE)).rejects.toThrowError(CredentialError);
  expect(calls.length).toBe(0);
});

test("a resource-prefix caveat blocks payment for an out-of-scope resource", async () => {
  const guarded = withX402(
    { facilitator: okFacilitator(), accepts: [makeAccepts("order-cred3")], resource: RESOURCE, facilitatorPublicKey: FACILITATOR_PUBLIC_KEY },
    async () => Response.json({ ok: 1 })
  );
  const { invoke, calls } = makeWalletInvoke();
  // Credential only permits /billing/* but the resource is /api/data.
  const cred = mintSpendCredential({
    rootKeyHex: CRED_ROOT,
    id: "worker-3",
    caveats: [
      { type: "origin", value: ORIGIN },
      { type: "max-spend-atomic", value: "10000" },
      { type: "resource-prefix", value: `${ORIGIN}/billing/` },
    ],
  });
  const payingFetch = createPayingFetch({
    walletInvoke: invoke,
    policy: new CredentialPolicy(cred, CRED_ROOT),
    fetch: fetchInto(guarded),
  });

  await expect(payingFetch(RESOURCE)).rejects.toThrowError(CredentialError);
  expect(calls.length).toBe(0);
});
