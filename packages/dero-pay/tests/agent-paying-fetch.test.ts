/**
 * createPayingFetch against a real in-process merchant: the actual
 * createX402RouteGuard + issueReceiptFromInvoice over a mutable invoice
 * map, with routed /api/pay/status and /api/pay/receipts/issue
 * endpoints. Only the engine and the chain are faked — a payer "pays"
 * by flipping the invoice to completed.
 */

import { test, expect } from "vitest";
import {
  createX402RouteGuard,
  type X402PaymentPolicy,
  type X402PolicyResolver,
} from "../src/next/x402.js";
import { issueReceiptFromInvoice } from "../src/server/payment-receipts.js";
import type { InvoiceEngine } from "../src/server/invoice-engine.js";
import type { CreateInvoiceParams, Invoice } from "../src/core/types.js";
import { MemoryInvoiceStore } from "../src/store/memory.js";
import { makeInvoice } from "./helpers.js";
import { SpendPolicy, SpendPolicyError } from "../src/agent/policy.js";
import {
  mintSpendCredential,
  attenuate,
  CredentialPolicy,
  CredentialError,
} from "../src/agent/credentials.js";
import type { InvoicePayer, InvoicePayment } from "../src/agent/payer.js";
import {
  createPayingFetch,
  X402PaymentRejectedError,
  X402UnpayableError,
  X402SettlementTimeoutError,
  type PayingFetchConfig,
  type PaymentEvidence,
} from "../src/agent/paying-fetch.js";

const ORIGIN = "http://merchant.test";
const RESOURCE = "/api/data";
const RESOURCE_URL = `${ORIGIN}${RESOURCE}`;
const SECRET = "receipt-secret";
const TXID = "a".repeat(64);

type Merchant = {
  handler: (request: Request) => Promise<Response>;
  completeInvoice: (id: string) => void;
  expireInvoice: (id: string) => void;
  invoices: Map<string, Invoice>;
  statusPolls: () => number;
  lastInvoiceId: () => string;
};

function makeMerchant(
  options: {
    amountAtomic?: bigint;
    policy?: X402PaymentPolicy | X402PolicyResolver;
    enforceSingleUseReceipts?: boolean;
    /** Sign issued receipts with a different secret than the guard verifies. */
    issueSecret?: string;
    protocolId?: string;
    /** Complete paid invoices only after this many status polls. */
    completeAfterPolls?: number;
    handler?: (request: Request) => Promise<Response>;
  } = {}
): Merchant {
  const invoices = new Map<string, Invoice>();
  const store = new MemoryInvoiceStore();
  let seq = 0;
  let polls = 0;

  const engine = {
    createInvoice: async (params: CreateInvoiceParams) => {
      seq += 1;
      const invoice = makeInvoice({
        id: `inv-${seq}`,
        amount: params.amount,
        status: "pending",
        integratedAddress: `deti1qinv${seq}`,
        metadata: params.metadata ?? {},
      });
      invoices.set(invoice.id, invoice);
      return invoice;
    },
    getInvoice: async (id: string) => invoices.get(id) ?? null,
    getStore: () => store,
    emitX402AuditEvent: () => {},
  } as unknown as InvoiceEngine;

  const completeInvoice = (id: string): void => {
    const invoice = invoices.get(id);
    if (!invoice || invoice.status === "completed") return;
    invoices.set(id, {
      ...invoice,
      status: "completed",
      amountReceived: invoice.amount,
      completedAt: new Date().toISOString(),
    });
  };

  const expireInvoice = (id: string): void => {
    const invoice = invoices.get(id);
    if (!invoice) return;
    invoices.set(id, { ...invoice, status: "expired" });
  };

  const guard = createX402RouteGuard({
    getEngine: async () => engine,
    receiptSecret: SECRET,
    policy: options.policy ?? { name: "Paid data", amountAtomic: options.amountAtomic ?? 500n },
    enforceSingleUseReceipts: options.enforceSingleUseReceipts,
    protocolId: options.protocolId,
  });
  const guarded = guard(options.handler ?? (async () => Response.json({ secret: 42 })));

  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === "/api/pay/status") {
      polls += 1;
      const invoice = invoices.get(url.searchParams.get("invoiceId") ?? "");
      if (!invoice) return Response.json({ error: "Invoice not found" }, { status: 404 });
      if (options.completeAfterPolls !== undefined && polls >= options.completeAfterPolls) {
        completeInvoice(invoice.id);
      }
      const fresh = invoices.get(invoice.id)!;
      return Response.json({
        ...fresh,
        amount: fresh.amount.toString(),
        amountReceived: fresh.amountReceived.toString(),
        paymentId: fresh.paymentId.toString(),
        payments: [],
      });
    }
    if (url.pathname === "/api/pay/receipts/issue") {
      const body = (await request.json()) as {
        invoiceId: string;
        resource: string;
        ttlSeconds?: number;
      };
      const invoice = invoices.get(body.invoiceId);
      if (!invoice) return Response.json({ error: "Invoice not found" }, { status: 404 });
      if (invoice.status !== "completed") {
        return Response.json({ error: "Invoice is not completed yet" }, { status: 409 });
      }
      const issued = issueReceiptFromInvoice(invoice, {
        secret: options.issueSecret ?? SECRET,
        resource: body.resource,
        ttlSeconds: body.ttlSeconds,
      });
      return Response.json({ receipt: issued.token, claims: issued.claims });
    }
    return guarded(request);
  };

  return {
    handler,
    completeInvoice,
    expireInvoice,
    invoices,
    statusPolls: () => polls,
    lastInvoiceId: () => `inv-${seq}`,
  };
}

function makePayer(
  merchant: Merchant,
  opts: { settle?: "instant" | "never"; failFirst?: boolean; delayMs?: number } = {}
) {
  const calls: InvoicePayment[] = [];
  let failedOnce = false;
  const payer: InvoicePayer = async (payment) => {
    calls.push(payment);
    if (opts.failFirst && !failedOnce) {
      failedOnce = true;
      throw new Error("wallet offline");
    }
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.settle !== "never") merchant.completeInvoice(payment.invoiceId);
    return { txid: TXID };
  };
  return { payer, calls };
}

function makePolicy() {
  return new SpendPolicy({ allowOrigins: [ORIGIN], maxAtomicPerRequest: 10_000n });
}

/** Route payingFetch's underlying fetch into the in-process merchant. */
function fetchInto(handler: (req: Request) => Promise<Response>) {
  return (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init));
}

function makePayingFetch(
  merchant: Merchant,
  payer: InvoicePayer,
  extra: Partial<PayingFetchConfig> = {}
) {
  return createPayingFetch({
    payer,
    policy: makePolicy(),
    fetch: fetchInto(merchant.handler),
    settlePollIntervalMs: 1,
    ...extra,
  });
}

test("non-402 responses pass through untouched, nothing is paid", async () => {
  const merchant = makeMerchant();
  const { calls } = makePayer(merchant);
  const payingFetch = createPayingFetch({
    payer: makePayer(merchant).payer,
    policy: makePolicy(),
    fetch: fetchInto(async () => Response.json({ free: true })),
  });
  const res = await payingFetch(RESOURCE_URL);
  expect(res.status).toBe(200);
  expect(calls.length).toBe(0);
});

test("pays a 402, retries with X-DeroPay-Receipt, returns 200 with evidence", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant);
  const evidence: PaymentEvidence[] = [];

  const payingFetch = makePayingFetch(merchant, payer, {
    onPayment: (e) => evidence.push(e),
  });

  const res = await payingFetch(RESOURCE_URL);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ secret: 42 });

  expect(calls.length).toBe(1);
  expect(calls[0]).toMatchObject({
    invoiceId: "inv-1",
    integratedAddress: "deti1qinv1",
    amountAtomic: 500n,
    network: "dero-mainnet",
    resource: RESOURCE,
  });

  expect(evidence.length).toBe(1);
  expect(evidence[0]).toMatchObject({
    origin: ORIGIN,
    resource: RESOURCE,
    network: "dero-mainnet",
    invoiceId: "inv-1",
    integratedAddress: "deti1qinv1",
    amountAtomic: "500",
    txid: TXID,
  });
  expect(evidence[0].receiptJti).toBeTruthy();
});

test("policy denial throws before any wallet call", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant);
  const payingFetch = makePayingFetch(merchant, payer, {
    policy: new SpendPolicy({ allowOrigins: ["http://other.test"], maxAtomicPerRequest: 10_000n }),
  });

  await expect(payingFetch(RESOURCE_URL)).rejects.toThrowError(SpendPolicyError);
  expect(calls.length).toBe(0);
});

test("per-request cap denial throws before any wallet call", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant);
  const payingFetch = makePayingFetch(merchant, payer, {
    policy: new SpendPolicy({ allowOrigins: [ORIGIN], maxAtomicPerRequest: 499n }),
  });

  await expect(payingFetch(RESOURCE_URL)).rejects.toThrowError(SpendPolicyError);
  expect(calls.length).toBe(0);
});

test("failed transfer releases the reservation (budget is not burned)", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant, { failFirst: true });
  const policy = new SpendPolicy({
    allowOrigins: [ORIGIN],
    maxAtomicPerRequest: 10_000n,
    maxAtomicPerWindow: { amountAtomic: 500n, windowSeconds: 3600 },
  });
  const payingFetch = makePayingFetch(merchant, payer, { policy });

  await expect(payingFetch(RESOURCE_URL)).rejects.toThrowError("wallet offline");
  expect(policy.spentInWindow()).toBe(0n);

  const res = await payingFetch(RESOURCE_URL);
  expect(res.status).toBe(200);
  expect(policy.spentInWindow()).toBe(500n);
  expect(calls.length).toBe(2);
});

test("concurrent same-price requests share one payment", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant, { delayMs: 20 });
  const payingFetch = makePayingFetch(merchant, payer);

  const [a, b] = await Promise.all([payingFetch(RESOURCE_URL), payingFetch(RESOURCE_URL)]);
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  expect(calls.length).toBe(1);
});

test("concurrent different-price requests each pay their own invoice", async () => {
  const merchant = makeMerchant({
    policy: (request) => {
      const tokens = BigInt(new URL(request.url).searchParams.get("tokens") ?? "1");
      return { name: "metered", amountAtomic: tokens * 5n };
    },
  });
  const { payer, calls } = makePayer(merchant, { delayMs: 10 });
  const payingFetch = makePayingFetch(merchant, payer);

  const [a, b] = await Promise.all([
    payingFetch(`${RESOURCE_URL}?tokens=10`),
    payingFetch(`${RESOURCE_URL}?tokens=100`),
  ]);
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  expect(calls.length).toBe(2);
  expect(new Set(calls.map((c) => c.amountAtomic.toString()))).toEqual(new Set(["50", "500"]));
});

test("a live receipt is reused: the second call pays nothing", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant);
  const payingFetch = makePayingFetch(merchant, payer);

  const first = await payingFetch(RESOURCE_URL);
  expect(first.status).toBe(200);
  const second = await payingFetch(RESOURCE_URL);
  expect(second.status).toBe(200);
  expect(calls.length).toBe(1);
  expect(merchant.invoices.size).toBe(1);
});

test("reuseReceipts: false pays for every call", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant);
  const payingFetch = makePayingFetch(merchant, payer, { reuseReceipts: false });

  expect((await payingFetch(RESOURCE_URL)).status).toBe(200);
  expect((await payingFetch(RESOURCE_URL)).status).toBe(200);
  expect(calls.length).toBe(2);
});

test("single-use server: a burned cached receipt gets 409, is evicted, and a fresh payment follows", async () => {
  const merchant = makeMerchant({ enforceSingleUseReceipts: true });
  const { payer, calls } = makePayer(merchant);
  const payingFetch = makePayingFetch(merchant, payer);

  const first = await payingFetch(RESOURCE_URL);
  expect(first.status).toBe(200);

  // The cached receipt was consumed by the first call; the second call
  // must recover through a fresh challenge instead of failing.
  const second = await payingFetch(RESOURCE_URL);
  expect(second.status).toBe(200);
  expect(calls.length).toBe(2);
});

test("settlement lag: polls the invoice until confirmations land, then 200 with one payment", async () => {
  const merchant = makeMerchant({ completeAfterPolls: 3 });
  const { payer, calls } = makePayer(merchant, { settle: "never" });
  const payingFetch = makePayingFetch(merchant, payer);

  const res = await payingFetch(RESOURCE_URL);
  expect(res.status).toBe(200);
  expect(calls.length).toBe(1);
  expect(merchant.statusPolls()).toBeGreaterThanOrEqual(3);
});

test("settlement timeout throws X402SettlementTimeoutError and a later call resumes without re-paying", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant, { settle: "never" });
  const payingFetch = makePayingFetch(merchant, payer, { settleTimeoutMs: 5 });

  const error = await payingFetch(RESOURCE_URL).then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(X402SettlementTimeoutError);
  const timeout = error as X402SettlementTimeoutError;
  expect(timeout.reason).toBe("deadline");
  expect(timeout.invoiceId).toBe("inv-1");
  expect(timeout.txid).toBe(TXID);
  expect(timeout.paymentApi).toBe(`${ORIGIN}/api/pay`);

  // The chain settles later; the next call resumes the SAME invoice.
  merchant.completeInvoice("inv-1");
  const res = await payingFetch(RESOURCE_URL);
  expect(res.status).toBe(200);
  expect(calls.length).toBe(1);
});

test("an invoice that expires mid-settlement is terminal and the next call pays fresh", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant, { settle: "never" });
  const payingFetch = makePayingFetch(merchant, payer, { settleTimeoutMs: 1_000 });

  const attempt = payingFetch(RESOURCE_URL);
  // Let the payment land, then expire the invoice under the poller.
  await new Promise((r) => setTimeout(r, 5));
  merchant.expireInvoice("inv-1");

  const error = await attempt.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(X402SettlementTimeoutError);
  expect((error as X402SettlementTimeoutError).reason).toBe("invoice_expired");

  // The pending record is cleared — the next call pays a new invoice.
  const second = payingFetch(RESOURCE_URL);
  await new Promise((r) => setTimeout(r, 5));
  merchant.completeInvoice(merchant.lastInvoiceId());
  expect((await second).status).toBe(200);
  expect(calls.length).toBe(2);
});

test("a foreign 402 throws X402UnpayableError by default, passes through when configured", async () => {
  const foreign402 = async () =>
    new Response(
      JSON.stringify({
        x402Version: 1,
        resource: RESOURCE_URL,
        accepts: [{ scheme: "exact", network: "base", asset: "USDC" }],
      }),
      { status: 402, headers: { "Content-Type": "application/json" } }
    );
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant);

  const throwing = createPayingFetch({
    payer,
    policy: makePolicy(),
    fetch: fetchInto(foreign402),
  });
  await expect(throwing(RESOURCE_URL)).rejects.toThrowError(X402UnpayableError);

  const passthrough = createPayingFetch({
    payer,
    policy: makePolicy(),
    fetch: fetchInto(foreign402),
    unpayable: "passthrough",
  });
  const res = await passthrough(RESOURCE_URL);
  expect(res.status).toBe(402);
  expect(calls.length).toBe(0);
});

test("a challenge with an unexpected protocol id is unpayable", async () => {
  const merchant = makeMerchant({ protocolId: "x402-somebody-else" });
  const { payer, calls } = makePayer(merchant);
  const payingFetch = makePayingFetch(merchant, payer);

  await expect(payingFetch(RESOURCE_URL)).rejects.toThrowError(X402UnpayableError);
  expect(calls.length).toBe(0);
});

test("a 402 that persists after the receipt was issued throws X402PaymentRejectedError", async () => {
  // The issue endpoint signs with a key the guard does not accept, so the
  // minted receipt never satisfies the route: pay once, then refuse.
  const merchant = makeMerchant({ issueSecret: "some-other-secret" });
  const { payer, calls } = makePayer(merchant);
  const payingFetch = makePayingFetch(merchant, payer);

  await expect(payingFetch(RESOURCE_URL)).rejects.toThrowError(X402PaymentRejectedError);
  expect(calls.length).toBe(1);
});

test("replays a POST body on the paid retry", async () => {
  const received: string[] = [];
  const merchant = makeMerchant({
    handler: async (request) => {
      received.push(await request.text());
      return Response.json({ ok: 1 });
    },
  });
  const { payer } = makePayer(merchant);
  const payingFetch = makePayingFetch(merchant, payer);

  const res = await payingFetch(
    new Request(RESOURCE_URL, { method: "POST", body: JSON.stringify({ q: "hello" }) })
  );
  expect(res.status).toBe(200);
  expect(received).toEqual([JSON.stringify({ q: "hello" })]);
});

// --- CredentialPolicy drops into createPayingFetch unchanged (SpendGuard) ---

const CRED_ROOT = "c".repeat(64);

test("createPayingFetch pays through a verified CredentialPolicy", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant);
  const cred = mintSpendCredential({
    rootKeyHex: CRED_ROOT,
    id: "worker-1",
    caveats: [
      { type: "origin", value: ORIGIN },
      { type: "max-spend-atomic", value: "10000" },
      { type: "resource-prefix", value: "/api/" },
    ],
  });
  const payingFetch = makePayingFetch(merchant, payer, {
    policy: new CredentialPolicy(cred, CRED_ROOT),
  });

  const res = await payingFetch(RESOURCE_URL);
  expect(res.status).toBe(200);
  expect(calls.length).toBe(1);
});

test("an attenuated credential's tighter cap blocks the wallet call", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant);
  // Parent allows 10000; worker attenuates to 100 — below the 500 price.
  const parent = mintSpendCredential({
    rootKeyHex: CRED_ROOT,
    id: "worker-2",
    caveats: [
      { type: "origin", value: ORIGIN },
      { type: "max-spend-atomic", value: "10000" },
    ],
  });
  const worker = attenuate(parent, { type: "max-spend-atomic", value: "100" });
  const payingFetch = makePayingFetch(merchant, payer, {
    policy: new CredentialPolicy(worker, CRED_ROOT),
  });

  await expect(payingFetch(RESOURCE_URL)).rejects.toThrowError(CredentialError);
  expect(calls.length).toBe(0);
});

test("a resource-prefix caveat blocks payment for an out-of-scope resource", async () => {
  const merchant = makeMerchant();
  const { payer, calls } = makePayer(merchant);
  // Credential only permits /billing/* but the challenge is for /api/data.
  const cred = mintSpendCredential({
    rootKeyHex: CRED_ROOT,
    id: "worker-3",
    caveats: [
      { type: "origin", value: ORIGIN },
      { type: "max-spend-atomic", value: "10000" },
      { type: "resource-prefix", value: "/billing/" },
    ],
  });
  const payingFetch = makePayingFetch(merchant, payer, {
    policy: new CredentialPolicy(cred, CRED_ROOT),
  });

  await expect(payingFetch(RESOURCE_URL)).rejects.toThrowError(CredentialError);
  expect(calls.length).toBe(0);
});
