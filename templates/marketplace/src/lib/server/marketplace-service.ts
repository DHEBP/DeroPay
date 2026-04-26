import { calculateCartSummary } from "@/lib/cart";
import { createSellerListing, type ListingInput } from "@/lib/listing-input";
import { listings } from "@/lib/marketplace-data";
import { createOrder, orderEvent, transitionOrder } from "@/lib/orders";
import type {
  AuthActor,
} from "./auth";
import type {
  CartItem,
  CheckoutDetails,
  DeroPayWebhookEvent,
  Dispute,
  DisputeEvent,
  FulfillmentEvidence,
  Listing,
  MarketplaceSnapshot,
  Order,
  PaymentIntent,
  PaymentRail,
} from "@/lib/types";
import { getPaymentProvider } from "./payment-provider";
import {
  captureReservedInventory,
  getInvoiceByInvoiceId,
  getInvoiceByOrderId,
  getOrder,
  hasOpenDispute,
  insertWebhookEvent,
  listDisputes,
  listServerListings,
  readSnapshot,
  releaseReservedInventory,
  reserveInventoryForOrder,
  saveAuditEvent,
  saveDispute,
  saveFulfillmentEvidence,
  saveInvoice,
  saveListing,
  saveOrder,
} from "./marketplace-repository";
import { runInTransaction } from "./db";

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function orderId(): string {
  return id("ord");
}

function disputeEvent(
  actor: DisputeEvent["actor"],
  label: string,
  detail: string
): DisputeEvent {
  return {
    id: id("dsp_evt"),
    at: new Date().toISOString(),
    actor,
    label,
    detail,
  };
}

function audit(orderIdValue: string, action: string, detail: string): void {
  saveAuditEvent({
    id: id("audit"),
    orderId: orderIdValue,
    at: new Date().toISOString(),
    actor: "system",
    action,
    detail,
  });
}

function orderStatusForInvoice(invoice: PaymentIntent): Order["status"] {
  if (invoice.status === "pending") return "payment_detected";
  if (invoice.status === "confirming") return "confirming";
  if (invoice.status === "completed") return "funded";
  if (invoice.status === "partial") return "partial_payment";
  if (invoice.status === "expired") return "expired";
  return "awaiting_payment";
}

const allowedInvoiceTransitions: Record<
  PaymentIntent["status"],
  PaymentIntent["status"][]
> = {
  created: ["created", "pending", "partial", "expired"],
  pending: ["pending", "confirming", "completed", "partial", "expired"],
  confirming: ["confirming", "completed"],
  completed: ["completed"],
  partial: ["partial", "pending", "confirming", "completed", "expired"],
  expired: ["expired"],
};

function validInvoiceTransition(
  current: PaymentIntent["status"],
  next: PaymentIntent["status"]
): boolean {
  return allowedInvoiceTransitions[current].includes(next);
}

function attachWebhook(invoice: PaymentIntent, webhook: DeroPayWebhookEvent): PaymentIntent {
  if (invoice.webhookEventIds.includes(webhook.id)) return invoice;
  return {
    ...invoice,
    webhookEventIds: [webhook.id, ...invoice.webhookEventIds],
  };
}

export function getMarketplaceSnapshot(): MarketplaceSnapshot {
  return readSnapshot();
}

export function filterMarketplaceSnapshotForActor(
  snapshot: MarketplaceSnapshot,
  actor: AuthActor
): MarketplaceSnapshot {
  if (actor.role === "admin" || actor.role === "dev") return snapshot;
  const orders = snapshot.orders.filter((order) => {
    if (actor.role === "buyer") return order.buyerAlias === actor.buyerAlias;
    if (actor.role === "seller" && actor.sellerId) {
      return order.sellerIds.includes(actor.sellerId);
    }
    return false;
  });
  const orderIds = new Set(orders.map((order) => order.id));
  return {
    serverListings: snapshot.serverListings,
    orders,
    paymentIntents: snapshot.paymentIntents.filter((invoice) =>
      orderIds.has(invoice.orderId)
    ),
    webhookEvents: [],
    disputes: snapshot.disputes.filter((dispute) => orderIds.has(dispute.orderId)),
    fulfillmentEvidence: snapshot.fulfillmentEvidence.filter((entry) =>
      orderIds.has(entry.orderId)
    ),
    auditEvents: snapshot.auditEvents.filter((entry) => orderIds.has(entry.orderId)),
  };
}

export function getMarketplaceSnapshotForActor(actor: AuthActor): MarketplaceSnapshot {
  return filterMarketplaceSnapshotForActor(readSnapshot(), actor);
}

export function publishSellerListing(input: ListingInput): {
  listing: Listing;
  snapshot: MarketplaceSnapshot;
} {
  const listing = createSellerListing(input);
  saveListing(listing);
  return { listing, snapshot: readSnapshot() };
}

function availableListings(customListings: Listing[] = []): Listing[] {
  return [...listings, ...listServerListings(), ...customListings];
}

function validateInventory(items: CartItem[], rows: Listing[]): void {
  for (const item of items) {
    const listing = rows.find((entry) => entry.id === item.listingId);
    if (!listing) throw new Error(`Listing ${item.listingId} was not found`);
    if (listing.status === "sold_out" || listing.stock <= 0) {
      throw new Error(`${listing.title} is sold out`);
    }
    if (listing.stock < item.quantity) {
      throw new Error(`${listing.title} only has ${listing.stock} available`);
    }
  }
}

function validateLiveWebhookConsistency(
  providerName: ReturnType<typeof getPaymentProvider>["name"],
  webhook: DeroPayWebhookEvent,
  invoice: PaymentIntent,
  order: Order
): void {
  if (providerName !== "deropay") return;
  if (webhook.payload.orderId && webhook.payload.orderId !== order.id) {
    throw new Error("Webhook orderId does not match invoice order");
  }
  if (webhook.payload.rail !== invoice.rail) {
    throw new Error("Webhook rail does not match invoice");
  }
  if (webhook.payload.paymentId !== invoice.paymentId) {
    throw new Error("Webhook paymentId does not match invoice");
  }
  if (webhook.payload.amountAtomic !== invoice.amountAtomic) {
    throw new Error("Webhook amount does not match invoice");
  }
  if (
    webhook.type === "payment.completed" &&
    BigInt(webhook.payload.amountReceivedAtomic) < BigInt(invoice.amountAtomic)
  ) {
    throw new Error("Webhook completed event is underpaid");
  }
  if (
    webhook.type === "payment.completed" &&
    (webhook.payload.confirmations ?? 0) < invoice.requiredConfirmations
  ) {
    throw new Error("Webhook completed event lacks required confirmations");
  }
  if (
    webhook.payload.destinationAddress &&
    webhook.payload.destinationAddress !== invoice.integratedAddress
  ) {
    throw new Error("Webhook destination address does not match invoice");
  }
}

export async function createCheckoutOrder(args: {
  buyerAlias?: string;
  checkoutDetails?: CheckoutDetails;
  customListings?: Listing[];
  items: CartItem[];
  rail?: PaymentRail;
  origin?: string;
}): Promise<{ order: Order; invoice: PaymentIntent; snapshot: MarketplaceSnapshot }> {
  const rail = args.rail ?? "dero_escrow";
  const rows = availableListings(args.customListings);
  validateInventory(args.items, rows);
  const summary = calculateCartSummary(args.items, rows);
  if (summary.lines.length === 0) {
    throw new Error("Cart is empty or contains unknown listings");
  }
  const idValue = orderId();
  const sellerIds = Array.from(
    new Set(summary.lines.map((line) => line.listing.sellerId))
  );
  const provider = getPaymentProvider();
  const checkoutDetails =
    args.checkoutDetails ??
    ({
      buyerAlias: args.buyerAlias ?? "demo-buyer",
      contactHandle: "demo-buyer",
      deliveryType: summary.lines.some((line) => line.listing.kind === "physical")
        ? "physical"
        : "digital",
      deliveryDestination: "Demo delivery destination",
      orderNote: "",
    } satisfies CheckoutDetails);
  const webhookUrl = args.origin
    ? new URL("/api/webhooks/deropay", args.origin).toString()
    : undefined;
  const { invoice } = await provider.createInvoice({
    orderId: idValue,
    buyerAlias: checkoutDetails.buyerAlias,
    rail,
    summary,
    webhookUrl,
  });
  const order = createOrder({
    id: idValue,
    buyerAlias: checkoutDetails.buyerAlias,
    checkoutDetails,
    items: args.items,
    sellerIds,
    paymentRail: rail,
    paymentIntentId: invoice.id,
    totalAtomic: summary.totalAtomic.toString(),
  });

  runInTransaction(() => {
    saveOrder(order);
    saveInvoice(invoice);
    reserveInventoryForOrder(order.id, args.items);
    audit(order.id, "checkout.created", "Order, reservation, and DeroPay invoice were created server-side.");
  });

  return {
    order,
    invoice,
    snapshot: readSnapshot(),
  };
}

export async function applyVerifiedWebhook(
  webhook: DeroPayWebhookEvent
): Promise<MarketplaceSnapshot> {
  return runInTransaction(() => {
    const invoice = getInvoiceByInvoiceId(webhook.invoiceId);
    if (!invoice) throw new Error("Invoice was not found");
    const order = getOrder(invoice.orderId);
    if (!order) throw new Error("Order was not found");

    const provider = getPaymentProvider();
    validateLiveWebhookConsistency(provider.name, webhook, invoice, order);
    const inserted = insertWebhookEvent(webhook);
    if (!inserted) return readSnapshot();

    const transition = provider.mapWebhookToPaymentEvent(webhook, invoice);
    const nextInvoice = attachWebhook(transition.invoice, webhook);
    if (!validInvoiceTransition(invoice.status, nextInvoice.status)) {
      audit(
        order.id,
        "webhook.ignored",
        `Ignored invalid invoice transition ${invoice.status} -> ${nextInvoice.status}.`
      );
      return readSnapshot();
    }

    const nextOrder =
      transition.orderStatus === "awaiting_payment" && order.status !== "awaiting_payment"
        ? order
        : transitionOrder(
            order,
            transition.orderStatus,
            transition.label,
            transition.detail
          );
    saveInvoice(nextInvoice);
    saveOrder(nextOrder);
    if (nextInvoice.status === "completed") captureReservedInventory(order.id);
    if (nextInvoice.status === "expired") releaseReservedInventory(order.id);
    audit(order.id, webhook.type, transition.detail);
    return readSnapshot();
  });
}

export async function refreshInvoiceStatus(invoiceId: string): Promise<MarketplaceSnapshot> {
  const invoice = getInvoiceByInvoiceId(invoiceId);
  if (!invoice) throw new Error("Invoice was not found");
  const order = getOrder(invoice.orderId);
  if (!order) throw new Error("Order was not found");
  const provider = getPaymentProvider();
  const { invoice: nextInvoice } = await provider.getInvoiceStatus(invoice);
  return runInTransaction(() => {
    if (!validInvoiceTransition(invoice.status, nextInvoice.status)) {
      audit(
        order.id,
        "status.ignored",
        `Ignored invalid polled invoice transition ${invoice.status} -> ${nextInvoice.status}.`
      );
      return readSnapshot();
    }
    saveInvoice(nextInvoice);
    if (nextInvoice.status === "completed") captureReservedInventory(order.id);
    if (nextInvoice.status === "expired") releaseReservedInventory(order.id);
    if (nextInvoice.status !== invoice.status) {
      saveOrder(
        transitionOrder(
          order,
          orderStatusForInvoice(nextInvoice),
          "Invoice status refreshed",
          `DeroPay status changed to ${nextInvoice.status}.`
        )
      );
    }
    return readSnapshot();
  });
}

export function advanceFulfillment(
  orderIdValue: string,
  evidenceInput?: { kind?: FulfillmentEvidence["kind"]; summary?: string }
): MarketplaceSnapshot {
  const order = getOrder(orderIdValue);
  const invoice = getInvoiceByOrderId(orderIdValue);
  if (!order || !invoice) throw new Error("Order was not found");
  if (!["funded", "processing", "shipped"].includes(order.status)) {
    throw new Error("Fulfillment can only advance after funding");
  }

  const next =
    order.status === "funded"
      ? {
          status: "processing" as const,
          label: "Seller accepted order",
          detail: "Seller moved the order into fulfillment.",
          evidence: "Seller accepted the funded order.",
        }
      : order.status === "processing"
        ? {
            status: "shipped" as const,
            label: "Fulfillment submitted",
            detail: "Tracking or digital delivery evidence was attached.",
            evidence: "Seller submitted fulfillment evidence.",
          }
        : {
            status: "delivered" as const,
            label: "Delivery marked complete",
            detail: "Buyer can now release escrow or open a dispute.",
            evidence: "Delivery was marked complete.",
          };

  const evidence: FulfillmentEvidence = {
    id: id("ful"),
    orderId: order.id,
    kind: evidenceInput?.kind ?? "seller_note",
    summary: evidenceInput?.summary || next.evidence,
    createdAt: new Date().toISOString(),
  };
  return runInTransaction(() => {
    saveFulfillmentEvidence(evidence);
    saveOrder(transitionOrder(order, next.status, next.label, next.detail));
    if (invoice.rail === "dero_escrow" && next.status === "delivered") {
      saveInvoice({ ...invoice, escrowState: "seller_fulfilled" });
    }
    audit(order.id, "fulfillment.advanced", next.detail);
    return readSnapshot();
  });
}

export async function releaseEscrow(orderIdValue: string): Promise<MarketplaceSnapshot> {
  const order = getOrder(orderIdValue);
  const invoice = getInvoiceByOrderId(orderIdValue);
  if (!order || !invoice) throw new Error("Order was not found");
  if (invoice.rail !== "dero_escrow") throw new Error("Only escrow orders can be released");
  if (hasOpenDispute(order.id)) throw new Error("Open disputes block escrow release");
  if (order.status !== "delivered") throw new Error("Escrow release requires delivery");
  const provider = getPaymentProvider();
  const settlement = await provider.settleEscrow(invoice, "release");
  return runInTransaction(() => {
    saveInvoice(settlement.invoice);
    saveOrder(
      transitionOrder(
        order,
        "released",
        "Escrow released",
        `Buyer confirmed delivery and released escrow (${settlement.settlementId}).`
      )
    );
    audit(order.id, "escrow.released", "Buyer released escrow to the seller.");
    return readSnapshot();
  });
}

export function openDispute(orderIdValue: string, reason: string): MarketplaceSnapshot {
  const order = getOrder(orderIdValue);
  const invoice = getInvoiceByOrderId(orderIdValue);
  if (!order || !invoice) throw new Error("Order was not found");
  if (hasOpenDispute(order.id)) {
    throw new Error("This order already has an active marketplace review");
  }
  if (!["funded", "processing", "shipped", "delivered"].includes(order.status)) {
    throw new Error("Only funded or fulfilled orders can enter marketplace review");
  }
  const dispute: Dispute = {
    id: id("dsp"),
    orderId: order.id,
    status: "open",
    reason: reason || "Order needs review.",
    events: [
      disputeEvent("buyer", "Marketplace review opened", reason || "Order needs review."),
    ],
    createdAt: new Date().toISOString(),
  };
  return runInTransaction(() => {
    saveDispute(dispute);
    saveInvoice({ ...invoice, escrowState: "disputed" });
    saveOrder(
      transitionOrder(
        order,
        "disputed",
        "Dispute opened",
        dispute.reason
      )
    );
    audit(order.id, "dispute.opened", dispute.reason);
    return readSnapshot();
  });
}

export function respondToDispute(
  orderIdValue: string,
  response: string
): MarketplaceSnapshot {
  const order = getOrder(orderIdValue);
  if (!order) throw new Error("Order was not found");
  const dispute = listDisputes().find((entry) => entry.orderId === orderIdValue);
  if (!dispute) throw new Error("Dispute was not found");
  if (dispute.status !== "open") {
    throw new Error("Seller can only respond to an open marketplace review");
  }
  const detail = response || "Seller acknowledged the review.";
  return runInTransaction(() => {
    saveDispute({
      ...dispute,
      status: "seller_responded",
      sellerResponse: detail,
      events: [disputeEvent("seller", "Seller responded", detail), ...dispute.events],
    });
    saveOrder(transitionOrder(order, "disputed", "Seller responded", detail));
    audit(order.id, "dispute.seller_responded", detail);
    return readSnapshot();
  });
}

export async function resolveDispute(
  orderIdValue: string,
  resolution: "refund" | "release"
): Promise<MarketplaceSnapshot> {
  const order = getOrder(orderIdValue);
  const invoice = getInvoiceByOrderId(orderIdValue);
  if (!order || !invoice) throw new Error("Order was not found");
  const dispute = listDisputes().find((entry) => entry.orderId === orderIdValue);
  if (!dispute) throw new Error("Dispute was not found");
  if (!["open", "seller_responded"].includes(dispute.status)) {
    throw new Error("Marketplace review is already resolved");
  }
  const provider = getPaymentProvider();
  const settlement =
    invoice.rail === "dero_escrow"
      ? await provider.settleEscrow(invoice, resolution === "refund" ? "refund" : "release")
      : { invoice, settlementId: "non-escrow" };
  const now = new Date().toISOString();
  const status = resolution === "refund" ? "resolved_refund" : "resolved_release";
  const orderStatus = resolution === "refund" ? "refunded" : "released";
  const escrowState = resolution === "refund" ? "refunded" : "released";
  const label = resolution === "refund" ? "Refund approved" : "Release approved";
  const detail =
    resolution === "refund"
      ? "Marketplace review resolved with refund."
      : "Marketplace review resolved with escrow release.";
  return runInTransaction(() => {
    saveDispute({
      ...dispute,
      status,
      resolvedAt: now,
      events: [disputeEvent("system", label, detail), ...dispute.events],
    });
    saveInvoice({ ...settlement.invoice, escrowState });
    saveOrder(
      transitionOrder(
        order,
        orderStatus,
        label,
        `${detail} Settlement ${settlement.settlementId}.`
      )
    );
    audit(order.id, `dispute.${status}`, detail);
    return readSnapshot();
  });
}

export function createDevWebhookForOrder(
  orderIdValue: string,
  type: DeroPayWebhookEvent["type"]
): DeroPayWebhookEvent {
  const invoice = getInvoiceByOrderId(orderIdValue);
  if (!invoice) throw new Error("Invoice was not found");
  return {
    id: id("wh"),
    type,
    invoiceId: invoice.invoiceId,
    createdAt: new Date().toISOString(),
    signature: "dev-local",
    payload: {
      orderId: invoice.orderId,
      rail: invoice.rail,
      status: invoice.status,
      amountAtomic: invoice.amountAtomic,
      amountReceivedAtomic: invoice.amountReceivedAtomic,
      paymentId: invoice.paymentId,
      providerEventId: id("dev_evt"),
      txId: id("dev_tx"),
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

export function appendOrderEvent(
  order: Order,
  label: string,
  detail: string
): Order {
  return {
    ...order,
    updatedAt: new Date().toISOString(),
    events: [orderEvent(label, detail), ...order.events],
  };
}
