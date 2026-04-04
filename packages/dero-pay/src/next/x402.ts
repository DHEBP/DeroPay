import { atomicToDero } from "../core/pricing.js";
import type { DeroChainId, CreateInvoiceParams } from "../core/types.js";
import type { InvoiceEngine } from "../server/invoice-engine.js";
import { verifyPaymentReceipt, type ReceiptSecrets } from "../server/payment-receipts.js";

export type X402PaymentPolicy = {
  name: string;
  amountAtomic: bigint;
  description?: string;
  ttlSeconds?: number;
  requiredConfirmations?: number;
  metadata?: Record<string, unknown>;
  resource?: string;
  network?: DeroChainId;
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

      const existingReceipt = request.headers.get(receiptHeaderName);
      if (existingReceipt) {
        const claims = verifyPaymentReceipt(existingReceipt, receiptSecrets, {
          resource,
          minAmountAtomic: policy.amountAtomic,
        });
        if (claims) {
          if (enforceSingleUseReceipts) {
            const engine = await config.getEngine();
            const store = engine.getStore();
            if (!store.markReceiptJtiUsed) {
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
              return Response.json(
                { error: "Receipt has already been used" },
                { status: 409 }
              );
            }
          }
          return handler(request);
        }
      }

      const engine = await config.getEngine();
      const invoice = await engine.createInvoice(buildInvoiceParams(policy));
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
