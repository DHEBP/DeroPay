/**
 * Next.js API route handlers for DeroPay.
 *
 * Provides ready-made handlers for invoice creation, status checking,
 * and webhook reception.
 *
 * Usage in Next.js App Router:
 * ```ts
 * // app/api/pay/create/route.ts
 * import { createPaymentHandlers } from "dero-pay/next";
 *
 * const { createInvoiceHandler } = createPaymentHandlers({
 *   walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
 *   daemonRpcUrl: "http://127.0.0.1:10102/json_rpc",
 *   webhookUrl: "https://mystore.com/webhooks/dero",
 *   webhookSecret: process.env.WEBHOOK_SECRET!,
 * });
 *
 * export const POST = createInvoiceHandler;
 * ```
 *
 * ```ts
 * // app/api/pay/status/route.ts
 * const { statusHandler } = createPaymentHandlers({ ... });
 * export const GET = statusHandler;
 * ```
 *
 * ```ts
 * // app/api/pay/webhook/route.ts
 * const { webhookHandler } = createPaymentHandlers({ ... });
 * export const POST = webhookHandler;
 * ```
 */

import { InvoiceEngine } from "../server/invoice-engine.js";
import { verifyWebhookSignature } from "../webhook/dispatcher.js";
import {
  issueReceiptFromInvoice,
  verifyPaymentReceipt,
  type ReceiptSecrets,
} from "../server/payment-receipts.js";
import type {
  DeroPayConfig,
  CreateInvoiceParams,
  DeroChainId,
} from "../core/types.js";
import { parseX402AuthorizationHeader } from "../core/x402-headers.js";
import type { InvoiceStore } from "../store/types.js";

/** Configuration for the payment handlers */
export type PaymentHandlersConfig = DeroPayConfig & {
  /** Custom store implementation */
  store?: InvoiceStore;
  /** Whether to auto-start the engine (default: true) */
  autoStart?: boolean;
  /** Secret used to sign and verify payment receipts */
  receiptSecret?: string;
  /** Secrets by key ID for receipt key rotation (verification supports all keys) */
  receiptSecrets?: Record<string, string>;
  /** Active key ID used to issue new receipts when receiptSecrets is set */
  receiptKeyId?: string;
};

// Singleton engine instance per configuration
let engineInstance: InvoiceEngine | null = null;
let engineStarting: Promise<void> | null = null;

/**
 * Get or create the singleton InvoiceEngine instance.
 */
async function getEngine(config: PaymentHandlersConfig): Promise<InvoiceEngine> {
  if (!engineInstance) {
    engineInstance = new InvoiceEngine(config);
  }

  if (config.autoStart !== false && !engineInstance.running) {
    if (!engineStarting) {
      engineStarting = engineInstance.start().then(() => {
        engineStarting = null;
      });
    }
    await engineStarting;
  }

  return engineInstance;
}

function resolveReceiptVerificationSecrets(
  config: PaymentHandlersConfig
): ReceiptSecrets | null {
  if (config.receiptSecrets && Object.keys(config.receiptSecrets).length > 0) {
    return config.receiptSecrets;
  }
  if (config.receiptSecret) {
    return config.receiptSecret;
  }
  return null;
}

function resolveReceiptSigningKey(
  config: PaymentHandlersConfig
): { secret: string; keyId?: string } | null {
  if (config.receiptSecrets && Object.keys(config.receiptSecrets).length > 0) {
    if (config.receiptKeyId) {
      const keyed = config.receiptSecrets[config.receiptKeyId];
      if (!keyed) {
        throw new Error(`receiptKeyId '${config.receiptKeyId}' not found in receiptSecrets`);
      }
      return { secret: keyed, keyId: config.receiptKeyId };
    }

    const [firstKeyId, firstSecret] = Object.entries(config.receiptSecrets)[0] ?? [];
    if (!firstKeyId || !firstSecret) {
      return null;
    }
    return { secret: firstSecret, keyId: firstKeyId };
  }

  if (config.receiptSecret) {
    return { secret: config.receiptSecret };
  }
  return null;
}

/**
 * Create Next.js API route handlers for DeroPay.
 */
export function createPaymentHandlers(config: PaymentHandlersConfig) {
  /**
   * POST /api/pay/create
   * Body: { name, description?, amount, ttlSeconds?, requiredConfirmations?, metadata? }
   * Returns: Invoice
   *
   * `amount` should be a string representation of the BigInt atomic units.
   */
  async function createInvoiceHandler(request: Request): Promise<Response> {
    try {
      const engine = await getEngine(config);
      
      // Handle empty body or invalid JSON safely
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return Response.json({ error: "Invalid JSON body" }, { 
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }

      if (!body.name) {
        return Response.json({ error: "Missing name" }, { 
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }

      if (!body.amount) {
        return Response.json({ error: "Missing amount" }, { 
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }

      const params: CreateInvoiceParams = {
        name: body.name,
        description: body.description,
        amount: BigInt(body.amount),
        ttlSeconds: body.ttlSeconds,
        requiredConfirmations: body.requiredConfirmations,
        metadata: body.metadata,
      };

      // Add escrow params if provided
      if (body.escrow) {
        if (!body.escrow.sellerAddress) {
          return Response.json({ error: "Escrow requires sellerAddress" }, { status: 400 });
        }
        params.escrow = {
          sellerAddress: body.escrow.sellerAddress,
          arbitratorAddress: body.escrow.arbitratorAddress,
          feeBasisPoints: body.escrow.feeBasisPoints,
          blockExpiration: body.escrow.blockExpiration,
        };
      }

      const invoice = await engine.createInvoice(params);

      return Response.json(serializeInvoice(invoice), {
        headers: {
          "Access-Control-Allow-Origin": "*",
        }
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        { 
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
          }
        }
      );
    }
  }

  /**
   * GET /api/pay/status?invoiceId=xxx
   * Returns: Invoice
   */
  async function statusHandler(request: Request): Promise<Response> {
    try {
      const engine = await getEngine(config);
      const url = new URL(request.url);
      const invoiceId = url.searchParams.get("invoiceId");

      if (!invoiceId) {
        return Response.json(
          { error: "Missing invoiceId query parameter" },
          { status: 400 }
        );
      }

      const invoice = await engine.getInvoice(invoiceId);

      if (!invoice) {
        return Response.json(
          { error: "Invoice not found" },
          { 
            status: 404,
            headers: {
              "Access-Control-Allow-Origin": "*",
            }
          }
        );
      }

      return Response.json(serializeInvoice(invoice), {
        headers: {
          "Access-Control-Allow-Origin": "*",
        }
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        { 
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
          }
        }
      );
    }
  }

  /**
   * GET /api/pay/invoices?status=pending&limit=50&offset=0
   * Returns: Invoice[]
   */
  async function listInvoicesHandler(request: Request): Promise<Response> {
    try {
      const engine = await getEngine(config);
      const url = new URL(request.url);

      const status = url.searchParams.get("status") ?? undefined;
      const limit = url.searchParams.get("limit");
      const offset = url.searchParams.get("offset");

      const invoices = await engine.listInvoices({
        status: status as import("../core/types.js").InvoiceStatus | undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });

      return Response.json(invoices.map(serializeInvoice));
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        { status: 500 }
      );
    }
  }

  /**
   * GET /api/pay/stats
   * Returns: InvoiceStats
   */
  async function statsHandler(_request: Request): Promise<Response> {
    try {
      const engine = await getEngine(config);
      const stats = await engine.getStats();

      return Response.json({
        ...stats,
        totalAmountReceived: stats.totalAmountReceived.toString(),
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        { status: 500 }
      );
    }
  }

  /**
   * POST /api/pay/webhook
   * Verifies the webhook signature and processes the event.
   *
   * This handler is for receiving webhooks FROM DeroPay (if you're
   * running DeroPay as a separate service). Most setups won't need this.
   */
  async function webhookHandler(request: Request): Promise<Response> {
    try {
      if (!config.webhookSecret) {
        return Response.json(
          { error: "Webhook secret not configured" },
          { status: 500 }
        );
      }

      const signature = request.headers.get("X-DeroPay-Signature");
      if (!signature) {
        return Response.json(
          { error: "Missing signature" },
          { status: 401 }
        );
      }

      const body = await request.text();

      if (!verifyWebhookSignature(body, signature, config.webhookSecret)) {
        return Response.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }

      // Signature valid — the caller can process the event
      return Response.json({ received: true });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        { status: 500 }
      );
    }
  }

  /**
   * GET /api/pay/health
   * Returns connectivity status for wallet and daemon.
   */
  async function healthHandler(_request: Request): Promise<Response> {
    try {
      const engine = await getEngine(config);
      const balance = await engine.getBalance();
      const address = engine.getBaseAddress();

      return Response.json({
        status: "ok",
        engine: engine.running ? "running" : "stopped",
        wallet: {
          address,
          balance: balance.balance.toString(),
          unlockedBalance: balance.unlockedBalance.toString(),
        },
      });
    } catch (err) {
      return Response.json(
        {
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        },
        { status: 503 }
      );
    }
  }

  /**
   * POST /api/pay/escrow
   * Body: { invoiceId, action }
   * Actions: "confirmDelivery" | "refundBuyer" | "dispute" | "claimAfterExpiry" | "arbitrateRelease" | "arbitrateRefund"
   * Returns: { txid }
   */
  async function escrowActionHandler(request: Request): Promise<Response> {
    try {
      const engine = await getEngine(config);
      const body = (await request.json()) as {
        invoiceId?: string;
        action?: string;
      };

      if (!body.invoiceId) {
        return Response.json({ error: "Missing invoiceId" }, { status: 400 });
      }

      if (!body.action) {
        return Response.json({ error: "Missing action" }, { status: 400 });
      }

      const validActions = [
        "confirmDelivery",
        "refundBuyer",
        "dispute",
        "claimAfterExpiry",
        "arbitrateRelease",
        "arbitrateRefund",
      ];

      if (!validActions.includes(body.action)) {
        return Response.json(
          { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
          { status: 400 }
        );
      }

      const txid = await engine.escrowAction(
        body.invoiceId,
        body.action as Parameters<typeof engine.escrowAction>[1]
      );

      return Response.json({ txid });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        { status: 500 }
      );
    }
  }

  /**
   * POST /api/pay/escrow/claim
   * Body: { invoiceId, buyerAddress }
   * Returns: the serialized updated Invoice (escrow now "awaiting_deposit")
   *
   * Gate 2 — binds a PROVEN buyer to a QUOTED escrow and deploys the contract.
   * `buyerAddress` MUST come from a self-proving wallet-connect (or a
   * format-checked manual entry the buyer explicitly confirmed): the address it
   * carries becomes the on-chain refund/dispute-payout target, so an unproven or
   * wrong address silently misroutes funds. This handler is the server backstop
   * for the SDK-level assertDeroAddress guard — it re-rejects deto1… (integrated)
   * addresses BEFORE any deploy gas, mirroring escrow/contract.ts.
   */
  async function claimEscrowInvoiceHandler(request: Request): Promise<Response> {
    try {
      const engine = await getEngine(config);

      let body: { invoiceId?: string; buyerAddress?: string };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json(
          { error: "Invalid JSON body" },
          { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
        );
      }

      if (!body.invoiceId) {
        return Response.json(
          { error: "Missing invoiceId" },
          { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
        );
      }
      if (!body.buyerAddress) {
        return Response.json(
          { error: "Missing buyerAddress" },
          { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
        );
      }
      // Mirror escrow/contract.ts assertDeroAddress: base dero1… ONLY. Rejecting
      // deto1… (integrated) here means the deploy path never binds a payment-ID
      // address that SIGNER() can never match on-chain (would brick Deposit()).
      if (!/^dero1[0-9a-z]{40,}$/i.test(body.buyerAddress)) {
        const isIntegrated = /^deto1[0-9a-z]{40,}$/i.test(body.buyerAddress);
        return Response.json(
          {
            error: isIntegrated
              ? "buyerAddress is an integrated (deto1…) address; escrow parties must be base (dero1…) addresses."
              : "buyerAddress is not a valid DERO base address",
          },
          { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
        );
      }

      // Idempotency pre-check — if the escrow is in a state that is genuinely
      // terminal or in-flight for THIS handler, another tab/worker has already
      // claimed it (or it advanced past claim). Return 409 with the current invoice
      // so the client can adopt the live state instead of hard-failing.
      //
      // Critically, 'quoted' AND 'deploy_failed' fall THROUGH to the engine: a
      // deploy_failed escrow is RECOVERABLE — engine.claimEscrowInvoice re-quotes it
      // inline (the O19 path) so a proven buyer whose deploy merely blipped can
      // retry. Short-circuiting deploy_failed here with a 409 would kill that
      // recovery and trap the buyer in a retry<->poll loop (the client's 409 branch
      // starts polling, the poll re-reads deploy_failed, the Retry re-POSTs → 409
      // again, forever). The engine's durable claim guard is the authoritative race
      // resolver; this pre-check only early-outs states the engine itself would
      // reject as "not claimable".
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
      const existing = await engine.getInvoice(body.invoiceId);
      if (
        existing?.escrow &&
        CLAIM_BLOCKED_STATUSES.has(existing.escrow.escrowStatus)
      ) {
        return Response.json(
          {
            error: `Escrow already claimed (status: ${existing.escrow.escrowStatus})`,
            code: "already_claimed",
            invoice: serializeInvoice(existing),
          },
          { status: 409, headers: { "Access-Control-Allow-Origin": "*" } }
        );
      }

      const invoice = await engine.claimEscrowInvoice(
        body.invoiceId,
        body.buyerAddress
      );

      return Response.json(serializeInvoice(invoice), {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      // Also surface a stable machine code so the client is not forced to
      // substring-match the human message across the engine→HTTP→client boundary
      // (the raw engine message is still forwarded for display/back-compat).
      return Response.json(
        { error: message, code: classifyClaimError(message) },
        {
          status: mapClaimErrorToStatus(message),
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }
  }

  /**
   * GET /api/pay/escrows?status=funded&limit=50
   * Returns: Invoice[] (only invoices with escrow data)
   */
  async function listEscrowsHandler(request: Request): Promise<Response> {
    try {
      const engine = await getEngine(config);
      const url = new URL(request.url);

      const limit = url.searchParams.get("limit");
      const offset = url.searchParams.get("offset");

      const allInvoices = await engine.listInvoices({
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : undefined,
      });

      // Filter to only escrow-backed invoices
      const escrowInvoices = allInvoices.filter((inv) => inv.escrow !== null);

      return Response.json(escrowInvoices.map(serializeInvoice));
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        { status: 500 }
      );
    }
  }

  /**
   * POST /api/pay/receipts/issue
   * Body: { invoiceId, resource, ttlSeconds?, network? }
   * Returns: { receipt, claims }
   */
  async function issueReceiptHandler(request: Request): Promise<Response> {
    try {
      const signingKey = resolveReceiptSigningKey(config);
      if (!signingKey) {
        return Response.json(
          { error: "Receipt signing key not configured" },
          { status: 500 }
        );
      }

      let body: {
        invoiceId?: string;
        resource?: string;
        ttlSeconds?: number;
        network?: DeroChainId;
      };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      if (!body.invoiceId) {
        return Response.json({ error: "Missing invoiceId" }, { status: 400 });
      }
      if (!body.resource) {
        return Response.json({ error: "Missing resource" }, { status: 400 });
      }

      const engine = await getEngine(config);
      const invoice = await engine.getInvoice(body.invoiceId);
      if (!invoice) {
        return Response.json({ error: "Invoice not found" }, { status: 404 });
      }

      if (invoice.status !== "completed") {
        return Response.json(
          { error: "Invoice is not completed yet" },
          { status: 409 }
        );
      }

      const issued = issueReceiptFromInvoice(invoice, {
        secret: signingKey.secret,
        keyId: signingKey.keyId,
        resource: body.resource,
        ttlSeconds: body.ttlSeconds,
        network: body.network ?? (config.chainId ?? "dero-mainnet"),
      });

      engine.emitX402AuditEvent({
        type: "x402.receipt_issued",
        resource: body.resource,
        invoiceId: invoice.id,
        jti: issued.claims.jti,
        metadata: {
          keyId: signingKey.keyId,
        },
      });

      return Response.json({
        receipt: issued.token,
        claims: issued.claims,
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        { status: 500 }
      );
    }
  }

  /**
   * POST /api/pay/receipts/verify
   * Body: { receipt, resource?, minAmountAtomic? }
   * Returns: { valid, claims? }
   */
  async function verifyReceiptHandler(request: Request): Promise<Response> {
    try {
      const verificationSecrets = resolveReceiptVerificationSecrets(config);
      if (!verificationSecrets) {
        return Response.json(
          { error: "Receipt verification secrets not configured" },
          { status: 500 }
        );
      }

      let body: {
        receipt?: string;
        resource?: string;
        minAmountAtomic?: string;
      };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const receipt =
        body.receipt ?? parseX402AuthorizationHeader(request.headers.get("Authorization"));

      if (!receipt) {
        return Response.json({ error: "Missing receipt" }, { status: 400 });
      }

      const claims = verifyPaymentReceipt(receipt, verificationSecrets, {
        resource: body.resource,
        minAmountAtomic:
          typeof body.minAmountAtomic === "string"
            ? BigInt(body.minAmountAtomic)
            : undefined,
      });

      const engine = await getEngine(config);
      if (claims) {
        engine.emitX402AuditEvent({
          type: "x402.receipt_used",
          resource: body.resource,
          invoiceId: claims.invoiceId,
          jti: claims.jti,
          metadata: {
            source: "verifyReceiptHandler",
          },
        });
      } else {
        engine.emitX402AuditEvent({
          type: "x402.receipt_rejected",
          resource: body.resource,
          reason: "verify_endpoint_rejected",
          metadata: {
            source: "verifyReceiptHandler",
          },
        });
      }

      return Response.json({
        valid: claims !== null,
        claims,
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        { status: 500 }
      );
    }
  }

  return {
    createInvoiceHandler,
    statusHandler,
    listInvoicesHandler,
    statsHandler,
    webhookHandler,
    healthHandler,
    escrowActionHandler,
    claimEscrowInvoiceHandler,
    listEscrowsHandler,
    issueReceiptHandler,
    verifyReceiptHandler,
    /** Access the underlying engine instance */
    getEngine: () => getEngine(config),
  };
}

/**
 * Map a claimEscrowInvoice engine error message to an HTTP status.
 *
 * The engine throws plain Error strings; this centralizes the message→status
 * mapping for the Gate-2 claim handler. Ordering matters: 'not claimable' and
 * the drift guards are 409 (state conflict, not a server fault); deploy/budget
 * failures are 502 (a downstream — the daemon/gas wallet — failed); a disabled
 * escrow engine is 503; a missing invoice is 404; anything else is a 500.
 */
function mapClaimErrorToStatus(message: string): number {
  const m = message.toLowerCase();
  if (m.includes("not found")) return 404;
  if (m.includes("escrow manager not available")) return 503;
  if (
    m.includes("not claimable (status:") ||
    m.includes("amount drift") ||
    m.includes("refusing to deploy") ||
    m.includes("has no escrow") ||
    m.includes("no escrowid")
  ) {
    return 409;
  }
  if (
    m.includes("deploy failed") ||
    m.includes("deploy has failed") ||
    m.includes("budget exhausted")
  ) {
    return 502;
  }
  return 500;
}

/**
 * Classify a claim error into a STABLE machine code for the client.
 *
 * The engine throws human-readable strings; the client should branch on this
 * code rather than substring-matching the message (fragile string-coupling
 * across engine→HTTP→client). The raw message is still forwarded for display.
 */
function classifyClaimError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("budget exhausted") || m.includes("has failed too many times")) {
    return "budget_exhausted";
  }
  if (m.includes("deploy failed") || m.includes("deploy has failed")) {
    return "deploy_failed";
  }
  if (m.includes("not claimable (status:")) return "not_claimable";
  if (m.includes("amount drift") || m.includes("refusing to deploy")) {
    return "amount_drift";
  }
  if (m.includes("not found")) return "not_found";
  if (m.includes("escrow manager not available")) return "escrow_disabled";
  return "internal_error";
}

/**
 * Serialize an Invoice for JSON response (BigInt → string).
 *
 * NOTE on escrow: `invoice.escrow` (InvoiceEscrow) carries NO bigint fields — the
 * quote-time principal is persisted as the decimal STRING `escrowAmount` (see
 * core/types.ts), and depositAmount/expectedAmount live only on the internal
 * EscrowRecord, never on the invoice blob. So the escrow object round-trips
 * through JSON unchanged and needs no coercion here; it is passed through as-is
 * via the `...invoice` spread. Only the top-level and per-payment bigints require
 * stringification.
 */
function serializeInvoice(invoice: import("../core/types.js").Invoice): Record<string, unknown> {
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
