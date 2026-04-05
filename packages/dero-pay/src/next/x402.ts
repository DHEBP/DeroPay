import { atomicToDero } from "../core/pricing.js";
import type { DeroChainId, CreateInvoiceParams } from "../core/types.js";
import { parseX402AuthorizationHeader } from "../core/x402-headers.js";
import type { InvoiceEngine } from "../server/invoice-engine.js";
import { verifyPaymentReceipt, type ReceiptSecrets } from "../server/payment-receipts.js";
import type { X402UsageReservation } from "../store/types.js";

export type X402PaymentPolicy = {
  name: string;
  amountAtomic: bigint;
  description?: string;
  ttlSeconds?: number;
  requiredConfirmations?: number;
  metadata?: Record<string, unknown>;
  resource?: string;
  network?: DeroChainId;
  maxReceiptsPerDay?: number;
  maxAtomicPerWindow?: {
    amountAtomic: bigint;
    windowSeconds: number;
  };
};

export type X402PolicyResolver = (
  request: Request
) => X402PaymentPolicy | Promise<X402PaymentPolicy>;

export type X402RouteGuardConfig = {
  getEngine: () => Promise<InvoiceEngine>;
  receiptSecret?: string;
  receiptSecrets?: Record<string, string>;
  policy: X402PaymentPolicy | X402PolicyResolver;
  receiptHeaderName?: string;
  enforceSingleUseReceipts?: boolean;
  protocolId?: string;
};

export type X402ChallengeResponse = {
  error: "payment_required";
  payment: {
    protocol: string;
    network: DeroChainId;
    asset: "DERO";
    amountAtomic: string;
    amountDisplay: string;
    invoiceId: string;
    integratedAddress: string;
    expiresAt: string;
    requiredConfirmations: number;
    resource: string;
  };
};

function getUtcDayWindow(now = new Date()): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function getRollingWindow(
  windowSeconds: number,
  now = new Date()
): { start: Date; end: Date } {
  const bucketMs = Math.max(1, windowSeconds) * 1000;
  const startMs = Math.floor(now.getTime() / bucketMs) * bucketMs;
  return {
    start: new Date(startMs),
    end: new Date(startMs + bucketMs),
  };
}

async function resolvePolicy(
  policy: X402PaymentPolicy | X402PolicyResolver,
  request: Request
): Promise<X402PaymentPolicy> {
  if (typeof policy === "function") {
    return policy(request);
  }
  return policy;
}

function buildInvoiceParams(policy: X402PaymentPolicy): CreateInvoiceParams {
  return {
    name: policy.name,
    description: policy.description,
    amount: policy.amountAtomic,
    ttlSeconds: policy.ttlSeconds,
    requiredConfirmations: policy.requiredConfirmations,
    metadata: policy.metadata,
  };
}

export function createX402RouteGuard(config: X402RouteGuardConfig) {
  const receiptSecrets: ReceiptSecrets =
    config.receiptSecrets ?? config.receiptSecret ?? "";
  if (
    (typeof receiptSecrets === "string" && receiptSecrets.length === 0) ||
    (typeof receiptSecrets !== "string" && Object.keys(receiptSecrets).length === 0)
  ) {
    throw new Error("createX402RouteGuard requires receiptSecret or receiptSecrets");
  }

  const receiptHeaderName = config.receiptHeaderName ?? "X-DeroPay-Receipt";
  const enforceSingleUseReceipts = config.enforceSingleUseReceipts ?? false;
  const protocolId = config.protocolId ?? "x402-deropay-draft";

  return function withX402PaymentGuard(
    handler: (request: Request) => Promise<Response> | Response
  ) {
    return async function guardedHandler(request: Request): Promise<Response> {
      const policy = await resolvePolicy(config.policy, request);
      const url = new URL(request.url);
      const resource = policy.resource ?? url.pathname;
      let engine: InvoiceEngine | null = null;
      const getEngine = async (): Promise<InvoiceEngine> => {
        if (!engine) {
          engine = await config.getEngine();
        }
        return engine;
      };

      const existingReceipt =
        request.headers.get(receiptHeaderName) ??
        parseX402AuthorizationHeader(request.headers.get("Authorization"));
      if (existingReceipt) {
        const claims = verifyPaymentReceipt(existingReceipt, receiptSecrets, {
          resource,
          minAmountAtomic: policy.amountAtomic,
        });
        if (claims) {
          if (enforceSingleUseReceipts) {
            const activeEngine = await getEngine();
            const store = activeEngine.getStore();
            if (!store.markReceiptJtiUsed) {
              activeEngine.emitX402AuditEvent({
                type: "x402.receipt_rejected",
                resource,
                invoiceId: claims.invoiceId,
                jti: claims.jti,
                reason: "replay_store_not_configured",
              });
              return Response.json(
                { error: "Receipt replay store not configured" },
                { status: 500 }
              );
            }

            const marked = await store.markReceiptJtiUsed(
              claims.jti,
              new Date(claims.expiresAt).toISOString()
            );
            if (!marked) {
              activeEngine.emitX402AuditEvent({
                type: "x402.receipt_rejected",
                resource,
                invoiceId: claims.invoiceId,
                jti: claims.jti,
                reason: "receipt_replay_detected",
              });
              return Response.json(
                { error: "Receipt has already been used" },
                { status: 409 }
              );
            }
          }
          if (
            policy.maxReceiptsPerDay !== undefined ||
            policy.maxAtomicPerWindow !== undefined
          ) {
            const activeEngine = await getEngine();
            const store = activeEngine.getStore();
            const now = new Date();
            const reservations: X402UsageReservation[] = [];

            if (policy.maxReceiptsPerDay !== undefined) {
              const dayWindow = getUtcDayWindow(now);
              reservations.push({
                resource,
                windowKey: `receipts:${resource}:${dayWindow.start.toISOString()}`,
                windowStart: dayWindow.start.toISOString(),
                windowEnd: dayWindow.end.toISOString(),
                amountAtomic: 0n,
                maxReceipts: policy.maxReceiptsPerDay,
              });
            }

            if (policy.maxAtomicPerWindow) {
              const usageWindow = getRollingWindow(
                policy.maxAtomicPerWindow.windowSeconds,
                now
              );
              reservations.push({
                resource,
                windowKey: `amount:${resource}:${usageWindow.start.toISOString()}:${policy.maxAtomicPerWindow.windowSeconds}`,
                windowStart: usageWindow.start.toISOString(),
                windowEnd: usageWindow.end.toISOString(),
                amountAtomic: policy.amountAtomic,
                maxAmountAtomic: policy.maxAtomicPerWindow.amountAtomic,
              });
            }

            if (reservations.length > 1 && !store.reserveX402UsageBatch) {
              activeEngine.emitX402AuditEvent({
                type: "x402.receipt_rejected",
                resource,
                invoiceId: claims.invoiceId,
                jti: claims.jti,
                reason: "quota_store_batch_not_configured",
              });
              return Response.json(
                { error: "x402 batch quota store not configured" },
                { status: 500 }
              );
            }

            if (reservations.length === 1 && !store.reserveX402Usage) {
              activeEngine.emitX402AuditEvent({
                type: "x402.receipt_rejected",
                resource,
                invoiceId: claims.invoiceId,
                jti: claims.jti,
                reason: "quota_store_not_configured",
              });
              return Response.json(
                { error: "x402 quota store not configured" },
                { status: 500 }
              );
            }

            const quotaResult =
              reservations.length === 1
                ? {
                    allowed: false,
                    results: [await store.reserveX402Usage!(reservations[0])],
                  }
                : await store.reserveX402UsageBatch!(reservations);

            const dailyQuota = quotaResult.results.find(
              (_, index) => reservations[index]?.maxReceipts !== undefined
            );
            if (dailyQuota && !dailyQuota.allowed) {
              activeEngine.emitX402AuditEvent({
                type: "x402.receipt_rejected",
                resource,
                invoiceId: claims.invoiceId,
                jti: claims.jti,
                reason: "receipt_daily_quota_exceeded",
                metadata: {
                  maxReceiptsPerDay: policy.maxReceiptsPerDay,
                  receiptCount: dailyQuota.receiptCount,
                },
              });
              return Response.json(
                { error: "Route receipt quota exceeded for current UTC day" },
                { status: 429 }
              );
            }

            const atomicQuota = quotaResult.results.find(
              (_, index) => reservations[index]?.maxAmountAtomic !== undefined
            );
            if (atomicQuota && !atomicQuota.allowed) {
              activeEngine.emitX402AuditEvent({
                type: "x402.receipt_rejected",
                resource,
                invoiceId: claims.invoiceId,
                jti: claims.jti,
                reason: "atomic_window_quota_exceeded",
                metadata: {
                  maxAtomicPerWindow:
                    policy.maxAtomicPerWindow?.amountAtomic.toString(),
                  windowSeconds: policy.maxAtomicPerWindow?.windowSeconds,
                  totalAmountAtomic: atomicQuota.totalAmountAtomic.toString(),
                },
              });
              return Response.json(
                { error: "Route atomic quota exceeded for active usage window" },
                { status: 429 }
              );
            }
          }
          (await getEngine()).emitX402AuditEvent({
            type: "x402.receipt_used",
            resource,
            invoiceId: claims.invoiceId,
            jti: claims.jti,
          });
          return handler(request);
        }

        (await getEngine()).emitX402AuditEvent({
          type: "x402.receipt_rejected",
          resource,
          reason: "invalid_or_expired_receipt",
        });
      }

      const activeEngine = await getEngine();
      const invoice = await activeEngine.createInvoice(buildInvoiceParams(policy));
      activeEngine.emitX402AuditEvent({
        type: "x402.challenge_issued",
        resource,
        invoiceId: invoice.id,
        metadata: {
          amountAtomic: invoice.amount.toString(),
        },
      });
      const responseBody: X402ChallengeResponse = {
        error: "payment_required",
        payment: {
          protocol: protocolId,
          network: policy.network ?? "dero-mainnet",
          asset: "DERO",
          amountAtomic: invoice.amount.toString(),
          amountDisplay: atomicToDero(invoice.amount),
          invoiceId: invoice.id,
          integratedAddress: invoice.integratedAddress,
          expiresAt: invoice.expiresAt,
          requiredConfirmations: invoice.requiredConfirmations,
          resource,
        },
      };

      return Response.json(responseBody, {
        status: 402,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": [
            `X402 protocol="${protocolId}"`,
            `asset="DERO"`,
            `network="${policy.network ?? "dero-mainnet"}"`,
            `amount="${invoice.amount.toString()}"`,
            `invoice_id="${invoice.id}"`,
            `address="${invoice.integratedAddress}"`,
            `resource="${resource}"`,
          ].join(", "),
        },
      });
    };
  };
}
