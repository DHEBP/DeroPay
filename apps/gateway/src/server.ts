import { Hono } from "hono";
import { cors } from "hono/cors";
import { getConnInfo } from "@hono/node-server/conninfo";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { InvoiceEngine } from "dero-pay/server";
import { RouterManager } from "dero-pay/router";
import type { CreateInvoiceParams, Invoice, InvoiceStatus } from "dero-pay";
import { loadConfig } from "./config.js";
import { getDeroPrice, fiatToDeroAtomic } from "./price-feed.js";

const config = loadConfig();

// ---------------------------------------------------------------------------
// Engine singleton
// ---------------------------------------------------------------------------

let engine: InvoiceEngine | null = null;
let engineStarting: Promise<void> | null = null;

async function getEngine(): Promise<InvoiceEngine> {
  if (!engine) {
    const rpcAuth =
      config.rpcUsername && config.rpcPassword
        ? { username: config.rpcUsername, password: config.rpcPassword }
        : undefined;

    engine = new InvoiceEngine({
      walletRpcUrl: config.walletRpcUrl,
      daemonRpcUrl: config.daemonRpcUrl,
      rpcAuth,
      webhookUrl: config.webhookUrl,
      webhookSecret: config.webhookSecret,
      webhookMaxRetries: config.webhookMaxRetries,
      defaultTtlSeconds: config.defaultTtlSeconds,
      defaultRequiredConfirmations: config.defaultRequiredConfirmations,
      pollIntervalMs: config.pollIntervalMs,
      enableEscrow: config.enableEscrow,
      escrowFeeBasisPoints: config.escrowFeeBasisPoints,
      escrowBlockExpiration: config.escrowBlockExpiration,
    });
  }

  if (!engine.running) {
    if (!engineStarting) {
      engineStarting = engine.start().then(() => {
        engineStarting = null;
      });
    }
    await engineStarting;
  }

  return engine;
}

// ---------------------------------------------------------------------------
// Router manager singleton (optional — enabled via DEROPAY_ENABLE_ROUTER)
// ---------------------------------------------------------------------------

let routerManager: RouterManager | null = null;

function getRouterManager(): RouterManager {
  if (!config.enableRouter) {
    throw new Error("Payment router is not enabled. Set DEROPAY_ENABLE_ROUTER=true");
  }

  if (!routerManager) {
    const rpcAuth =
      config.rpcUsername && config.rpcPassword
        ? { username: config.rpcUsername, password: config.rpcPassword }
        : undefined;

    routerManager = new RouterManager({
      walletRpcUrl: config.walletRpcUrl,
      daemonRpcUrl: config.daemonRpcUrl,
      rpcAuth,
    });
  }

  return routerManager;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeInvoice(invoice: Invoice): Record<string, unknown> {
  return {
    ...invoice,
    amount: invoice.amount.toString(),
    amountReceived: invoice.amountReceived.toString(),
    paymentId: invoice.paymentId.toString(),
    payments: invoice.payments.map((p) => ({
      ...p,
      amount: p.amount.toString(),
      destinationPort: p.destinationPort.toString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Escrow claim tokens (merchant-held secret)
// ---------------------------------------------------------------------------
//
// On escrow-invoice creation the gateway mints an unguessable token, hands it
// back to the merchant in the POST /invoices response, and keeps it here keyed
// by invoiceId. The public buyer-claim route requires a matching token, so a
// stranger holding only the public checkout URL cannot self-bind (grief) the
// escrow. The token is NEVER serialized onto the invoice/escrow blob, so
// GET /status (which returns serializeInvoice) can never leak it.
//
// NOTE: in-memory. A multi-process / horizontally-scaled gateway needs this
// moved to a shared store (Redis / the InvoiceStore) — otherwise a claim that
// lands on a different worker than the one that minted the token will 404 the
// token. Single-process is the current deployment model.
const claimTokens = new Map<string, string>();

/** Timing-safe token compare — avoids a byte-by-byte early-exit oracle. */
function claimTokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on length mismatch; length itself is not secret, but
  // branch on it in constant-time-ish fashion by hashing both to equal length is
  // overkill here — a plain length check before the safe compare is standard.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** dero1… base address ONLY — mirrors api.ts:472 / escrow contract.ts. */
const DERO_BASE_ADDRESS = /^dero1[0-9a-z]{40,}$/i;
const DERO_INTEGRATED_ADDRESS = /^deto1[0-9a-z]{40,}$/i;

// ---------------------------------------------------------------------------
// Rate limiter — public claim endpoint (per-IP AND per-invoiceId)
// ---------------------------------------------------------------------------
//
// A small in-memory token bucket. The public claim route is unauthenticated and
// triggers a platform-funded on-chain deploy, so it is the prime griefing/gas-DoS
// surface. We throttle on BOTH the caller IP and the target invoiceId: per-IP
// stops one host from spraying many invoices; per-invoiceId stops many hosts (or
// a rotating IP) from hammering ONE invoice's deploy path.
//
// NOTE: in-memory — a multi-process gateway needs a SHARED limiter (Redis) or a
// single host will only see its slice of traffic and the limit will effectively
// multiply by the worker count.
type Bucket = { tokens: number; last: number };
const CLAIM_RL_CAPACITY = 5; // burst
const CLAIM_RL_REFILL_PER_SEC = 0.2; // ~1 token / 5s sustained
const claimBuckets = new Map<string, Bucket>();

/**
 * Derive the client IP used to key the per-IP claim rate limit.
 *
 * X-Forwarded-For is CLIENT-SUPPLIED and trivially spoofable, so a caller could
 * forge a fresh IP per request and defeat the per-IP limiter entirely. Only honor
 * it when the operator asserts (DEROPAY_TRUST_PROXY=true) that a trusted proxy/LB
 * OVERWRITES the header. Otherwise use the real socket peer address, which the
 * caller cannot forge. Falls back to a single shared "unknown" bucket if the
 * runtime does not expose conninfo (fail closed: everyone shares one limit).
 */
function getClientIp(c: any): string {
  if (config.trustProxy) {
    return (
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "unknown"
    );
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

function rateLimitOk(key: string): boolean {
  const now = Date.now();
  const bucket = claimBuckets.get(key) ?? { tokens: CLAIM_RL_CAPACITY, last: now };
  const elapsedSec = (now - bucket.last) / 1000;
  bucket.tokens = Math.min(
    CLAIM_RL_CAPACITY,
    bucket.tokens + elapsedSec * CLAIM_RL_REFILL_PER_SEC
  );
  bucket.last = now;
  if (bucket.tokens < 1) {
    claimBuckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  claimBuckets.set(key, bucket);
  return true;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export const app = new Hono();

// CORS. The buyer claim (POST /checkout/claim) is a browser write from the
// checkout origin, so it must be allowed here. corsOrigin defaults to "*" for
// the read-only status/price surface; once public WRITES exist (the claim),
// tighten DEROPAY_CORS_ORIGIN to the exact checkout origin(s) in production so a
// hostile page cannot drive claims on the buyer's behalf.
app.use("*", cors({ origin: config.corsOrigin }));

// Loud config warning: a wildcard CORS origin on a build that also serves the
// public escrow claim WRITE means any web page can drive buyer claims. The claim
// route itself fails closed on this (see POST /checkout/claim) unless the
// operator explicitly opts in via DEROPAY_ALLOW_WILDCARD_CORS=true.
if (config.enableEscrow && config.corsOrigin === "*") {
  console.warn(
    "[deropay] DEROPAY_CORS_ORIGIN is '*' while escrow (public claim write) is " +
      "enabled. Set DEROPAY_CORS_ORIGIN to your exact checkout origin(s) for " +
      "production. The claim write fails closed until you do (override with " +
      "DEROPAY_ALLOW_WILDCARD_CORS=true for an intentionally open deployment)."
  );
}

// API key auth for protected routes
app.use("/invoices/*", apiKeyAuth);
app.use("/invoices", apiKeyAuth);
app.use("/stats", apiKeyAuth);
app.use("/escrow/*", apiKeyAuth);
app.use("/escrows", apiKeyAuth);
app.use("/router/*", apiKeyAuth);
app.use("/routers", apiKeyAuth);

async function apiKeyAuth(c: any, next: any) {
  if (config.apiKeys.length === 0) {
    return next();
  }

  const key = c.req.header("X-DeroPay-ApiKey");
  if (!key || !config.apiKeys.includes(key)) {
    return c.json(
      { error: "Invalid or missing API key. Include X-DeroPay-ApiKey header." },
      401
    );
  }
  return next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check — always public
app.get("/health", async (c) => {
  try {
    const eng = await getEngine();
    const balance = await eng.getBalance();
    const address = eng.getBaseAddress();

    return c.json({
      status: "ok",
      engine: eng.running ? "running" : "stopped",
      wallet: {
        address,
        balance: balance.balance.toString(),
        unlockedBalance: balance.unlockedBalance.toString(),
      },
    });
  } catch (err) {
    return c.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      503
    );
  }
});

// Current DERO price — public, no auth
app.get("/price", async (c) => {
  try {
    const price = await getDeroPrice();
    return c.json(price);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Price feed unavailable" },
      503
    );
  }
});

// Convert fiat to DERO — public, no auth
app.get("/convert", async (c) => {
  try {
    const amountStr = c.req.query("amount");
    const currency = c.req.query("currency") ?? "usd";

    if (!amountStr) return c.json({ error: "Missing amount query parameter" }, 400);

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return c.json({ error: "Invalid amount" }, 400);
    }

    const result = await fiatToDeroAtomic(amount, currency);
    return c.json(result);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Conversion failed" },
      500
    );
  }
});

// Create invoice
app.post("/invoices", async (c) => {
  try {
    const eng = await getEngine();
    const body = await c.req.json();

    if (!body.name) return c.json({ error: "Missing name" }, 400);

    // Support both direct atomic amounts and fiat conversion
    let atomicAmount: bigint;

    if (body.amount) {
      atomicAmount = BigInt(body.amount);
    } else if (body.fiatAmount && body.currency) {
      const converted = await fiatToDeroAtomic(
        parseFloat(body.fiatAmount),
        body.currency
      );
      atomicAmount = BigInt(converted.atomicUnits);
    } else {
      return c.json(
        { error: "Provide either amount (atomic units) or fiatAmount + currency" },
        400
      );
    }

    const params: CreateInvoiceParams = {
      name: body.name,
      description: body.description,
      amount: atomicAmount,
      ttlSeconds: body.ttlSeconds,
      requiredConfirmations: body.requiredConfirmations,
      metadata: body.metadata,
    };

    if (body.escrow) {
      if (!body.escrow.sellerAddress) {
        return c.json({ error: "Escrow requires sellerAddress" }, 400);
      }
      params.escrow = {
        sellerAddress: body.escrow.sellerAddress,
        arbitratorAddress: body.escrow.arbitratorAddress,
        feeBasisPoints: body.escrow.feeBasisPoints,
        blockExpiration: body.escrow.blockExpiration,
      };
    }

    const invoice = await eng.createInvoice(params);
    const responseBody = serializeInvoice(invoice);

    // Escrow invoices get a merchant claim token. It is minted here, kept
    // server-side keyed by invoiceId (NEVER on the invoice blob — GET /status
    // must not expose it), and returned ONLY in this authenticated create
    // response so the merchant can build the checkout URL with &claimToken=…
    if (invoice.escrow) {
      const claimToken = randomBytes(32).toString("base64url");
      claimTokens.set(invoice.id, claimToken);
      responseBody.claimToken = claimToken;
    }

    return c.json(responseBody, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Get invoice by ID
app.get("/invoices/:id", async (c) => {
  try {
    const eng = await getEngine();
    const invoice = await eng.getInvoice(c.req.param("id"));

    if (!invoice) return c.json({ error: "Invoice not found" }, 404);

    return c.json(serializeInvoice(invoice));
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// List invoices
app.get("/invoices", async (c) => {
  try {
    const eng = await getEngine();
    const status = c.req.query("status") as InvoiceStatus | undefined;
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    const invoices = await eng.listInvoices({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return c.json(invoices.map(serializeInvoice));
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Invoice stats
app.get("/stats", async (c) => {
  try {
    const eng = await getEngine();
    const stats = await eng.getStats();

    return c.json({
      ...stats,
      totalAmountReceived: stats.totalAmountReceived.toString(),
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Invoice status by query param (for simple polling from checkout widgets)
app.get("/status", async (c) => {
  try {
    const eng = await getEngine();
    const invoiceId = c.req.query("invoiceId");

    if (!invoiceId) {
      return c.json({ error: "Missing invoiceId query parameter" }, 400);
    }

    const invoice = await eng.getInvoice(invoiceId);
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);

    return c.json(serializeInvoice(invoice));
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Public buyer escrow claim — NOT behind apiKeyAuth.
//
// The path is /checkout/claim, deliberately OUTSIDE the /escrow/* prefix that
// `app.use("/escrow/*", apiKeyAuth)` guards, so it stays public without
// restructuring the auth middleware. Buyers reach it from the checkout SPA.
//
// Security: theft is already blocked on-chain (Deposit() requires SIGNER()==the
// bound buyer, and first-claim-wins). The token here is purely anti-GRIEFING —
// it stops a stranger with the public URL from self-binding the escrow and
// forcing a bricked contract + wasted platform deploy gas. Body:
//   { invoiceId, buyerAddress, claimToken }
app.post("/checkout/claim", async (c) => {
  try {
    // Fail closed on a wildcard CORS write surface. With origin '*' any page can
    // drive claims on a buyer's behalf; refuse the write rather than serve it
    // insecurely, unless the operator has explicitly opted into an open deployment.
    if (config.corsOrigin === "*" && !config.allowWildcardCorsWrites) {
      return c.json(
        {
          error:
            "Claim endpoint disabled: server has wildcard CORS (DEROPAY_CORS_ORIGIN='*'). " +
            "Set DEROPAY_CORS_ORIGIN to the exact checkout origin(s), or set " +
            "DEROPAY_ALLOW_WILDCARD_CORS=true to allow an open deployment.",
          code: "cors_misconfigured",
        },
        503
      );
    }

    // Rate limit BEFORE any work — this route triggers a platform-funded deploy.
    // Throttle per-IP and per-invoiceId (see rateLimitOk notes).
    const ip = getClientIp(c);

    let body: { invoiceId?: string; buyerAddress?: string; claimToken?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.invoiceId) return c.json({ error: "Missing invoiceId" }, 400);
    if (!body.buyerAddress) return c.json({ error: "Missing buyerAddress" }, 400);
    if (!body.claimToken) return c.json({ error: "Missing claimToken" }, 400);

    if (!rateLimitOk(`ip:${ip}`) || !rateLimitOk(`inv:${body.invoiceId}`)) {
      return c.json({ error: "Too many claim attempts. Slow down." }, 429);
    }

    // Base dero1… only — reject deto1… (integrated) with the SAME message as
    // api.ts:472-478. An integrated address embeds a payment-ID and can never
    // match SIGNER() on-chain, which would brick Deposit() after a paid deploy.
    if (!DERO_BASE_ADDRESS.test(body.buyerAddress)) {
      const isIntegrated = DERO_INTEGRATED_ADDRESS.test(body.buyerAddress);
      return c.json(
        {
          error: isIntegrated
            ? "buyerAddress is an integrated (deto1…) address; escrow parties must be base (dero1…) addresses."
            : "buyerAddress is not a valid DERO base address",
        },
        400
      );
    }

    const eng = await getEngine();
    const invoice = await eng.getInvoice(body.invoiceId);
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);
    if (!invoice.escrow) {
      return c.json({ error: "Invoice is not an escrow invoice" }, 400);
    }

    // Constant-time token check. A missing token entry (unknown/expired invoice)
    // is still routed through the compare against an empty string so the timing
    // does not distinguish "no token on file" from "wrong token".
    const expected = claimTokens.get(body.invoiceId) ?? "";
    if (!expected || !claimTokenMatches(body.claimToken, expected)) {
      return c.json({ error: "Invalid claim token" }, 403);
    }

    // Idempotency / already-claimed handling — mirror api.ts. If the escrow is
    // past the claimable point, return 409 with the bound buyerAddress so the
    // client can detect a mismatch (a different buyer already bound it) and
    // refuse to deposit.
    const CLAIM_BLOCKED_STATUSES = new Set([
      "deploying",
      "awaiting_deposit",
      "funded",
      "disputed",
      "released",
      "refunded",
      "expired_claimed",
      "arbitrated",
      "cancelled",
    ]);
    if (CLAIM_BLOCKED_STATUSES.has(invoice.escrow.escrowStatus)) {
      return c.json(
        {
          error: `Escrow already claimed (status: ${invoice.escrow.escrowStatus})`,
          code: "already_claimed",
          escrowStatus: invoice.escrow.escrowStatus,
          scid: invoice.escrow.scid,
          buyerAddress: invoice.escrow.buyerAddress,
        },
        409
      );
    }

    let claimed;
    try {
      claimed = await eng.claimEscrowInvoice(body.invoiceId, body.buyerAddress);
    } catch (claimErr) {
      // A concurrent claim can win the durable guard between the status check
      // above and here (TOCTOU): the engine's claim guard fail-closes so no
      // second contract deploys, but it throws "not claimable / concurrently
      // claimed". Translate that into a clean 409 with the CURRENT bound state
      // (re-read) so the client sees the same already-claimed shape and can warn
      // on a buyer mismatch — not an opaque 500.
      const msg = claimErr instanceof Error ? claimErr.message : String(claimErr);
      if (/not claimable|concurrently claimed|already/i.test(msg)) {
        const current = await eng.getInvoice(body.invoiceId);
        return c.json(
          {
            error: "Escrow already claimed",
            code: "already_claimed",
            escrowStatus: current?.escrow?.escrowStatus ?? null,
            scid: current?.escrow?.scid ?? null,
            buyerAddress: current?.escrow?.buyerAddress ?? null,
          },
          409
        );
      }
      throw claimErr;
    }

    return c.json({
      scid: claimed.escrow?.scid ?? null,
      escrowStatus: claimed.escrow?.escrowStatus ?? null,
      buyerAddress: claimed.escrow?.buyerAddress ?? null,
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Escrow action
app.post("/escrow/:invoiceId/:action", async (c) => {
  try {
    const eng = await getEngine();
    const { invoiceId, action } = c.req.param();

    const validActions = [
      "confirmDelivery",
      "refundBuyer",
      "dispute",
      "claimAfterExpiry",
      "arbitrateRelease",
      "arbitrateRefund",
    ];

    if (!validActions.includes(action)) {
      return c.json(
        { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
        400
      );
    }

    const txid = await eng.escrowAction(
      invoiceId,
      action as Parameters<typeof eng.escrowAction>[1]
    );

    return c.json({ txid });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// List escrow invoices
app.get("/escrows", async (c) => {
  try {
    const eng = await getEngine();
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    const allInvoices = await eng.listInvoices({
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    const escrowInvoices = allInvoices.filter((inv) => inv.escrow !== null);
    return c.json(escrowInvoices.map(serializeInvoice));
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// ---------------------------------------------------------------------------
// Payment Router routes
// ---------------------------------------------------------------------------

// Deploy a new payment router contract
app.post("/router/deploy", async (c) => {
  try {
    const manager = getRouterManager();
    const body = await c.req.json().catch(() => ({}));

    const router = await manager.deployRouter({
      feeRecipientAddress: body.feeRecipientAddress,
      feeBasisPoints: body.feeBasisPoints ? parseInt(body.feeBasisPoints, 10) : 0,
    });

    return c.json(
      {
        id: router.id,
        scid: router.scid,
        status: router.status,
        feeBasisPoints: router.feeBasisPoints,
        feeRecipientAddress: router.feeRecipientAddress,
        createdAt: router.createdAt,
      },
      201
    );
  } catch (err) {
    const status = err instanceof Error && err.message.includes("not enabled") ? 400 : 500;
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      status
    );
  }
});

// Send a payment through a router contract
app.post("/router/:scid/pay", async (c) => {
  try {
    const manager = getRouterManager();
    const { scid } = c.req.param();
    const body = await c.req.json();

    if (!body.invoiceId) return c.json({ error: "Missing invoiceId" }, 400);

    let atomicAmount: bigint;

    if (body.amount) {
      atomicAmount = BigInt(body.amount);
    } else if (body.fiatAmount && body.currency) {
      const converted = await fiatToDeroAtomic(
        parseFloat(body.fiatAmount),
        body.currency
      );
      atomicAmount = BigInt(converted.atomicUnits);
    } else {
      return c.json(
        { error: "Provide either amount (atomic units) or fiatAmount + currency" },
        400
      );
    }

    const txid = await manager.pay(scid, body.invoiceId, atomicAmount);
    return c.json({ txid, scid, invoiceId: body.invoiceId });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Get on-chain state of a router contract
app.get("/router/:scid", async (c) => {
  try {
    const manager = getRouterManager();
    const { scid } = c.req.param();
    const state = await manager.getOnChainState(scid);

    return c.json({
      scid: state.scid,
      merchant: state.merchant,
      feeRecipient: state.feeRecipient,
      feeBasisPoints: state.feeBasisPoints,
      totalProcessed: state.totalProcessed.toString(),
      totalFees: state.totalFees.toString(),
      paymentCount: state.paymentCount,
      scBalance: state.scBalance,
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Update merchant address on a router contract
app.post("/router/:scid/update-merchant", async (c) => {
  try {
    const manager = getRouterManager();
    const { scid } = c.req.param();
    const body = await c.req.json();

    if (!body.newAddress) return c.json({ error: "Missing newAddress" }, 400);

    const txid = await manager.updateMerchant(scid, body.newAddress);
    return c.json({ txid, scid });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// List all locally tracked routers
app.get("/routers", async (c) => {
  try {
    const manager = getRouterManager();
    const routers = manager.listRouters();

    return c.json(
      routers.map((r) => ({
        id: r.id,
        scid: r.scid,
        status: r.status,
        feeBasisPoints: r.feeBasisPoints,
        feeRecipientAddress: r.feeRecipientAddress,
        createdAt: r.createdAt,
      }))
    );
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// ---------------------------------------------------------------------------
// Webhook routes
// ---------------------------------------------------------------------------

// Webhook verification endpoint (for external services to verify signatures)
app.post("/webhooks/verify", async (c) => {
  try {
    const { verifyWebhookSignature } = await import("dero-pay/server");

    if (!config.webhookSecret) {
      return c.json({ error: "Webhook secret not configured" }, 500);
    }

    const signature = c.req.header("X-DeroPay-Signature");
    if (!signature) return c.json({ error: "Missing signature" }, 401);

    const body = await c.req.text();

    if (!verifyWebhookSignature(body, signature, config.webhookSecret)) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    return c.json({ verified: true });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});
