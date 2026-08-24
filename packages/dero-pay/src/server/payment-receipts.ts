import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeroChainId, Invoice } from "../core/types.js";

type PaymentReceiptHeader = {
  alg: "HS256";
  typ: "DPAY-RECEIPT";
  kid?: string;
};

export type ReceiptSecrets = string | Record<string, string>;

export type CreateReceiptOptions = {
  keyId?: string;
};

export type PaymentReceiptClaims = {
  v: 1;
  jti: string;
  invoiceId: string;
  resource: string;
  asset: "DERO";
  network: DeroChainId;
  amountAtomic: string;
  confirmations: number;
  issuedAt: number;
  expiresAt: number;
  paymentTxid?: string;
};

export type VerifyReceiptOptions = {
  resource?: string;
  minAmountAtomic?: bigint;
  network?: DeroChainId;
  minConfirmations?: number;
  nowMs?: number;
};

export type IssueReceiptOptions = {
  resource: string;
  secret: string;
  /** @deprecated Receipts have a fixed 600-second lifetime. This value is ignored. */
  ttlSeconds?: number;
  network?: DeroChainId;
  keyId?: string;
};

/** Receipt entitlement is fixed and anchored to invoice completion. */
export const PAYMENT_RECEIPT_TTL_SECONDS = 600;
export const PAYMENT_RECEIPT_ACCEPTED_HEADER = "X-DeroPay-Receipt-Accepted";

export class PaymentReceiptWindowExpiredError extends Error {
  constructor() {
    super("The completed invoice receipt window has expired");
    this.name = "PaymentReceiptWindowExpiredError";
  }
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function timingSafeMatch(a: string, b: string): boolean {
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes);
}

export function createPaymentReceipt(
  claims: Omit<PaymentReceiptClaims, "v">,
  secret: string,
  options?: CreateReceiptOptions
): string {
  if (!secret) {
    throw new Error("Receipt secret is required");
  }

  const header: PaymentReceiptHeader = {
    alg: "HS256",
    typ: "DPAY-RECEIPT",
    kid: options?.keyId,
  };

  const payload: PaymentReceiptClaims = {
    v: 1,
    ...claims,
  };

  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyPaymentReceipt(
  token: string,
  secrets: ReceiptSecrets,
  options?: VerifyReceiptOptions
): PaymentReceiptClaims | null {
  try {
    if (!secrets || !token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, incomingSignature] = parts;
    const header = JSON.parse(decodeBase64Url(encodedHeader)) as PaymentReceiptHeader;
    if (header.alg !== "HS256" || header.typ !== "DPAY-RECEIPT") return null;

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    let signatureValid = false;

    if (typeof secrets === "string") {
      signatureValid = timingSafeMatch(sign(signingInput, secrets), incomingSignature);
    } else {
      const keysToTry =
        header.kid && secrets[header.kid]
          ? [secrets[header.kid]]
          : Object.values(secrets);

      for (const secret of keysToTry) {
        if (timingSafeMatch(sign(signingInput, secret), incomingSignature)) {
          signatureValid = true;
          break;
        }
      }
    }

    if (!signatureValid) return null;

    const claims = JSON.parse(decodeBase64Url(encodedPayload)) as PaymentReceiptClaims;
    if (claims.v !== 1) return null;
    if (!claims.jti || !claims.invoiceId || !claims.resource || claims.asset !== "DERO") {
      return null;
    }
    if (
      typeof claims.amountAtomic !== "string" ||
      !/^[1-9]\d*$/.test(claims.amountAtomic) ||
      !Number.isSafeInteger(claims.confirmations) ||
      claims.confirmations < 0 ||
      !Number.isSafeInteger(claims.issuedAt) ||
      !Number.isSafeInteger(claims.expiresAt) ||
      claims.expiresAt <= claims.issuedAt
    ) {
      return null;
    }

    const now = options?.nowMs ?? Date.now();
    if (claims.issuedAt > now || claims.expiresAt <= now) return null;

    if (options?.resource && claims.resource !== options.resource) return null;
    if (options?.network && claims.network !== options.network) return null;
    if (
      options?.minConfirmations !== undefined &&
      claims.confirmations < options.minConfirmations
    ) {
      return null;
    }

    if (
      typeof options?.minAmountAtomic !== "undefined" &&
      BigInt(claims.amountAtomic) < options.minAmountAtomic
    ) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

export function issueReceiptFromInvoice(
  invoice: Invoice,
  options: IssueReceiptOptions
): { token: string; claims: PaymentReceiptClaims } {
  if (invoice.status !== "completed") {
    throw new Error("Invoice is not completed yet");
  }

  const now = Date.now();
  const issuedAt = Date.parse(invoice.completedAt ?? "");
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now) {
    throw new Error("Completed invoice is missing a valid completedAt timestamp");
  }
  const expiresAt = issuedAt + PAYMENT_RECEIPT_TTL_SECONDS * 1000;
  if (expiresAt <= now) {
    throw new PaymentReceiptWindowExpiredError();
  }
  const confirmedPayment = invoice.payments.find((p) => p.status === "confirmed");

  const claims: Omit<PaymentReceiptClaims, "v"> = {
    jti: `invoice:${invoice.id}`,
    invoiceId: invoice.id,
    resource: options.resource,
    asset: "DERO",
    network: options.network ?? "dero-mainnet",
    amountAtomic: invoice.amountReceived.toString(),
    confirmations: invoice.requiredConfirmations,
    issuedAt,
    expiresAt,
    paymentTxid: confirmedPayment?.txid,
  };

  return {
    token: createPaymentReceipt(claims, options.secret, { keyId: options.keyId }),
    claims: {
      v: 1,
      ...claims,
    },
  };
}
