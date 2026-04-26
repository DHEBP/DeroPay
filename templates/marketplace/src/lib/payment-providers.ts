import { nowIso } from "./format";
import type {
  CartSummary,
  DeroPayInvoiceStatus,
  DeroPayPayment,
  DeroPayPaymentStatus,
  DeroPayWebhookEvent,
  DeroPayWebhookType,
  PaymentIntent,
  PaymentRail,
} from "./types";

function token(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function railConfig(rail: PaymentRail) {
  if (rail === "dero_router") {
    return {
      confirmations: 3,
      destinationPort: 0,
      addressPrefix: "router",
    };
  }
  if (rail === "dero_escrow") {
    return {
      confirmations: 6,
      destinationPort: 4545,
      addressPrefix: "escrow",
    };
  }
  return {
    confirmations: 2,
    destinationPort: 10101,
    addressPrefix: "direct",
  };
}

export function createMockDeroPayInvoice(
  orderId: string,
  summary: CartSummary,
  rail: PaymentRail
): PaymentIntent {
  const id = token("pay");
  const invoiceId = token("inv");
  const paymentId = BigInt(Date.now()).toString(16);
  const config = railConfig(rail);
  const createdAt = nowIso();

  return {
    id,
    orderId,
    rail,
    status: "created",
    invoiceId,
    baseAddress: `dero1qy${config.addressPrefix}${token("merchant").replaceAll("_", "")}`,
    integratedAddress: `dero1qy${config.addressPrefix}${token("market").replaceAll("_", "")}9v${orderId.slice(-4)}`,
    paymentId,
    amountAtomic: summary.totalAtomic.toString(),
    amountDero: summary.totalDero,
    amountReceivedAtomic: "0",
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    requiredConfirmations: config.confirmations,
    payments: [],
    webhookEventIds: [],
    escrowState: rail === "dero_escrow" ? "not_locked" : "released",
    createdAt,
    updatedAt: createdAt,
  };
}

function receivedTotal(intent: PaymentIntent, nextAmount: bigint): string {
  return (BigInt(intent.amountReceivedAtomic) + nextAmount).toString();
}

function mockPayment(
  intent: PaymentIntent,
  amountAtomic: bigint,
  status: DeroPayPaymentStatus
): DeroPayPayment {
  return {
    txId: token("tx"),
    amountAtomic: amountAtomic.toString(),
    confirmations:
      status === "confirmed"
        ? intent.requiredConfirmations
        : status === "confirming"
          ? Math.max(1, intent.requiredConfirmations - 1)
          : 0,
    status,
    detectedAt: nowIso(),
    destinationPort: railConfig(intent.rail).destinationPort,
  };
}

export function detectMockInvoicePayment(
  intent: PaymentIntent,
  amountAtomic?: bigint
): PaymentIntent {
  const due = BigInt(intent.amountAtomic);
  const outstanding = due - BigInt(intent.amountReceivedAtomic);
  const detectedAmount = amountAtomic ?? (outstanding > 0n ? outstanding : due);
  const amountReceivedAtomic = receivedTotal(intent, detectedAmount);
  const status: DeroPayInvoiceStatus =
    BigInt(amountReceivedAtomic) >= due ? "pending" : "partial";

  return {
    ...intent,
    status,
    amountReceivedAtomic,
    payments: [mockPayment(intent, detectedAmount, "detected"), ...intent.payments],
    escrowState:
      intent.rail === "dero_escrow" && status === "pending"
        ? "locked"
        : intent.escrowState,
    updatedAt: nowIso(),
  };
}

export function createPartialMockInvoicePayment(intent: PaymentIntent): PaymentIntent {
  const due = BigInt(intent.amountAtomic);
  const received = BigInt(intent.amountReceivedAtomic);
  const outstanding = due - received;
  const partialAmount = outstanding > 4n ? outstanding / 2n : outstanding;
  return detectMockInvoicePayment(intent, partialAmount);
}

export function markMockInvoiceConfirming(intent: PaymentIntent): PaymentIntent {
  return {
    ...intent,
    status: "confirming",
    payments: intent.payments.map((payment, index) =>
      index === 0
        ? {
            ...payment,
            status: "confirming",
            confirmations: Math.max(1, intent.requiredConfirmations - 1),
          }
        : payment
    ),
    updatedAt: nowIso(),
  };
}

export function completeMockInvoice(intent: PaymentIntent): PaymentIntent {
  const due = BigInt(intent.amountAtomic);
  const received = BigInt(intent.amountReceivedAtomic);
  const remaining = due > received ? due - received : 0n;
  const completedPayments =
    remaining > 0n
      ? [mockPayment(intent, remaining, "confirmed"), ...intent.payments]
      : intent.payments.map((payment, index) =>
          index === 0
            ? {
                ...payment,
                status: "confirmed" as const,
                confirmations: intent.requiredConfirmations,
              }
            : payment
        );

  return {
    ...intent,
    status: "completed",
    amountReceivedAtomic: due.toString(),
    payments: completedPayments,
    escrowState: intent.rail === "dero_escrow" ? "locked" : intent.escrowState,
    updatedAt: nowIso(),
  };
}

export function expireMockInvoice(intent: PaymentIntent): PaymentIntent {
  return {
    ...intent,
    status: "expired",
    updatedAt: nowIso(),
  };
}

export function markIntentFulfilled(intent: PaymentIntent): PaymentIntent {
  if (intent.rail !== "dero_escrow") return intent;
  return {
    ...intent,
    escrowState: "seller_fulfilled",
    updatedAt: nowIso(),
  };
}

export function releaseMockDeroIntent(intent: PaymentIntent): PaymentIntent {
  if (intent.rail !== "dero_escrow") return intent;
  return {
    ...intent,
    escrowState: "released",
    updatedAt: nowIso(),
  };
}

export function createMockWebhookEvent(
  type: DeroPayWebhookType,
  invoice: PaymentIntent
): DeroPayWebhookEvent {
  return {
    id: token("wh"),
    type,
    invoiceId: invoice.invoiceId,
    createdAt: nowIso(),
    signature: `sha256=${token("sig").replaceAll("_", "")}`,
    payload: {
      orderId: invoice.orderId,
      rail: invoice.rail,
      status: invoice.status,
      amountAtomic: invoice.amountAtomic,
      amountReceivedAtomic: invoice.amountReceivedAtomic,
      paymentId: invoice.paymentId,
      providerEventId: token("evt"),
      txId: token("tx"),
      confirmations:
        type === "payment.completed"
          ? invoice.requiredConfirmations
          : type === "payment.confirming"
            ? Math.max(1, invoice.requiredConfirmations - 1)
            : 0,
      destinationAddress: invoice.integratedAddress,
      rawStatus: invoice.status,
    },
  };
}
