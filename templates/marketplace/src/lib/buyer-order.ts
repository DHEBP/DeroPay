import type { Order, PaymentIntent } from "./types";

export type BuyerMilestone =
  | "payment"
  | "confirmed"
  | "fulfillment"
  | "delivered"
  | "review"
  | "release"
  | "refunded"
  | "expired";

export function getBuyerOrderLabel(order: Order): string {
  const labels: Record<Order["status"], string> = {
    awaiting_payment: "Awaiting payment",
    payment_detected: "Payment detected",
    confirming: "Confirming payment",
    funded: order.paymentRail === "dero_escrow" ? "Escrow funded" : "Payment complete",
    partial_payment: "Payment incomplete",
    processing: "Seller preparing order",
    shipped: "On the way",
    delivered: "Delivered - action needed",
    disputed: "Dispute open",
    released: "Completed",
    expired: "Invoice expired",
    refunded: "Refunded",
  };
  return labels[order.status];
}

export function getBuyerNextAction(order: Order): string {
  const actions: Record<Order["status"], string> = {
    awaiting_payment: "Send the exact DERO amount to the invoice address.",
    payment_detected: "Wait while the DERO payment reaches the required confirmations.",
    confirming: "Confirmations are advancing. Keep this order open for status updates.",
    funded:
      order.paymentRail === "dero_escrow"
        ? "Escrow is funded. The seller needs to accept and prepare the order."
        : "Payment is complete. The seller needs to accept and prepare the order.",
    partial_payment: "Send the remaining balance before the invoice expires.",
    processing: "The seller is preparing fulfillment evidence.",
    shipped: "Review the seller's delivery evidence when it arrives.",
    delivered:
      order.paymentRail === "dero_escrow"
        ? "Check the delivery, then release escrow or open a dispute."
        : "Check the delivery and open a marketplace review if something is wrong.",
    disputed: "The marketplace review is open. Add evidence if needed.",
    released:
      order.paymentRail === "dero_escrow"
        ? "Escrow is complete and the seller has been paid."
        : "The order is complete.",
    expired: "Create a new invoice if you still want these items.",
    refunded: "The order was refunded.",
  };
  return actions[order.status];
}

export function getOrderMilestone(order: Order): BuyerMilestone {
  if (["funded"].includes(order.status)) return "confirmed";
  if (["processing", "shipped"].includes(order.status)) return "fulfillment";
  if (order.status === "delivered") return "delivered";
  if (order.status === "disputed") return "review";
  if (order.status === "released") return "release";
  if (order.status === "refunded") return "refunded";
  if (order.status === "expired") return "expired";
  return "payment";
}

export function getPaymentDetailLabel(invoice?: PaymentIntent): string {
  if (!invoice) return "Invoice not created";
  if (invoice.status === "completed") return "Payment complete";
  if (invoice.status === "partial") return "Partial payment received";
  if (invoice.status === "expired") return "Invoice expired";
  if (invoice.status === "confirming") return "Confirming payment";
  if (invoice.status === "pending") return "Payment detected";
  return "Waiting for payment";
}
