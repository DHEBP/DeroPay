import { ensureOrderCheckoutDetailsColumn, getDb } from "./db";
import type {
  CartItem,
  DeroPayPayment,
  DeroPayWebhookEvent,
  CheckoutDetails,
  Dispute,
  FulfillmentEvidence,
  Listing,
  MarketplaceAuditEvent,
  MarketplaceSnapshot,
  Order,
  OrderEvent,
  PaymentIntent,
} from "@/lib/types";

type OrderRow = {
  id: string;
  buyer_alias: string;
  checkout_details_json: string;
  seller_ids_json: string;
  items_json: string;
  status: Order["status"];
  payment_rail: Order["paymentRail"];
  payment_intent_id: string;
  total_atomic: string;
  created_at: string;
  updated_at: string;
  events_json: string;
};

type InvoiceRow = {
  id: string;
  order_id: string;
  rail: PaymentIntent["rail"];
  status: PaymentIntent["status"];
  invoice_id: string;
  base_address: string;
  integrated_address: string;
  payment_id: string;
  amount_atomic: string;
  amount_dero: number;
  amount_received_atomic: string;
  expires_at: string;
  required_confirmations: number;
  payments_json: string;
  webhook_event_ids_json: string;
  escrow_state: PaymentIntent["escrowState"];
  settlement_id: string | null;
  created_at: string;
  updated_at: string;
};

type WebhookRow = {
  id: string;
  type: DeroPayWebhookEvent["type"];
  invoice_id: string;
  created_at: string;
  signature: string;
  provider_event_id: string | null;
  payment_tx_id: string | null;
  payload_json: string;
};

type DisputeRow = {
  id: string;
  order_id: string;
  status: Dispute["status"];
  reason: string;
  seller_response: string | null;
  resolved_at: string | null;
  events_json: string;
  created_at: string;
};

type FulfillmentRow = {
  id: string;
  order_id: string;
  kind: FulfillmentEvidence["kind"];
  summary: string;
  created_at: string;
};

type AuditRow = {
  id: string;
  order_id: string;
  at: string;
  actor: MarketplaceAuditEvent["actor"];
  action: string;
  detail: string;
};

type ListingRow = {
  id: string;
  listing_json: string;
  stock?: number;
  sold?: number;
  status?: Listing["status"];
};

type ReservationRow = {
  id: string;
  order_id: string;
  listing_id: string;
  quantity: number;
  state: "reserved" | "released" | "captured";
  created_at: string;
  updated_at: string;
};

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function toOrder(row: OrderRow): Order {
  const checkoutDetails = parseJson<Partial<CheckoutDetails>>(
    row.checkout_details_json ?? "{}"
  );
  return {
    id: row.id,
    buyerAlias: row.buyer_alias,
    checkoutDetails: {
      buyerAlias: checkoutDetails.buyerAlias ?? row.buyer_alias,
      contactHandle: checkoutDetails.contactHandle ?? "demo-buyer",
      deliveryType: checkoutDetails.deliveryType ?? "physical",
      deliveryDestination:
        checkoutDetails.deliveryDestination ?? "Demo delivery destination",
      orderNote: checkoutDetails.orderNote ?? "",
    },
    sellerIds: parseJson<string[]>(row.seller_ids_json),
    items: parseJson<CartItem[]>(row.items_json),
    status: row.status,
    paymentRail: row.payment_rail,
    paymentIntentId: row.payment_intent_id,
    totalAtomic: row.total_atomic,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: parseJson<OrderEvent[]>(row.events_json),
  };
}

function toInvoice(row: InvoiceRow): PaymentIntent {
  return {
    id: row.id,
    orderId: row.order_id,
    rail: row.rail,
    status: row.status,
    invoiceId: row.invoice_id,
    baseAddress: row.base_address,
    integratedAddress: row.integrated_address,
    paymentId: row.payment_id,
    amountAtomic: row.amount_atomic,
    amountDero: row.amount_dero,
    amountReceivedAtomic: row.amount_received_atomic,
    expiresAt: row.expires_at,
    requiredConfirmations: row.required_confirmations,
    payments: parseJson<DeroPayPayment[]>(row.payments_json),
    webhookEventIds: parseJson<string[]>(row.webhook_event_ids_json),
    escrowState: row.escrow_state,
    settlementId: row.settlement_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWebhook(row: WebhookRow): DeroPayWebhookEvent {
  return {
    id: row.id,
    type: row.type,
    invoiceId: row.invoice_id,
    createdAt: row.created_at,
    signature: row.signature,
    payload: parseJson<DeroPayWebhookEvent["payload"]>(row.payload_json),
  };
}

function toDispute(row: DisputeRow): Dispute {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    reason: row.reason,
    sellerResponse: row.seller_response ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    events: parseJson(row.events_json ?? "[]"),
    createdAt: row.created_at,
  };
}

function toListing(row: ListingRow): Listing {
  return parseJson<Listing>(row.listing_json);
}

function listingStatus(stock: number): Listing["status"] {
  if (stock <= 0) return "sold_out";
  if (stock <= 5) return "low_stock";
  return "active";
}

function reservationId(orderId: string, listingId: string): string {
  return `res_${orderId}_${listingId}`;
}

function webhookEventKey(event: DeroPayWebhookEvent): string {
  if (event.payload.providerEventId) return `provider:${event.payload.providerEventId}`;
  if (event.payload.txId) {
    return [
      "tx",
      event.invoiceId,
      event.payload.txId,
      event.type,
      event.payload.amountReceivedAtomic,
    ].join(":");
  }
  return `event:${event.id}`;
}

function toFulfillment(row: FulfillmentRow): FulfillmentEvidence {
  return {
    id: row.id,
    orderId: row.order_id,
    kind: row.kind,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

function toAudit(row: AuditRow): MarketplaceAuditEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    detail: row.detail,
  };
}

export function saveOrder(order: Order): void {
  ensureOrderCheckoutDetailsColumn();
  getDb()
    .prepare(
      `
      INSERT INTO orders (
        id, buyer_alias, checkout_details_json, seller_ids_json, items_json, status, payment_rail,
        payment_intent_id, total_atomic, created_at, updated_at, events_json
      )
      VALUES (
        @id, @buyerAlias, @checkoutDetailsJson, @sellerIdsJson, @itemsJson, @status, @paymentRail,
        @paymentIntentId, @totalAtomic, @createdAt, @updatedAt, @eventsJson
      )
      ON CONFLICT(id) DO UPDATE SET
        buyer_alias = excluded.buyer_alias,
        checkout_details_json = excluded.checkout_details_json,
        seller_ids_json = excluded.seller_ids_json,
        items_json = excluded.items_json,
        status = excluded.status,
        payment_rail = excluded.payment_rail,
        payment_intent_id = excluded.payment_intent_id,
        total_atomic = excluded.total_atomic,
        updated_at = excluded.updated_at,
        events_json = excluded.events_json
    `
    )
    .run({
      ...order,
      checkoutDetailsJson: JSON.stringify(order.checkoutDetails),
      sellerIdsJson: JSON.stringify(order.sellerIds),
      itemsJson: JSON.stringify(order.items),
      eventsJson: JSON.stringify(order.events),
    });
}

export function saveInvoice(invoice: PaymentIntent): void {
  getDb()
    .prepare(
      `
      INSERT INTO invoices (
        id, order_id, rail, status, invoice_id, base_address, integrated_address,
        payment_id, amount_atomic, amount_dero, amount_received_atomic, expires_at,
        required_confirmations, payments_json, webhook_event_ids_json, escrow_state,
        settlement_id, created_at, updated_at
      )
      VALUES (
        @id, @orderId, @rail, @status, @invoiceId, @baseAddress, @integratedAddress,
        @paymentId, @amountAtomic, @amountDero, @amountReceivedAtomic, @expiresAt,
        @requiredConfirmations, @paymentsJson, @webhookEventIdsJson, @escrowState,
        @settlementId, @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        rail = excluded.rail,
        status = excluded.status,
        invoice_id = excluded.invoice_id,
        base_address = excluded.base_address,
        integrated_address = excluded.integrated_address,
        payment_id = excluded.payment_id,
        amount_atomic = excluded.amount_atomic,
        amount_dero = excluded.amount_dero,
        amount_received_atomic = excluded.amount_received_atomic,
        expires_at = excluded.expires_at,
        required_confirmations = excluded.required_confirmations,
        payments_json = excluded.payments_json,
        webhook_event_ids_json = excluded.webhook_event_ids_json,
        escrow_state = excluded.escrow_state,
        settlement_id = excluded.settlement_id,
        updated_at = excluded.updated_at
    `
    )
    .run({
      ...invoice,
      paymentsJson: JSON.stringify(invoice.payments),
      webhookEventIdsJson: JSON.stringify(invoice.webhookEventIds),
      settlementId: invoice.settlementId ?? null,
    });
}

export function insertWebhookEvent(event: DeroPayWebhookEvent): boolean {
  const result = getDb()
    .prepare(
      `
      INSERT OR IGNORE INTO webhook_events (
        id, type, invoice_id, created_at, signature, provider_event_id, payment_tx_id,
        event_key, payload_json
      )
      VALUES (
        @id, @type, @invoiceId, @createdAt, @signature, @providerEventId,
        @paymentTxId, @eventKey, @payloadJson
      )
    `
    )
    .run({
      ...event,
      providerEventId: event.payload.providerEventId ?? null,
      paymentTxId: event.payload.txId ?? null,
      eventKey: webhookEventKey(event),
      payloadJson: JSON.stringify(event.payload),
    });
  return result.changes > 0;
}

export function saveDispute(dispute: Dispute): void {
  getDb()
    .prepare(
      `
      INSERT INTO disputes (
        id, order_id, status, reason, seller_response, resolved_at, events_json, created_at
      )
      VALUES (
        @id, @orderId, @status, @reason, @sellerResponse, @resolvedAt, @eventsJson, @createdAt
      )
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        reason = excluded.reason,
        seller_response = excluded.seller_response,
        resolved_at = excluded.resolved_at,
        events_json = excluded.events_json
    `
    )
    .run({
      ...dispute,
      sellerResponse: dispute.sellerResponse ?? null,
      resolvedAt: dispute.resolvedAt ?? null,
      eventsJson: JSON.stringify(dispute.events),
    });
}

export function saveFulfillmentEvidence(evidence: FulfillmentEvidence): void {
  getDb()
    .prepare(
      `
      INSERT INTO fulfillment_evidence (id, order_id, kind, summary, created_at)
      VALUES (@id, @orderId, @kind, @summary, @createdAt)
    `
    )
    .run(evidence);
}

export function saveAuditEvent(event: MarketplaceAuditEvent): void {
  getDb()
    .prepare(
      `
      INSERT INTO audit_events (id, order_id, at, actor, action, detail)
      VALUES (@id, @orderId, @at, @actor, @action, @detail)
    `
    )
    .run(event);
}

export function saveListing(listing: Listing): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      INSERT INTO listings (
        id, seller_id, slug, listing_json, price_atomic, stock, sold, status,
        created_at, updated_at
      )
      VALUES (
        @id, @sellerId, @slug, @listingJson, @priceAtomic, @stock, @sold, @status,
        @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        seller_id = excluded.seller_id,
        slug = excluded.slug,
        listing_json = excluded.listing_json,
        price_atomic = excluded.price_atomic,
        stock = excluded.stock,
        sold = excluded.sold,
        status = excluded.status,
        updated_at = excluded.updated_at
    `
    )
    .run({
      id: listing.id,
      sellerId: listing.sellerId,
      slug: listing.slug,
      listingJson: JSON.stringify(listing),
      priceAtomic: listing.priceAtomic,
      stock: listing.stock,
      sold: listing.sold,
      status: listing.status,
      createdAt: now,
      updatedAt: now,
    });
}

export function reserveInventoryForOrder(orderId: string, items: CartItem[]): void {
  const now = new Date().toISOString();
  for (const item of items) {
    const row = getDb()
      .prepare("SELECT id, listing_json, stock, sold, status FROM listings WHERE id = ?")
      .get(item.listingId) as ListingRow | undefined;
    if (!row) continue;

    const result = getDb()
      .prepare("UPDATE listings SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ?")
      .run(item.quantity, now, item.listingId, item.quantity);
    if (result.changes === 0) {
      const listing = toListing(row);
      throw new Error(`${listing.title} only has ${row.stock ?? listing.stock} available`);
    }

    const listing = toListing(row);
    const nextStock = Math.max(0, listing.stock - item.quantity);
    saveListing({
      ...listing,
      stock: nextStock,
      status: listingStatus(nextStock),
    });

    getDb()
      .prepare(
        `
        INSERT INTO inventory_reservations (
          id, order_id, listing_id, quantity, state, created_at, updated_at
        )
        VALUES (@id, @orderId, @listingId, @quantity, 'reserved', @createdAt, @updatedAt)
      `
      )
      .run({
        id: reservationId(orderId, item.listingId),
        orderId,
        listingId: item.listingId,
        quantity: item.quantity,
        createdAt: now,
        updatedAt: now,
      });
  }
}

export function releaseReservedInventory(orderId: string): void {
  const now = new Date().toISOString();
  const rows = getDb()
    .prepare("SELECT * FROM inventory_reservations WHERE order_id = ? AND state = 'reserved'")
    .all(orderId) as ReservationRow[];
  for (const row of rows) {
    const listing = getServerListing(row.listing_id);
    if (listing) {
      const nextStock = listing.stock + row.quantity;
      saveListing({
        ...listing,
        stock: nextStock,
        status: listingStatus(nextStock),
      });
    }
    getDb()
      .prepare("UPDATE inventory_reservations SET state = 'released', updated_at = ? WHERE id = ?")
      .run(now, row.id);
  }
}

export function captureReservedInventory(orderId: string): void {
  const now = new Date().toISOString();
  const rows = getDb()
    .prepare("SELECT * FROM inventory_reservations WHERE order_id = ? AND state = 'reserved'")
    .all(orderId) as ReservationRow[];
  for (const row of rows) {
    const listing = getServerListing(row.listing_id);
    if (listing) {
      saveListing({
        ...listing,
        sold: listing.sold + row.quantity,
      });
    }
    getDb()
      .prepare("UPDATE inventory_reservations SET state = 'captured', updated_at = ? WHERE id = ?")
      .run(now, row.id);
  }
}

export function listOrders(): Order[] {
  return getDb()
    .prepare("SELECT * FROM orders ORDER BY created_at DESC")
    .all()
    .map((row) => toOrder(row as OrderRow));
}

export function listInvoices(): PaymentIntent[] {
  return getDb()
    .prepare("SELECT * FROM invoices ORDER BY created_at DESC")
    .all()
    .map((row) => toInvoice(row as InvoiceRow));
}

export function listWebhookEvents(): DeroPayWebhookEvent[] {
  return getDb()
    .prepare("SELECT * FROM webhook_events ORDER BY created_at DESC")
    .all()
    .map((row) => toWebhook(row as WebhookRow));
}

export function listDisputes(): Dispute[] {
  return getDb()
    .prepare("SELECT * FROM disputes ORDER BY created_at DESC")
    .all()
    .map((row) => toDispute(row as DisputeRow));
}

export function listFulfillmentEvidence(): FulfillmentEvidence[] {
  return getDb()
    .prepare("SELECT * FROM fulfillment_evidence ORDER BY created_at DESC")
    .all()
    .map((row) => toFulfillment(row as FulfillmentRow));
}

export function listServerListings(): Listing[] {
  return getDb()
    .prepare("SELECT id, listing_json FROM listings ORDER BY created_at DESC")
    .all()
    .map((row) => toListing(row as ListingRow));
}

export function getServerListing(listingId: string): Listing | null {
  const row = getDb()
    .prepare("SELECT id, listing_json FROM listings WHERE id = ?")
    .get(listingId) as ListingRow | undefined;
  return row ? toListing(row) : null;
}

export function listAuditEvents(orderId?: string): MarketplaceAuditEvent[] {
  const query = orderId
    ? getDb().prepare("SELECT * FROM audit_events WHERE order_id = ? ORDER BY at DESC")
    : getDb().prepare("SELECT * FROM audit_events ORDER BY at DESC");
  return (orderId ? query.all(orderId) : query.all()).map((row) =>
    toAudit(row as AuditRow)
  );
}

export function getOrder(orderId: string): Order | null {
  const row = getDb()
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(orderId) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

export function getInvoiceByOrderId(orderId: string): PaymentIntent | null {
  const row = getDb()
    .prepare("SELECT * FROM invoices WHERE order_id = ?")
    .get(orderId) as InvoiceRow | undefined;
  return row ? toInvoice(row) : null;
}

export function getInvoiceByInvoiceId(invoiceId: string): PaymentIntent | null {
  const row = getDb()
    .prepare("SELECT * FROM invoices WHERE invoice_id = ?")
    .get(invoiceId) as InvoiceRow | undefined;
  return row ? toInvoice(row) : null;
}

export function hasOpenDispute(orderId: string): boolean {
  const row = getDb()
    .prepare("SELECT id FROM disputes WHERE order_id = ? AND status IN ('open', 'seller_responded') LIMIT 1")
    .get(orderId);
  return Boolean(row);
}

export function readSnapshot(): MarketplaceSnapshot {
  return {
    serverListings: listServerListings(),
    orders: listOrders(),
    paymentIntents: listInvoices(),
    webhookEvents: listWebhookEvents(),
    disputes: listDisputes(),
    fulfillmentEvidence: listFulfillmentEvidence(),
    auditEvents: listAuditEvents(),
  };
}
