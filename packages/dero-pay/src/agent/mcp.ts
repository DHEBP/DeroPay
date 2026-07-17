/**
 * x402 for MCP tools — the "paidTool" pattern (per-call payment gating,
 * free and paid tools mixed in one server), transport-agnostic so it
 * works over stdio and Streamable HTTP alike.
 *
 * No MCP SDK dependency and no separate facilitator: the guard mints
 * invoices through the merchant's own InvoiceEngine and verifies
 * DPAY-RECEIPT tokens locally. The payment travels as an `x402Payment`
 * tool ARGUMENT carrying either the paid invoice's id (fresh redemption)
 * or a previously issued receipt token (reuse), and the challenge comes
 * back as a `payment_required` tool result whose JSON matches the HTTP
 * 402 challenge body byte for byte — one parser serves both guards.
 * Replaying the paid call IS the settlement poll: while the invoice
 * confirms, the guard re-issues the SAME invoice's challenge with
 * `settling: true`, and the paying caller keeps waiting instead of
 * paying twice.
 */

import { atomicToDero } from "../core/pricing.js";
import type { DeroChainId, Invoice } from "../core/types.js";
import type { InvoiceEngine } from "../server/invoice-engine.js";
import {
  issueReceiptFromInvoice,
  verifyPaymentReceipt,
  type PaymentReceiptClaims,
  type ReceiptSecrets,
} from "../server/payment-receipts.js";
import { parseX402Challenge, type X402Challenge } from "./challenge.js";
import type { InvoicePayer } from "./payer.js";
import type { PaymentEvidence } from "./paying-fetch.js";
import type { SpendGuard } from "./policy.js";

/** Name of the reserved tool argument that carries the payment. */
export const X402_PAYMENT_ARG = "x402Payment";

/** Marker embedded in payment_required tool results. */
export const X402_MCP_ERROR = "payment_required";

/** Minimal MCP-shaped tool result the guard emits and inspects. */
export type McpToolResult = {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ToolHandler<TArgs> = (
  args: TArgs,
  extra?: unknown
) => Promise<McpToolResult> | McpToolResult;

/** Price of one guarded tool call. */
export type PaidToolPricing = {
  amountAtomic: bigint;
  /** Invoice name. Default: `MCP tool: <toolName>`. */
  name?: string;
  description?: string;
  /** Invoice time-to-live. */
  ttlSeconds?: number;
  requiredConfirmations?: number;
};

export type PaidToolGuardConfig = {
  getEngine: () => Promise<InvoiceEngine>;
  /** Secret used to sign and verify payment receipts. */
  receiptSecret?: string;
  /** Secrets by key ID for receipt key rotation. */
  receiptSecrets?: Record<string, string>;
  /** Active key ID used to issue new receipts when receiptSecrets is set. */
  receiptKeyId?: string;
  /** Fixed price, or a resolver called per tool invocation. */
  pricing:
    | PaidToolPricing
    | ((
        toolName: string,
        args: Record<string, unknown>
      ) => PaidToolPricing | Promise<PaidToolPricing>);
  /** Resource URI for a tool, bound into invoices and receipts. Default: `mcp:tool/<name>`. */
  resourceFor?: (toolName: string) => string;
  network?: DeroChainId;
  protocolId?: string;
  /** TTL for receipts minted on redemption. Unset: issueReceiptFromInvoice default (600s). */
  receiptTtlSeconds?: number;
  /**
   * One paid call per payment (default true): each redeemed invoice and
   * each presented receipt is burned in the store's jti ledger, so a
   * payment cannot unlock a second call. Requires a store with
   * markReceiptJtiUsed (both built-in stores have it). Set false to let
   * a receipt be reused until it expires — it is then returned to the
   * caller in `_meta["deropay/x402"].receipt`.
   */
  singleUse?: boolean;
  /** Called after each paid call is authorized, before the handler runs. */
  onSettled?: (info: {
    toolName: string;
    resource: string;
    invoiceId: string;
    jti: string;
  }) => void;
};

function challengeResult(challenge: X402Challenge): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(challenge) }],
    _meta: { "deropay/x402": { status: 402 } },
  };
}

function errorResult(message: string): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
  };
}

function challengeFromInvoice(
  invoice: Invoice,
  resource: string,
  network: DeroChainId,
  protocolId: string,
  settling = false
): X402Challenge {
  return {
    error: "payment_required",
    payment: {
      protocol: protocolId,
      network,
      asset: "DERO",
      amountAtomic: invoice.amount.toString(),
      amountDisplay: atomicToDero(invoice.amount),
      invoiceId: invoice.id,
      integratedAddress: invoice.integratedAddress,
      expiresAt: invoice.expiresAt,
      requiredConfirmations: invoice.requiredConfirmations,
      resource,
    },
    ...(settling ? { settling: true } : {}),
  };
}

// Local copies of the signing-key resolution in next/api.ts, so this
// module does not reach into the Next.js layer.
function resolveVerificationSecrets(config: PaidToolGuardConfig): ReceiptSecrets | null {
  if (config.receiptSecrets && Object.keys(config.receiptSecrets).length > 0) {
    return config.receiptSecrets;
  }
  if (config.receiptSecret) {
    return config.receiptSecret;
  }
  return null;
}

function resolveSigningKey(
  config: PaidToolGuardConfig
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
    if (!firstKeyId || !firstSecret) return null;
    return { secret: firstSecret, keyId: firstKeyId };
  }
  if (config.receiptSecret) {
    return { secret: config.receiptSecret };
  }
  return null;
}

/**
 * Wrap tool handlers so each call requires a paid invoice. A call
 * without a payment argument gets a payment_required challenge naming a
 * fresh invoice; a call carrying a paid invoice id (or a live receipt)
 * runs the handler once the payment is verified against the engine.
 */
export function createPaidToolGuard(config: PaidToolGuardConfig) {
  const verificationSecrets = resolveVerificationSecrets(config);
  const signingKey = resolveSigningKey(config);
  if (!verificationSecrets || !signingKey) {
    throw new Error("createPaidToolGuard requires receiptSecret or receiptSecrets");
  }

  const resourceFor = config.resourceFor ?? ((name: string) => `mcp:tool/${name}`);
  const network = config.network ?? "dero-mainnet";
  const protocolId = config.protocolId ?? "x402-deropay-draft";
  const singleUse = config.singleUse ?? true;

  async function resolvePricing(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<PaidToolPricing> {
    return typeof config.pricing === "function"
      ? config.pricing(toolName, args)
      : config.pricing;
  }

  async function mintChallenge(
    engine: InvoiceEngine,
    toolName: string,
    resource: string,
    pricing: PaidToolPricing
  ): Promise<McpToolResult> {
    const invoice = await engine.createInvoice({
      name: pricing.name ?? `MCP tool: ${toolName}`,
      description: pricing.description,
      amount: pricing.amountAtomic,
      ttlSeconds: pricing.ttlSeconds,
      requiredConfirmations: pricing.requiredConfirmations,
      metadata: { x402Resource: resource },
    });
    engine.emitX402AuditEvent({
      type: "x402.challenge_issued",
      resource,
      invoiceId: invoice.id,
      metadata: { amountAtomic: invoice.amount.toString(), toolName },
    });
    return challengeResult(challengeFromInvoice(invoice, resource, network, protocolId));
  }

  /**
   * Burn a jti in the store's replay ledger. "unsupported" means the
   * store cannot enforce once-ness at all.
   */
  async function burnJti(
    engine: InvoiceEngine,
    jti: string,
    expiresAt: string
  ): Promise<"burned" | "replayed" | "unsupported"> {
    const store = engine.getStore();
    if (!store.markReceiptJtiUsed) return "unsupported";
    const marked = await store.markReceiptJtiUsed(jti, expiresAt);
    return marked ? "burned" : "replayed";
  }

  function guard<TArgs extends Record<string, unknown>>(
    toolName: string,
    handler: ToolHandler<TArgs>
  ): ToolHandler<TArgs & { [X402_PAYMENT_ARG]?: string }> {
    return async (args, extra) => {
      const resource = resourceFor(toolName);
      const engine = await config.getEngine();
      const pricing = await resolvePricing(toolName, (args ?? {}) as Record<string, unknown>);
      const paymentArg = (args as Record<string, unknown> | undefined)?.[X402_PAYMENT_ARG];

      async function runPaidHandler(settled: {
        invoiceId: string;
        jti: string;
        receipt: string;
        claims: PaymentReceiptClaims;
      }): Promise<McpToolResult> {
        config.onSettled?.({
          toolName,
          resource,
          invoiceId: settled.invoiceId,
          jti: settled.jti,
        });
        const { [X402_PAYMENT_ARG]: _omit, ...handlerArgs } = (args ?? {}) as Record<
          string,
          unknown
        >;
        const result = await handler(handlerArgs as TArgs, extra);
        return {
          ...result,
          _meta: {
            ...(result._meta ?? {}),
            "deropay/x402": {
              settled: true,
              network,
              invoiceId: settled.invoiceId,
              jti: settled.jti,
              // Only a reusable receipt is worth handing back.
              ...(singleUse ? {} : { receipt: settled.receipt, claims: settled.claims }),
            },
          },
        };
      }

      if (typeof paymentArg !== "string" || paymentArg.length === 0) {
        return mintChallenge(engine, toolName, resource, pricing);
      }

      // DPAY-RECEIPT tokens are three dot-joined base64url parts; invoice
      // ids never contain dots.
      if (paymentArg.split(".").length === 3) {
        const claims = verifyPaymentReceipt(paymentArg, verificationSecrets!, {
          resource,
          minAmountAtomic: pricing.amountAtomic,
        });
        if (!claims) {
          engine.emitX402AuditEvent({
            type: "x402.receipt_rejected",
            resource,
            reason: "invalid_or_expired_receipt",
          });
          return mintChallenge(engine, toolName, resource, pricing);
        }
        if (singleUse) {
          const burn = await burnJti(
            engine,
            claims.jti,
            new Date(claims.expiresAt).toISOString()
          );
          if (burn === "unsupported") {
            return errorResult("Receipt replay store not configured");
          }
          if (burn === "replayed") {
            engine.emitX402AuditEvent({
              type: "x402.receipt_rejected",
              resource,
              invoiceId: claims.invoiceId,
              jti: claims.jti,
              reason: "receipt_replay_detected",
            });
            return mintChallenge(engine, toolName, resource, pricing);
          }
        }
        engine.emitX402AuditEvent({
          type: "x402.receipt_used",
          resource,
          invoiceId: claims.invoiceId,
          jti: claims.jti,
        });
        return runPaidHandler({
          invoiceId: claims.invoiceId,
          jti: claims.jti,
          receipt: paymentArg,
          claims,
        });
      }

      // Otherwise the argument is an invoice id to redeem.
      const invoice = await engine.getInvoice(paymentArg);
      if (
        !invoice ||
        invoice.metadata?.x402Resource !== resource ||
        invoice.amount < pricing.amountAtomic ||
        invoice.status === "expired"
      ) {
        return mintChallenge(engine, toolName, resource, pricing);
      }
      if (invoice.status !== "completed") {
        // Still settling — re-issue the SAME invoice so the caller keeps
        // waiting instead of paying a second time.
        return challengeResult(
          challengeFromInvoice(invoice, resource, network, protocolId, true)
        );
      }

      // Redeem the invoice exactly once, even when receipts are reusable:
      // otherwise one payment could mint receipts forever.
      const redemption = await burnJti(
        engine,
        `invoice:${invoice.id}`,
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      );
      if (redemption === "unsupported" && singleUse) {
        return errorResult("Receipt replay store not configured");
      }
      if (redemption === "replayed") {
        engine.emitX402AuditEvent({
          type: "x402.receipt_rejected",
          resource,
          invoiceId: invoice.id,
          reason: "invoice_already_redeemed",
        });
        return mintChallenge(engine, toolName, resource, pricing);
      }

      const issued = issueReceiptFromInvoice(invoice, {
        secret: signingKey!.secret,
        keyId: signingKey!.keyId,
        resource,
        ttlSeconds: config.receiptTtlSeconds,
        network,
      });
      if (singleUse) {
        // Burn the fresh receipt too, so it cannot unlock another call.
        await burnJti(engine, issued.claims.jti, new Date(issued.claims.expiresAt).toISOString());
      }
      engine.emitX402AuditEvent({
        type: "x402.receipt_issued",
        resource,
        invoiceId: invoice.id,
        jti: issued.claims.jti,
        metadata: { source: "paidToolGuard", toolName },
      });
      return runPaidHandler({
        invoiceId: invoice.id,
        jti: issued.claims.jti,
        receipt: issued.token,
        claims: issued.claims,
      });
    };
  }

  return { guard, resourceFor };
}

/** Parse a tool result as a payment challenge, if it is one. */
export function parsePaidToolChallenge(result: McpToolResult): X402Challenge | null {
  if (!result?.isError || !Array.isArray(result.content)) return null;
  for (const item of result.content) {
    if (item.type !== "text" || typeof item.text !== "string") continue;
    try {
      const challenge = parseX402Challenge(JSON.parse(item.text));
      if (challenge) return challenge;
    } catch {
      // not JSON — not a challenge
    }
  }
  return null;
}

export type CallTool = (
  toolName: string,
  args: Record<string, unknown>
) => Promise<McpToolResult>;

export type PayingToolCallerConfig = {
  callTool: CallTool;
  payer: InvoicePayer;
  policy: SpendGuard;
  /**
   * Policy origin under which MCP payments are accounted, e.g. the MCP
   * server's URL. Required because tool calls have no natural web origin.
   */
  serverOrigin: string;
  /** Challenge protocol this caller honors. Default "x402-deropay-draft". */
  protocol?: string;
  /** Refuse challenges on any other network. Unset: pay whatever the challenge names. */
  network?: DeroChainId;
  onPayment?: (evidence: PaymentEvidence) => void;
  /**
   * How long to keep replaying the paid call while the invoice settles.
   * The SAME invoice id is replayed — never a second payment. Default 180s.
   */
  settleTimeoutMs?: number;
  /** Delay between settlement replays. Default 2.5s. */
  settlePollIntervalMs?: number;
};

export class X402ToolPaymentRejectedError extends Error {
  readonly result: McpToolResult;
  readonly txid: string;
  readonly invoiceId: string;

  constructor(message: string, result: McpToolResult, txid: string, invoiceId: string) {
    super(message);
    this.name = "X402ToolPaymentRejectedError";
    this.result = result;
    this.txid = txid;
    this.invoiceId = invoiceId;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap an MCP callTool so payment_required results are paid under the
 * spending policy and the call replayed with the paid invoice id until
 * the guard reports it settled.
 */
export function createPayingToolCaller(config: PayingToolCallerConfig): CallTool {
  const protocol = config.protocol ?? "x402-deropay-draft";
  const settleTimeoutMs = config.settleTimeoutMs ?? 180_000;
  const settlePollIntervalMs = config.settlePollIntervalMs ?? 2_500;

  return async (toolName, args) => {
    const first = await config.callTool(toolName, args);
    const challenge = parsePaidToolChallenge(first);
    if (!challenge) return first;

    const payment = challenge.payment;
    // A challenge this caller cannot honor is returned as-is: it is
    // already an isError result, so the caller sees a visible failure.
    if (payment.protocol !== protocol) return first;
    if (config.network && payment.network !== config.network) return first;

    const amountAtomic = BigInt(payment.amountAtomic);
    const reservation = config.policy.reserve(config.serverOrigin, amountAtomic, {
      resource: payment.resource,
    });
    let txid: string;
    try {
      const paid = await config.payer({
        invoiceId: payment.invoiceId,
        integratedAddress: payment.integratedAddress,
        amountAtomic,
        network: payment.network,
        resource: payment.resource,
        expiresAt: payment.expiresAt,
      });
      txid = paid.txid;
      // Money left the wallet; the reservation is spent either way.
      reservation.commit();
    } catch (error) {
      reservation.release();
      throw error;
    }

    config.onPayment?.({
      at: new Date().toISOString(),
      origin: config.serverOrigin,
      resource: payment.resource,
      network: payment.network,
      invoiceId: payment.invoiceId,
      integratedAddress: payment.integratedAddress,
      amountAtomic: payment.amountAtomic,
      txid,
    });

    // Replaying the paid call IS the settlement poll: the guard answers
    // with the same invoice (settling) until confirmations arrive.
    const paidArgs = { ...args, [X402_PAYMENT_ARG]: payment.invoiceId };
    const deadline = Date.now() + settleTimeoutMs;
    let result = await config.callTool(toolName, paidArgs);
    for (;;) {
      const followUp = parsePaidToolChallenge(result);
      if (!followUp) return result;
      if (followUp.payment.invoiceId !== payment.invoiceId) {
        throw new X402ToolPaymentRejectedError(
          `Tool ${toolName} challenged for a different invoice after invoice ` +
            `${payment.invoiceId} was paid (txid ${txid}) — refusing to pay again`,
          result,
          txid,
          payment.invoiceId
        );
      }
      if (Date.now() >= deadline) {
        throw new X402ToolPaymentRejectedError(
          `Tool ${toolName} was still settling invoice ${payment.invoiceId} (txid ${txid}) ` +
            `after ${settleTimeoutMs}ms — refusing to pay again`,
          result,
          txid,
          payment.invoiceId
        );
      }
      await sleep(settlePollIntervalMs);
      result = await config.callTool(toolName, paidArgs);
    }
  };
}
