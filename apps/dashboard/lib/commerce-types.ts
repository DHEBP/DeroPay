/**
 * Commerce types for the dashboard mock data pages.
 * These types are used by the commerce pages (Products, Orders, Inventory, etc.)
 * and are defined locally until the dero-pay SDK provides them.
 *
 * Note: These types use optional fields extensively to accommodate the demo/mock
 * data fixtures which may not provide all fields.
 */

export type CustomerProfile = {
  id: string;
  customerId?: string | null;
  email: string | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
  invoiceCount?: number;
  totalPaidAtomic?: string;
  lastPaymentAt?: number | null;
  tags?: string[];
  notes?: string | null;
};

export type CustomerGroup = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  createdAt: number;
  metadata: Record<string, unknown>;
  memberCount?: number;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceAtomic: string;
  currency: ProductCurrency;
  imageUrl: string | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
};

export type ProductVariant = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  priceAtomic: string;
  currency: ProductCurrency;
  inventory: number | null;
  options: Record<string, string>;
  metadata: Record<string, unknown>;
};

export type ProductCurrency = "DERO" | "USD";

export type Subscription = {
  id: string;
  customerId?: string;
  customerIdentifier?: string;
  productId: string;
  variantId?: string;
  status: SubscriptionStatus;
  cadence: SubscriptionCadence;
  amountAtomic?: string;
  currency?: ProductCurrency;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  nextInvoiceAt?: number;
  totalInvoices?: number;
  canceledAt?: number | null;
  cancelledAt?: number | null;
  pausedAt?: number | null;
  processingAt?: number | null;
  createdAt: number;
  metadata?: Record<string, unknown>;
};

export type SubscriptionStatus = "active" | "paused" | "canceled" | "cancelled" | "past_due" | "trialing" | "ended";

export type SubscriptionCadence = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "annual";

export type SubscriptionInvoice = {
  id: string;
  subscriptionId: string;
  invoiceId: string;
  periodStart?: number;
  periodEnd?: number;
  cycleIndex?: number;
  status?: "pending" | "paid" | "failed";
  createdAt: number;
};

export type AutoSweepRule = {
  id: string;
  name?: string;
  label?: string;
  toWallet?: string;
  destinationAddress?: string;
  frequency?: "daily" | "weekly";
  timeUtc?: string;
  dailyLimit?: string | null;
  minBalanceReserve?: string;
  thresholdAtomic?: string;
  reserveAtomic?: string;
  cadenceSeconds?: number;
  enabled: boolean;
  lastRunAt?: number | null;
  lastEvaluatedAt?: number | null;
  lastSweptAt?: number | null;
  lastSweptAtomic?: string | null;
  lastPayoutId?: string | null;
  processingAt?: number | null;
  createdAt: number;
};

export type Dispute = {
  id: string;
  customerId?: string;
  invoiceId: string;
  orderId?: string | null;
  reason: string;
  status: DisputeStatus;
  amountAtomic?: string;
  evidence?: string | null;
  resolution?: string | null;
  notes?: string | null;
  createdAt: number;
  updatedAt?: number;
  resolvedAt: number | null;
  refundPayoutId?: string | null;
};

export type DisputeStatus = 
  | "open"
  | "under_review"
  | "resolved"
  | "resolved_merchant_favor"
  | "resolved_customer_favor"
  | "withdrawn"
  | "lost"
  | "refunded";

export type PaymentLink = {
  id: string;
  slug: string;
  productId?: string | null;
  name: string;
  description?: string | null;
  amountAtomic?: string | null;
  currency?: ProductCurrency | null;
  ttlSeconds: number;
  usedCount?: number;
  usesCount: number;
  usageLimit?: number | null;
  maxUses?: number | null;
  expiresAt?: number | null;
  redirectUrl?: string | null;
  revokedAt?: number | null;
  createdAt: number;
  archivedAt?: number | null;
  metadata?: Record<string, unknown>;
};
