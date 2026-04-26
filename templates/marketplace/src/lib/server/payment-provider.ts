import crypto from "node:crypto";
import {
  completeMockInvoice,
  createMockDeroPayInvoice,
  createMockWebhookEvent,
  createPartialMockInvoicePayment,
  detectMockInvoicePayment,
  expireMockInvoice,
  markMockInvoiceConfirming,
} from "@/lib/payment-providers";
import type {
  CartSummary,
  DeroPayInvoiceStatus,
  DeroPayPayment,
  DeroPayPaymentStatus,
  DeroPayWebhookEvent,
  DeroPayWebhookType,
  PaymentIntent,
  PaymentRail,
} from "@/lib/types";
import { assertLivePaymentEnv, isLiveDeroPay, isProduction } from "./env";

export type CreateInvoiceInput = {
  orderId: string;
  buyerAlias: string;
  rail: PaymentRail;
  summary: CartSummary;
  webhookUrl?: string;
};

export type CreateInvoiceResult = {
  invoice: PaymentIntent;
};

export type InvoiceStatusResult = {
  invoice: PaymentIntent;
};

export type VerifiedWebhookEvent = DeroPayWebhookEvent;

export type PaymentProviderTransition = {
  invoice: PaymentIntent;
  orderStatus:
    | "awaiting_payment"
    | "payment_detected"
    | "confirming"
    | "funded"
    | "partial_payment"
    | "expired";
  label: string;
  detail: string;
};

export type EscrowSettlementAction = "release" | "refund" | "dispute";

export type EscrowSettlementResult = {
  invoice: PaymentIntent;
  settlementId: string;
};

export type PaymentProvider = {
  name: "mock" | "deropay";
  createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult>;
  getInvoiceStatus(invoice: PaymentIntent): Promise<InvoiceStatusResult>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedWebhookEvent>;
  mapWebhookToPaymentEvent(
    event: VerifiedWebhookEvent,
    invoice: PaymentIntent
  ): PaymentProviderTransition;
  settleEscrow(
    invoice: PaymentIntent,
    action: EscrowSettlementAction
  ): Promise<EscrowSettlementResult>;
};

function normalizeStatus(value: unknown): DeroPayInvoiceStatus {
  const status = String(value ?? "created").toLowerCase();
  if (status === "paid" || status === "confirmed" || status === "complete") {
    return "completed";
  }
  if (status === "detected" || status === "awaiting_confirmations") {
    return "pending";
  }
  if (
    status === "created" ||
    status === "pending" ||
    status === "confirming" ||
    status === "completed" ||
    status === "partial" ||
    status === "expired"
  ) {
    return status;
  }
  return "created";
}

function eventTypeForStatus(status: DeroPayInvoiceStatus): DeroPayWebhookType {
  if (status === "pending") return "payment.detected";
  if (status === "confirming") return "payment.confirming";
  if (status === "completed") return "payment.completed";
  if (status === "partial") return "payment.partial";
  if (status === "expired") return "invoice.expired";
  return "invoice.created";
}

function timingSafeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signaturePayload(rawBody: string, timestamp: string | null): string {
  return timestamp ? `${timestamp}.${rawBody}` : rawBody;
}

function hmacWebhookSignature(
  rawBody: string,
  secret: string,
  timestamp: string | null
): string {
  return `sha256=${crypto
    .createHmac("sha256", secret)
    .update(signaturePayload(rawBody, timestamp))
    .digest("hex")}`;
}

function verifySignature(rawBody: string, headers: Headers, required: boolean): void {
  const secret = process.env.DEROPAY_WEBHOOK_SECRET;
  if (!secret) {
    if (required) throw new Error("DEROPAY_WEBHOOK_SECRET is required for live webhooks");
    return;
  }
  const timestamp =
    headers.get("x-deropay-timestamp") ?? headers.get("x-webhook-timestamp");
  if (required) {
    if (!timestamp) throw new Error("DeroPay webhook timestamp is required");
    const timestampMs = Number(timestamp.length <= 10 ? Number(timestamp) * 1000 : timestamp);
    if (!Number.isFinite(timestampMs)) {
      throw new Error("DeroPay webhook timestamp is invalid");
    }
    if (Math.abs(Date.now() - timestampMs) > 5 * 60_000) {
      throw new Error("DeroPay webhook timestamp is outside tolerance");
    }
  }
  const signature =
    headers.get("x-deropay-signature") ??
    headers.get("x-webhook-signature") ??
    headers.get("x-signature") ??
    "";
  if (!timingSafeEquals(signature, hmacWebhookSignature(rawBody, secret, timestamp))) {
    throw new Error("Invalid DeroPay webhook signature");
  }
}

function parseWebhook(rawBody: string): DeroPayWebhookEvent {
  const body = JSON.parse(rawBody) as Partial<DeroPayWebhookEvent> & {
    event?: string;
    status?: string;
    invoice?: Partial<PaymentIntent>;
    invoiceId?: string;
    orderId?: string;
  };
  const payload = body.payload as
    | (DeroPayWebhookEvent["payload"] & { invoiceId?: string })
    | undefined;
  const invoiceId = body.invoiceId ?? body.invoice?.invoiceId ?? payload?.invoiceId;
  if (!invoiceId) throw new Error("Webhook is missing invoiceId");
  const status = normalizeStatus(body.status ?? body.invoice?.status ?? payload?.status);
  const type = (body.type ?? body.event ?? eventTypeForStatus(status)) as DeroPayWebhookType;
  const paymentId =
    body.payload?.paymentId ?? body.invoice?.paymentId ?? crypto.randomUUID();
  const providerEventId =
    body.payload?.providerEventId ??
    (body as { providerEventId?: string; eventId?: string }).providerEventId ??
    (body as { eventId?: string }).eventId ??
    body.id;
  const txId =
    body.payload?.txId ??
    (body as { txId?: string; transactionId?: string }).txId ??
    (body as { transactionId?: string }).transactionId;
  const confirmations =
    body.payload?.confirmations ??
    (body as { confirmations?: number }).confirmations ??
    body.invoice?.requiredConfirmations;
  return {
    id: body.id ?? `wh_${crypto.randomUUID()}`,
    type,
    invoiceId,
    createdAt: body.createdAt ?? new Date().toISOString(),
    signature: body.signature ?? "unverified",
    payload: {
      orderId: payload?.orderId ?? body.orderId ?? body.invoice?.orderId ?? "",
      rail: payload?.rail ?? body.invoice?.rail ?? "dero_escrow",
      status,
      amountAtomic: payload?.amountAtomic ?? body.invoice?.amountAtomic ?? "0",
      amountReceivedAtomic:
        payload?.amountReceivedAtomic ??
        body.invoice?.amountReceivedAtomic ??
        "0",
      paymentId,
      providerEventId,
      txId,
      confirmations:
        typeof confirmations === "number" && Number.isFinite(confirmations)
          ? confirmations
          : undefined,
      destinationAddress:
        payload?.destinationAddress ??
        (body as { destinationAddress?: string }).destinationAddress,
      rawStatus: String(body.status ?? body.invoice?.status ?? payload?.status ?? ""),
    },
  };
}

function transitionForEvent(
  event: VerifiedWebhookEvent,
  invoice: PaymentIntent
): PaymentProviderTransition {
  if (event.type === "payment.detected") {
    return {
      invoice: detectMockInvoicePayment(invoice),
      orderStatus: "payment_detected",
      label: "Payment detected",
      detail: "DeroPay reported a payment to the invoice integrated address.",
    };
  }
  if (event.type === "payment.confirming") {
    return {
      invoice: markMockInvoiceConfirming(invoice),
      orderStatus: "confirming",
      label: "Confirmations advancing",
      detail: "DeroPay reported confirmations below the release threshold.",
    };
  }
  if (event.type === "payment.completed") {
    return {
      invoice: completeMockInvoice(invoice),
      orderStatus: "funded",
      label: "Invoice completed",
      detail: "DeroPay confirmed the invoice and funded the marketplace order.",
    };
  }
  if (event.type === "payment.partial") {
    return {
      invoice: createPartialMockInvoicePayment(invoice),
      orderStatus: "partial_payment",
      label: "Partial payment",
      detail: "DeroPay reported less than the required invoice total.",
    };
  }
  if (event.type === "invoice.expired") {
    return {
      invoice: expireMockInvoice(invoice),
      orderStatus: "expired",
      label: "Invoice expired",
      detail: "The DeroPay invoice expired before a completed payment arrived.",
    };
  }
  return {
    invoice,
    orderStatus: "awaiting_payment",
    label: "Webhook received",
    detail: `${event.type} was recorded without changing the order state.`,
  };
}

function paymentStatusFor(
  status: DeroPayInvoiceStatus,
  confirmations: number,
  requiredConfirmations: number
): DeroPayPaymentStatus {
  if (status === "completed" || confirmations >= requiredConfirmations) {
    return "confirmed";
  }
  if (status === "confirming" || confirmations > 0) return "confirming";
  return "detected";
}

function livePaymentFromEvent(
  event: VerifiedWebhookEvent,
  invoice: PaymentIntent
): DeroPayPayment | null {
  if (!event.payload.txId) return null;
  if (invoice.payments.some((payment) => payment.txId === event.payload.txId)) return null;
  const confirmations = event.payload.confirmations ?? 0;
  return {
    txId: event.payload.txId,
    amountAtomic: event.payload.amountReceivedAtomic || event.payload.amountAtomic,
    confirmations,
    status: paymentStatusFor(event.payload.status, confirmations, invoice.requiredConfirmations),
    detectedAt: event.createdAt,
    destinationPort: invoice.payments[0]?.destinationPort ?? 0,
    providerEventId: event.payload.providerEventId,
    destinationAddress: event.payload.destinationAddress,
    rawStatus: event.payload.rawStatus,
  };
}

function liveTransitionForEvent(
  event: VerifiedWebhookEvent,
  invoice: PaymentIntent
): PaymentProviderTransition {
  const due = BigInt(invoice.amountAtomic);
  const received = BigInt(event.payload.amountReceivedAtomic || invoice.amountReceivedAtomic);
  const confirmations = event.payload.confirmations ?? 0;
  let nextStatus = event.payload.status;
  if (nextStatus === "completed" && (received < due || confirmations < invoice.requiredConfirmations)) {
    nextStatus = received > 0n ? "confirming" : "pending";
  }
  if (nextStatus === "pending" && received > 0n && received < due) nextStatus = "partial";
  const payment = livePaymentFromEvent(event, invoice);
  const nextInvoice: PaymentIntent = {
    ...invoice,
    status: nextStatus,
    amountReceivedAtomic: received.toString(),
    payments: payment ? [payment, ...invoice.payments] : invoice.payments,
    escrowState:
      invoice.rail === "dero_escrow" && ["pending", "confirming", "completed"].includes(nextStatus)
        ? "locked"
        : invoice.escrowState,
    updatedAt: new Date().toISOString(),
  };
  const orderStatus =
    nextStatus === "pending"
      ? "payment_detected"
      : nextStatus === "confirming"
        ? "confirming"
        : nextStatus === "completed"
          ? "funded"
          : nextStatus === "partial"
            ? "partial_payment"
            : nextStatus === "expired"
              ? "expired"
              : "awaiting_payment";
  return {
    invoice: nextInvoice,
    orderStatus,
    label:
      nextStatus === "completed"
        ? "Invoice completed"
        : nextStatus === "expired"
          ? "Invoice expired"
          : "Invoice reconciled",
    detail: `DeroPay reported ${event.type} with provider status ${event.payload.rawStatus || nextStatus}.`,
  };
}

export const mockDeroPayProvider: PaymentProvider = {
  name: "mock",
  async createInvoice(input) {
    return {
      invoice: createMockDeroPayInvoice(input.orderId, input.summary, input.rail),
    };
  },
  async getInvoiceStatus(invoice) {
    return { invoice };
  },
  async verifyWebhook(rawBody, headers) {
    verifySignature(rawBody, headers, isProduction());
    return parseWebhook(rawBody);
  },
  mapWebhookToPaymentEvent: transitionForEvent,
  async settleEscrow(invoice, action) {
    if (invoice.rail !== "dero_escrow") {
      throw new Error("Only escrow invoices can be settled");
    }
    const settlementId = `settle_${crypto.randomUUID()}`;
    const escrowState =
      action === "refund" ? "refunded" : action === "dispute" ? "disputed" : "released";
    return {
      settlementId,
      invoice: {
        ...invoice,
        escrowState,
        settlementId,
        updatedAt: new Date().toISOString(),
      },
    };
  },
};

function liveHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "content-type": "application/json",
  };
  if (process.env.DEROPAY_API_KEY) {
    headers.authorization = `Bearer ${process.env.DEROPAY_API_KEY}`;
  }
  return headers;
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new Error(`DeroPay request failed with HTTP ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function liveInvoiceFromResponse(
  fallback: PaymentIntent,
  data: Record<string, unknown>
): PaymentIntent {
  const status = normalizeStatus(data.status);
  const invoiceId = data.invoiceId ?? data.id;
  const integratedAddress = data.integratedAddress ?? data.address;
  const paymentId = data.paymentId;
  if (!invoiceId || !integratedAddress || !paymentId) {
    throw new Error("DeroPay response is missing required invoice fields");
  }
  const amountReceivedAtomic = String(
    data.amountReceivedAtomic ?? fallback.amountReceivedAtomic
  );
  const escrowState: PaymentIntent["escrowState"] =
    fallback.rail === "dero_escrow" &&
    ["pending", "confirming", "completed"].includes(status)
      ? "locked"
      : status === "expired"
        ? "not_locked"
        : fallback.escrowState;
  return {
    ...fallback,
    status,
    invoiceId: String(invoiceId),
    integratedAddress: String(integratedAddress),
    baseAddress: String(data.baseAddress ?? fallback.baseAddress),
    paymentId: String(paymentId),
    amountReceivedAtomic,
    escrowState,
    updatedAt: new Date().toISOString(),
  };
}

export const liveDeroPayProvider: PaymentProvider = {
  name: "deropay",
  async createInvoice(input) {
    assertLivePaymentEnv();
    const baseUrl = process.env.DEROPAY_BASE_URL;
    if (!baseUrl) throw new Error("DEROPAY_BASE_URL is required for live DeroPay");
    const fallback = createMockDeroPayInvoice(input.orderId, input.summary, input.rail);
    const response = await fetch(new URL("/invoices", baseUrl), {
      method: "POST",
      headers: liveHeaders(),
      body: JSON.stringify({
        orderId: input.orderId,
        amountAtomic: input.summary.totalAtomic.toString(),
        amountDero: input.summary.totalDero,
        rail: input.rail,
        buyerAlias: input.buyerAlias,
        webhookUrl: input.webhookUrl,
      }),
    });
    return {
      invoice: liveInvoiceFromResponse(fallback, await parseJsonResponse(response)),
    };
  },
  async getInvoiceStatus(invoice) {
    assertLivePaymentEnv();
    const baseUrl = process.env.DEROPAY_BASE_URL;
    if (!baseUrl) throw new Error("DEROPAY_BASE_URL is required for live DeroPay");
    const url = new URL("/status", baseUrl);
    url.searchParams.set("invoiceId", invoice.invoiceId);
    const response = await fetch(url, { headers: liveHeaders() });
    return {
      invoice: liveInvoiceFromResponse(invoice, await parseJsonResponse(response)),
    };
  },
  async verifyWebhook(rawBody, headers) {
    verifySignature(rawBody, headers, true);
    return parseWebhook(rawBody);
  },
  mapWebhookToPaymentEvent: liveTransitionForEvent,
  async settleEscrow(invoice, action) {
    assertLivePaymentEnv();
    if (invoice.rail !== "dero_escrow") {
      throw new Error("Only escrow invoices can be settled");
    }
    const baseUrl = process.env.DEROPAY_BASE_URL;
    if (!baseUrl) throw new Error("DEROPAY_BASE_URL is required for live DeroPay");
    const response = await fetch(new URL(`/escrow/${action}`, baseUrl), {
      method: "POST",
      headers: liveHeaders(),
      body: JSON.stringify({
        invoiceId: invoice.invoiceId,
        orderId: invoice.orderId,
        paymentId: invoice.paymentId,
      }),
    });
    const data = await parseJsonResponse(response);
    const settlementId = String(data.settlementId ?? data.txId ?? crypto.randomUUID());
    const escrowState =
      action === "refund" ? "refunded" : action === "dispute" ? "disputed" : "released";
    return {
      settlementId,
      invoice: {
        ...liveInvoiceFromResponse(invoice, data),
        escrowState,
        settlementId,
      },
    };
  },
};

export function getPaymentProvider(): PaymentProvider {
  if (isLiveDeroPay()) assertLivePaymentEnv();
  return process.env.PAYMENT_PROVIDER === "deropay"
    ? liveDeroPayProvider
    : mockDeroPayProvider;
}

export function createSignedMockWebhook(
  type: DeroPayWebhookType,
  invoice: PaymentIntent
): { body: string; headers: Headers } {
  const event = createMockWebhookEvent(type, invoice);
  const body = JSON.stringify(event);
  const timestamp = Date.now().toString();
  const headers = new Headers({
    "content-type": "application/json",
    "x-deropay-timestamp": timestamp,
  });
  const secret = process.env.DEROPAY_WEBHOOK_SECRET;
  if (secret) headers.set("x-deropay-signature", hmacWebhookSignature(body, secret, timestamp));
  return { body, headers };
}
