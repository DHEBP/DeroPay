/**
 * Parsing for the wire shapes an autonomous payer consumes: the
 * x402-deropay-draft challenge emitted by `createX402RouteGuard` (HTTP
 * 402 body) and the serialized invoice served by `createPaymentHandlers`'
 * status endpoint. Validation is hand-rolled — dero-pay ships with zero
 * runtime dependencies, and these are two fixed shapes.
 */

import type { DeroChainId, InvoiceStatus } from "../core/types.js";
import type { X402ChallengeResponse } from "../next/x402.js";

/**
 * The challenge an agent pays. Structurally identical to the route
 * guard's 402 body; `settling` is added by MCP paid-tool challenges
 * while a referenced invoice waits for confirmations.
 */
export type X402Challenge = X402ChallengeResponse & {
  settling?: boolean;
};

/** What the agent needs from a serialized invoice status response. */
export type InvoiceStatusSnapshot = {
  id: string;
  status: InvoiceStatus;
  amountAtomic: bigint;
  amountReceivedAtomic: bigint;
  expiresAt: string;
};

const NETWORKS: ReadonlySet<string> = new Set(["dero-mainnet", "dero-testnet"]);

const INVOICE_STATUSES: ReadonlySet<string> = new Set([
  "created",
  "pending",
  "confirming",
  "completed",
  "expired",
  "partial",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isAtomicAmountString(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

/**
 * Parse an x402-deropay-draft challenge body. Returns null when the
 * value is not a well-formed challenge — the caller decides whether
 * that means "unpayable" or "pass the response through".
 */
export function parseX402Challenge(body: unknown): X402Challenge | null {
  if (!isRecord(body) || body.error !== "payment_required") return null;
  const payment = body.payment;
  if (!isRecord(payment)) return null;
  if (!isNonEmptyString(payment.protocol)) return null;
  if (typeof payment.network !== "string" || !NETWORKS.has(payment.network)) return null;
  if (payment.asset !== "DERO") return null;
  if (!isAtomicAmountString(payment.amountAtomic)) return null;
  if (typeof payment.amountDisplay !== "string") return null;
  if (!isNonEmptyString(payment.invoiceId)) return null;
  if (!isNonEmptyString(payment.integratedAddress)) return null;
  if (!isNonEmptyString(payment.expiresAt)) return null;
  if (
    typeof payment.requiredConfirmations !== "number" ||
    !Number.isFinite(payment.requiredConfirmations)
  ) {
    return null;
  }
  if (typeof payment.resource !== "string") return null;

  return {
    error: "payment_required",
    payment: {
      protocol: payment.protocol,
      network: payment.network as DeroChainId,
      asset: "DERO",
      amountAtomic: payment.amountAtomic,
      amountDisplay: payment.amountDisplay,
      invoiceId: payment.invoiceId,
      integratedAddress: payment.integratedAddress,
      expiresAt: payment.expiresAt,
      requiredConfirmations: payment.requiredConfirmations,
      resource: payment.resource,
    },
    ...(body.settling === true ? { settling: true } : {}),
  };
}

/**
 * Parse the JSON served by `GET /api/pay/status?invoiceId=` (a
 * serialized Invoice: bigints arrive as decimal strings). Returns null
 * on anything malformed so a flaky endpoint reads as "still waiting",
 * never as a bogus status.
 */
export function parseInvoiceStatusResponse(json: unknown): InvoiceStatusSnapshot | null {
  if (!isRecord(json)) return null;
  if (!isNonEmptyString(json.id)) return null;
  if (typeof json.status !== "string" || !INVOICE_STATUSES.has(json.status)) return null;
  if (!isAtomicAmountString(json.amount)) return null;
  if (!isAtomicAmountString(json.amountReceived)) return null;
  if (!isNonEmptyString(json.expiresAt)) return null;

  return {
    id: json.id,
    status: json.status as InvoiceStatus,
    amountAtomic: BigInt(json.amount),
    amountReceivedAtomic: BigInt(json.amountReceived),
    expiresAt: json.expiresAt,
  };
}
