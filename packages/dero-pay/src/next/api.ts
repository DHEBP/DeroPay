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
    listEscrowsHandler,
    issueReceiptHandler,
    verifyReceiptHandler,
    /** Access the underlying engine instance */
    getEngine: () => getEngine(config),
  };
}

/**
 * Serialize an Invoice for JSON response (BigInt → string).
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
