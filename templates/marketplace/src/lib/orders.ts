import { nowIso } from "./format";
import type {
  CartItem,
  CheckoutDetails,
  Order,
  OrderEvent,
  OrderStatus,
  PaymentRail,
} from "./types";

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function orderEvent(label: string, detail: string): OrderEvent {
  return {
    id: id("evt"),
    at: nowIso(),
    label,
    detail,
  };
}

function railDetail(rail: PaymentRail): string {
  if (rail === "dero_router") {
    return "DeroPay router invoice is waiting for a buyer payment to the merchant route.";
  }
  if (rail === "dero_escrow") {
    return "DeroPay escrow invoice is waiting for DERO before fulfillment can begin.";
  }
  return "DeroPay direct invoice is waiting for a buyer payment to the integrated address.";
}

export function createOrder(args: {
  id?: string;
  buyerAlias: string;
  checkoutDetails?: CheckoutDetails;
  items: CartItem[];
  sellerIds: string[];
  paymentRail: PaymentRail;
  paymentIntentId: string;
  totalAtomic: string;
}): Order {
  const createdAt = nowIso();
  const checkoutDetails =
    args.checkoutDetails ??
    ({
      buyerAlias: args.buyerAlias,
      contactHandle: "demo-buyer",
      deliveryType: "physical",
      deliveryDestination: "Demo delivery destination",
      orderNote: "",
    } satisfies CheckoutDetails);
  return {
    id: args.id ?? id("ord"),
    buyerAlias: args.buyerAlias,
    checkoutDetails,
    sellerIds: args.sellerIds,
    items: args.items,
    status: "awaiting_payment",
    paymentRail: args.paymentRail,
    paymentIntentId: args.paymentIntentId,
    totalAtomic: args.totalAtomic,
    createdAt,
    updatedAt: createdAt,
    events: [orderEvent("Order created", railDetail(args.paymentRail))],
  };
}

export function transitionOrder(
  order: Order,
  status: OrderStatus,
  label: string,
  detail: string
): Order {
  return {
    ...order,
    status,
    updatedAt: nowIso(),
    events: [orderEvent(label, detail), ...order.events],
  };
}
