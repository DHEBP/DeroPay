export type ListingKind = "physical" | "digital" | "bundle";

export type ListingStatus = "active" | "low_stock" | "sold_out";

export type SellerTier = "new" | "verified" | "power";

export type Seller = {
  id: string;
  slug: string;
  name: string;
  location: string;
  tier: SellerTier;
  rating: number;
  reviewCount: number;
  sales: number;
  responseTime: string;
  joined: string;
  bio: string;
  policies: string[];
};

export type Listing = {
  id: string;
  slug: string;
  sellerId: string;
  title: string;
  subtitle: string;
  category: string;
  kind: ListingKind;
  status: ListingStatus;
  priceAtomic: string;
  priceDero: number;
  fiatEstimate: number;
  stock: number;
  sold: number;
  rating: number;
  reviewCount: number;
  shipsFrom: string;
  delivery: string;
  imageUrl: string;
  imageAlt: string;
  tags: string[];
  protection: string[];
  specs: Record<string, string>;
  description: string;
  featured?: boolean;
};

export type CartItem = {
  listingId: string;
  quantity: number;
};

export type CartLine = {
  listing: Listing;
  quantity: number;
  lineAtomic: bigint;
};

export type CartSummary = {
  lines: CartLine[];
  subtotalAtomic: bigint;
  networkFeeAtomic: bigint;
  buyerProtectionAtomic: bigint;
  totalAtomic: bigint;
  totalDero: number;
  totalFiatEstimate: number;
};

export type PaymentRail = "dero_invoice" | "dero_router" | "dero_escrow";

export type DeroPayInvoiceStatus =
  | "created"
  | "pending"
  | "confirming"
  | "completed"
  | "partial"
  | "expired";

export type PaymentStatus = DeroPayInvoiceStatus;

export type DeroPayPaymentStatus = "detected" | "confirming" | "confirmed";

export type DeroPayWebhookType =
  | "invoice.created"
  | "payment.detected"
  | "payment.confirming"
  | "payment.completed"
  | "payment.partial"
  | "invoice.expired"
  | "escrow.fulfilled"
  | "escrow.released"
  | "escrow.disputed";

export type EscrowState =
  | "not_locked"
  | "locked"
  | "seller_fulfilled"
  | "buyer_confirmed"
  | "released"
  | "disputed"
  | "refunded";

export type OrderStatus =
  | "awaiting_payment"
  | "payment_detected"
  | "confirming"
  | "funded"
  | "partial_payment"
  | "processing"
  | "shipped"
  | "delivered"
  | "disputed"
  | "released"
  | "expired"
  | "refunded";

export type OrderEvent = {
  id: string;
  at: string;
  label: string;
  detail: string;
};

export type CheckoutDetails = {
  buyerAlias: string;
  contactHandle: string;
  deliveryType: "physical" | "digital" | "service";
  deliveryDestination: string;
  orderNote: string;
};

export type DeroPayPayment = {
  txId: string;
  amountAtomic: string;
  confirmations: number;
  status: DeroPayPaymentStatus;
  detectedAt: string;
  destinationPort: number;
  providerEventId?: string;
  destinationAddress?: string;
  rawStatus?: string;
};

export type DeroPayWebhookEvent = {
  id: string;
  type: DeroPayWebhookType;
  invoiceId: string;
  createdAt: string;
  signature: string;
  payload: {
    orderId: string;
    rail: PaymentRail;
    status: DeroPayInvoiceStatus;
    amountAtomic: string;
    amountReceivedAtomic: string;
    paymentId: string;
    providerEventId?: string;
    txId?: string;
    confirmations?: number;
    destinationAddress?: string;
    rawStatus?: string;
  };
};

export type PaymentIntent = {
  id: string;
  orderId: string;
  rail: PaymentRail;
  status: PaymentStatus;
  invoiceId: string;
  baseAddress: string;
  integratedAddress: string;
  paymentId: string;
  amountAtomic: string;
  amountDero: number;
  amountReceivedAtomic: string;
  expiresAt: string;
  requiredConfirmations: number;
  payments: DeroPayPayment[];
  webhookEventIds: string[];
  escrowState: EscrowState;
  settlementId?: string;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: string;
  buyerAlias: string;
  checkoutDetails: CheckoutDetails;
  sellerIds: string[];
  items: CartItem[];
  status: OrderStatus;
  paymentRail: PaymentRail;
  paymentIntentId: string;
  totalAtomic: string;
  createdAt: string;
  updatedAt: string;
  events: OrderEvent[];
};

export type Review = {
  id: string;
  listingId: string;
  sellerId: string;
  buyerAlias: string;
  rating: number;
  text: string;
  createdAt: string;
};

export type Dispute = {
  id: string;
  orderId: string;
  status: "open" | "seller_responded" | "resolved_refund" | "resolved_release";
  reason: string;
  sellerResponse?: string;
  resolvedAt?: string;
  events: DisputeEvent[];
  createdAt: string;
};

export type DisputeEvent = {
  id: string;
  at: string;
  actor: "buyer" | "seller" | "system";
  label: string;
  detail: string;
};

export type FulfillmentEvidence = {
  id: string;
  orderId: string;
  kind: "seller_note" | "tracking" | "digital_delivery";
  summary: string;
  createdAt: string;
};

export type MarketplaceAuditEvent = {
  id: string;
  orderId: string;
  at: string;
  actor: "buyer" | "seller" | "system" | "deropay";
  action: string;
  detail: string;
};

export type MarketplaceSnapshot = {
  serverListings: Listing[];
  orders: Order[];
  paymentIntents: PaymentIntent[];
  webhookEvents: DeroPayWebhookEvent[];
  disputes: Dispute[];
  fulfillmentEvidence: FulfillmentEvidence[];
  auditEvents: MarketplaceAuditEvent[];
};
