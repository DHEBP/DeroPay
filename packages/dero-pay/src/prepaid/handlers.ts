import { createHash } from "node:crypto";
import type { DeroChainId } from "../core/types.js";
import type { InvoiceEngine } from "../server/invoice-engine.js";
import type { ReceiptSecrets } from "../server/payment-receipts.js";
import { createX402RouteGuard } from "../next/x402.js";
import { PrepaidError } from "./types.js";
import type { PrepaidLedger } from "./ledger.js";

export type AuthenticatePrepaidRequest = (
  request: Request,
) => Promise<string | null> | string | null;

export type PrepaidHandlersConfig = {
  getEngine: () => Promise<InvoiceEngine>;
  ledger: PrepaidLedger;
  authenticate: AuthenticatePrepaidRequest;
  receiptSecret?: string;
  receiptSecrets?: Record<string, string>;
  network?: DeroChainId;
  requiredConfirmations?: number;
  minimumTopUpAtomic?: bigint;
  suggestedTopUpAtomic?: bigint;
  maximumTopUpAtomic?: bigint;
  minimumConsumeAtomic?: bigint;
};

function jsonError(status: number, code: string, message: string, extra = {}) {
  return Response.json(
    { error: { code, message, ...extra } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

const privateHeaders = { "Cache-Control": "no-store" };

function serializedBalance(balance: {
  accountId: string;
  availableAtomic: bigint;
  reservedAtomic: bigint;
  updatedAt: string;
}) {
  return {
    walletAddress: balance.accountId,
    balanceAtomic: balance.availableAtomic.toString(),
    reservedAtomic: balance.reservedAtomic.toString(),
    updatedAt: balance.updatedAt,
  };
}

function walletFromPath(request: Request, segment: "balance" | "transactions"): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = parts.lastIndexOf(segment);
  if (index < 0 || !parts[index + 1]) return null;
  try {
    return decodeURIComponent(parts[index + 1]);
  } catch {
    return null;
  }
}

function parsePositiveAtomic(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || value.length > 20) {
    return null;
  }
  return BigInt(value);
}

export function createPrepaidHandlers(config: PrepaidHandlersConfig) {
  const receiptSecrets: ReceiptSecrets =
    config.receiptSecrets ?? config.receiptSecret ?? "";
  if (
    (typeof receiptSecrets === "string" && receiptSecrets.length === 0) ||
    (typeof receiptSecrets !== "string" && Object.keys(receiptSecrets).length === 0)
  ) {
    throw new Error("createPrepaidHandlers requires receiptSecret or receiptSecrets");
  }
  const minimumTopUpAtomic = config.minimumTopUpAtomic ?? 1n;
  const suggestedTopUpAtomic = config.suggestedTopUpAtomic ?? minimumTopUpAtomic;
  const maximumTopUpAtomic =
    config.maximumTopUpAtomic ?? 18_446_744_073_709_551_615n;
  const minimumConsumeAtomic = config.minimumConsumeAtomic ?? 1n;
  const requiredConfirmations = config.requiredConfirmations ?? 3;
  if (
    minimumTopUpAtomic <= 0n ||
    suggestedTopUpAtomic < minimumTopUpAtomic ||
    suggestedTopUpAtomic > maximumTopUpAtomic ||
    maximumTopUpAtomic < minimumTopUpAtomic ||
    minimumConsumeAtomic <= 0n ||
    !Number.isSafeInteger(requiredConfirmations) ||
    requiredConfirmations <= 0
  ) {
    throw new Error("Invalid prepaid amount or confirmation limits");
  }

  async function authenticate(request: Request): Promise<string | Response> {
    try {
      const accountId = await config.authenticate(request);
      return accountId?.trim()
        ? accountId.trim()
        : jsonError(401, "authentication_required", "A valid DeroAuth session is required");
    } catch {
      return jsonError(401, "invalid_session", "The DeroAuth session is invalid or expired");
    }
  }

  async function topUpHandler(request: Request): Promise<Response> {
    const authenticated = await authenticate(request);
    if (authenticated instanceof Response) return authenticated;
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return jsonError(
        400,
        "invalid_idempotency_key",
        "Idempotency-Key is required and must be at most 200 characters",
      );
    }
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch {
      return jsonError(400, "invalid_json", "Top-up body must be valid JSON");
    }
    const amountAtomic = parsePositiveAtomic(
      (body as { amountAtomic?: unknown } | null)?.amountAtomic,
    );
    if (amountAtomic === null) {
      return jsonError(400, "invalid_amount", "amountAtomic must be a positive integer string");
    }
    if (amountAtomic < minimumTopUpAtomic || amountAtomic > maximumTopUpAtomic) {
      return jsonError(400, "amount_out_of_range", "Top-up amount is outside the allowed range", {
        minimumTopUpAtomic: minimumTopUpAtomic.toString(),
        maximumTopUpAtomic: maximumTopUpAtomic.toString(),
      });
    }

    const keyHash = createHash("sha256").update(idempotencyKey).digest("hex");
    const accountHash = createHash("sha256").update(authenticated).digest("hex");
    const reference = `topup:${createHash("sha256").update(`${authenticated}\0${idempotencyKey}`).digest("hex")}`;
    const existing = await config.ledger.getTransaction(reference);
    if (existing) {
      if (
        existing.type !== "TOP_UP" ||
        existing.accountId !== authenticated ||
        existing.metadata.requestedAtomic !== amountAtomic.toString()
      ) {
        return jsonError(
          409,
          "idempotency_conflict",
          "Idempotency-Key was already used for another top-up",
        );
      }
      const balance = await config.ledger.getBalance(authenticated);
      return Response.json(
        {
          ...serializedBalance(balance),
          creditedAtomic: existing.amountAtomic.toString(),
          transactionId: existing.id,
          invoiceId: existing.metadata.invoiceId,
          created: false,
        },
        {
          headers: {
            ...privateHeaders,
            "X-Balance-Remaining": balance.availableAtomic.toString(),
          },
        },
      );
    }
    const resource = [
      "/api/v1/x402/top-up",
      accountHash,
      amountAtomic.toString(),
      keyHash,
    ].join(":");
    const guard = createX402RouteGuard({
      getEngine: config.getEngine,
      ...(config.receiptSecrets
        ? { receiptSecrets: config.receiptSecrets }
        : { receiptSecret: config.receiptSecret! }),
      policy: {
        name: "Prepaid DERO balance top-up",
        description: "Credit a wallet-authenticated DeroPay API balance",
        amountAtomic,
        requiredConfirmations,
        network: config.network ?? "dero-mainnet",
        resource,
        metadata: {
          purpose: "prepaid_top_up",
          walletAddressHash: accountHash,
          idempotencyKeyHash: keyHash,
        },
      },
    });

    return guard(async (_paidRequest, context) => {
      const creditedAtomic = BigInt(context.claims.amountAtomic);
      const paidInvoice = await (await config.getEngine()).getInvoice(context.claims.invoiceId);
      if (paidInvoice?.metadata.deropayX402Resource !== context.resource) {
        return jsonError(
          409,
          "invalid_top_up_invoice",
          "Receipt invoice is not bound to this top-up",
        );
      }
      let result;
      try {
        result = await config.ledger.credit({
          accountId: authenticated,
          amountAtomic: creditedAtomic,
          reference,
          relatedReference: `invoice:${context.claims.invoiceId}`,
          metadata: {
            invoiceId: context.claims.invoiceId,
            paymentTxid: context.claims.paymentTxid,
            idempotencyKeyHash: keyHash,
            requestedAtomic: amountAtomic.toString(),
          },
        });
      } catch (error) {
        return prepaidErrorResponse(error);
      }
      if (
        !result.created &&
        result.transaction.metadata.requestedAtomic !== amountAtomic.toString()
      ) {
        return jsonError(
          409,
          "idempotency_conflict",
          "Idempotency-Key was already used for another top-up",
        );
      }
      return Response.json(
        {
          ...serializedBalance(result.balance),
          creditedAtomic: result.transaction.amountAtomic.toString(),
          transactionId: result.transaction.id,
          invoiceId: result.transaction.metadata.invoiceId ?? context.claims.invoiceId,
          created: result.created,
        },
        {
          headers: {
            ...privateHeaders,
            "X-Balance-Remaining": result.balance.availableAtomic.toString(),
          },
        },
      );
    })(request);
  }

  async function balanceHandler(request: Request): Promise<Response> {
    const authenticated = await authenticate(request);
    if (authenticated instanceof Response) return authenticated;
    const walletAddress = walletFromPath(request, "balance");
    if (!walletAddress) return jsonError(400, "missing_wallet", "Wallet address is required");
    if (walletAddress !== authenticated) {
      return jsonError(403, "wallet_mismatch", "Authenticated wallet does not match the path");
    }
    const balance = await config.ledger.getBalance(walletAddress);
    return Response.json(
      {
        ...serializedBalance(balance),
        canConsume: balance.availableAtomic >= minimumConsumeAtomic,
        minimumTopUpAtomic: minimumTopUpAtomic.toString(),
        suggestedTopUpAtomic: suggestedTopUpAtomic.toString(),
      },
      { headers: privateHeaders },
    );
  }

  async function transactionsHandler(request: Request): Promise<Response> {
    const authenticated = await authenticate(request);
    if (authenticated instanceof Response) return authenticated;
    const walletAddress = walletFromPath(request, "transactions");
    if (!walletAddress) return jsonError(400, "missing_wallet", "Wallet address is required");
    if (walletAddress !== authenticated) {
      return jsonError(403, "wallet_mismatch", "Authenticated wallet does not match the path");
    }
    const url = new URL(request.url);
    const limitText = url.searchParams.get("limit") ?? "50";
    const offsetText = url.searchParams.get("offset") ?? "0";
    const limit = Number(limitText);
    const offset = Number(offsetText);
    if (
      !/^\d+$/.test(limitText) ||
      !/^\d+$/.test(offsetText) ||
      !Number.isSafeInteger(limit) ||
      !Number.isSafeInteger(offset) ||
      limit < 1 ||
      limit > 100
    ) {
      return jsonError(400, "invalid_pagination", "limit must be 1-100 and offset must be non-negative");
    }
    const page = await config.ledger.listTransactions(walletAddress, { limit, offset });
    return Response.json(
      {
        walletAddress,
        items: page.items.map((transaction) => ({
          id: transaction.id,
          type: transaction.type,
          amountAtomic: transaction.amountAtomic.toString(),
          balanceAfterAtomic: transaction.balanceAfterAtomic.toString(),
          reference: transaction.reference,
          relatedReference: transaction.relatedReference,
          createdAt: transaction.createdAt,
          metadata: transaction.metadata,
        })),
        total: page.total,
        limit: page.limit,
        offset: page.offset,
      },
      { headers: privateHeaders },
    );
  }

  return { topUpHandler, balanceHandler, transactionsHandler };
}

export function prepaidErrorResponse(error: unknown): Response {
  if (!(error instanceof PrepaidError)) {
    return jsonError(500, "prepaid_error", "Prepaid accounting failed");
  }
  const status = error.code === "insufficient_balance" ? 402 : 409;
  return jsonError(status, error.code, error.message, error.details);
}
