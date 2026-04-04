import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeroChainId, Invoice } from "../core/types.js";

type PaymentReceiptHeader = {
  alg: "HS256";
  typ: "DPAY-RECEIPT";
};

export type PaymentReceiptClaims = {
  v: 1;
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
  nowMs?: number;
};

export type IssueReceiptOptions = {
  resource: string;
  secret: string;
  ttlSeconds?: number;
  network?: DeroChainId;
};

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function createPaymentReceipt(
  claims: Omit<PaymentReceiptClaims, "v">,
  secret: string
): string {
  if (!secret) {
    throw new Error("Receipt secret is required");
  }

  const header: PaymentReceiptHeader = {
    alg: "HS256",
    typ: "DPAY-RECEIPT",
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
  secret: string,
  options?: VerifyReceiptOptions
): PaymentReceiptClaims | null {
  try {
    if (!secret || !token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, incomingSignature] = parts;
    const computedSignature = sign(`${encodedHeader}.${encodedPayload}`, secret);

    const incomingBytes = Buffer.from(incomingSignature, "utf8");
    const computedBytes = Buffer.from(computedSignature, "utf8");
    if (
      incomingBytes.length !== computedBytes.length ||
      !timingSafeEqual(incomingBytes, computedBytes)
    ) {
      return null;
    }

    const header = JSON.parse(decodeBase64Url(encodedHeader)) as PaymentReceiptHeader;
    if (header.alg !== "HS256" || header.typ !== "DPAY-RECEIPT") return null;

    const claims = JSON.parse(decodeBase64Url(encodedPayload)) as PaymentReceiptClaims;
    if (claims.v !== 1) return null;
    if (!claims.invoiceId || !claims.resource || claims.asset !== "DERO") return null;
    if (!claims.amountAtomic || Number.isNaN(Number(claims.confirmations))) return null;

    const now = options?.nowMs ?? Date.now();
    if (claims.expiresAt <= now) return null;

    if (options?.resource && claims.resource !== options.resource) return null;

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
  const ttlSeconds = options.ttlSeconds ?? 600;
  const expiresAt = now + ttlSeconds * 1000;
  const confirmedPayment = invoice.payments.find((p) => p.status === "confirmed");

  const claims: Omit<PaymentReceiptClaims, "v"> = {
    invoiceId: invoice.id,
    resource: options.resource,
    asset: "DERO",
    network: options.network ?? "dero-mainnet",
    amountAtomic: invoice.amountReceived.toString(),
    confirmations: invoice.requiredConfirmations,
    issuedAt: now,
    expiresAt,
    paymentTxid: confirmedPayment?.txid,
  };

  return {
    token: createPaymentReceipt(claims, options.secret),
    claims: {
      v: 1,
      ...claims,
    },
  };
}
