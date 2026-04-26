import type { OrderStatus, PaymentStatus } from "@/lib/types";

const orderLabels: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting payment",
  payment_detected: "Payment detected",
  confirming: "Confirming payment",
  funded: "Escrow funded",
  partial_payment: "Payment incomplete",
  processing: "Seller preparing",
  shipped: "On the way",
  delivered: "Delivered - action needed",
  disputed: "Dispute open",
  released: "Completed",
  expired: "Expired",
  refunded: "Refunded",
};

const paymentLabels: Record<PaymentStatus, string> = {
  created: "Invoice created",
  pending: "Payment pending",
  confirming: "Confirming",
  completed: "Completed",
  partial: "Partial",
  expired: "Expired",
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const tone =
    status === "disputed" || status === "refunded" || status === "expired"
      ? "badge-warn"
      : status === "released" || status === "funded"
        ? "badge-dero"
        : "";
  return <span className={`badge ${tone}`}>{orderLabels[status]}</span>;
}

export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  const tone =
    status === "completed"
      ? "badge-dero"
      : status === "expired" || status === "partial"
        ? "badge-warn"
        : "";
  return <span className={`badge ${tone}`}>{paymentLabels[status]}</span>;
}
