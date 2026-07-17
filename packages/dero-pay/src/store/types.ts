/**
 * Pluggable storage interface for DeroPay.
 *
 * Implement this interface to use your own storage backend.
 * In-memory and SQLite implementations are provided.
 */

import type { Invoice, InvoiceStatus, Payment } from "../core/types.js";
import type {
  OutboxEvent,
  OutboxRecord,
  OutboxStatus,
} from "../webhook/outbox-types.js";
import type { EscrowClaimGuard } from "../escrow/manager.js";

/** Filter options for querying invoices */
export type InvoiceFilter = {
  /** Filter by status */
  status?: InvoiceStatus | InvoiceStatus[];
  /** Filter invoices created after this date */
  createdAfter?: Date;
  /** Filter invoices created before this date */
  createdBefore?: Date;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
};

/**
 * O10 — optional compare-and-set precondition for {@link InvoiceStore.updateInvoice}.
 * When present the escrow write applies atomically ONLY if the row's current
 * escrow blob still matches these fields, guarding the arbiter blob against a
 * concurrent whole-blob lost update.
 */
export type UpdateInvoiceOpts = {
  expectedEscrow?: {
    /** The escrowId the caller read before mutating. `null` matches an absent escrow. */
    escrowId: string | null;
    /** The escrowStatus the caller read before mutating. */
    escrowStatus: string;
  };
};

/** Invoice store summary stats */
export type InvoiceStats = {
  total: number;
  created: number;
  pending: number;
  confirming: number;
  completed: number;
  expired: number;
  partial: number;
  misrouted_to_base: number;
  escrow_funded: number;
  /** O19 — dispute in flight (escrow funded, awaiting arbitration). */
  disputed: number;
  /** O19 — buyer refunded (chargeback-equivalent); distinct from expired. */
  refunded: number;
  totalAmountReceived: bigint;
};

export type X402UsageReservation = {
  resource: string;
  windowKey: string;
  windowStart: string;
  windowEnd: string;
  amountAtomic: bigint;
  maxReceipts?: number;
  maxAmountAtomic?: bigint;
};

export type X402UsageReservationResult = {
  allowed: boolean;
  receiptCount: number;
  totalAmountAtomic: bigint;
};

export type X402UsageBatchReservationResult = {
  allowed: boolean;
  results: X402UsageReservationResult[];
};

/** Public shareable link that creates invoices on demand. */
export type PaymentLink = {
  id: string;
  slug: string;
  productId?: string | null;
  name: string;
  description?: string | null;
  amountAtomic?: string | null;
  currency?: "DERO" | null;
  ttlSeconds: number;
  usedCount?: number;
  usesCount: number;
  usageLimit?: number | null;
  maxUses?: number | null;
  invoiceTemplateId?: string | null;
  expiresAt?: number | null;
  redirectUrl?: string | null;
  revokedAt?: number | null;
  createdAt: number;
  archivedAt?: number | null;
  metadata?: Record<string, unknown>;
};

export type PaymentLinkStats = {
  linkId: string;
  views: number;
  invoiceStarts: number;
  paidInvoices: number;
  conversionRate: number;
};

export type CreatePaymentLinkArgs = {
  slug?: string;
  name: string;
  description?: string;
  productId?: string;
  amountAtomic?: bigint;
  currency?: "DERO";
  ttlSeconds?: number;
  usageLimit?: number;
  maxUses?: number;
  invoiceTemplateId?: string;
  expiresAt?: number;
  redirectUrl?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Storage interface for invoices and payments.
 *
 * All methods that write data should be atomic where possible.
 */
export type InvoiceStore = {
  /**
   * Save a new invoice.
   */
  createInvoice(invoice: Invoice): Promise<void>;

  /**
   * Get an invoice by its ID.
   * @returns The invoice or null if not found
   */
  getInvoice(id: string): Promise<Invoice | null>;

  /**
   * Get an invoice by its payment ID.
   * @returns The invoice or null if not found
   */
  getInvoiceByPaymentId(paymentId: bigint): Promise<Invoice | null>;

  /**
   * O20 — get the invoice whose escrow binding currently references `escrowId`.
   *
   * The crash reconciler heals a BOUNDED set of held guard rows; it must map each
   * row's escrowId to its invoice WITHOUT a full-table `listInvoices()` scan. The
   * scan is both an unbounded startup cost (O(N) rows + N payment round-trips) and
   * a correctness landmine: if a default page limit is ever introduced, a held
   * row whose invoice falls off the page is misclassified as an ORPHAN and freed,
   * re-opening a double-deploy. A direct per-escrowId lookup removes that
   * dependency entirely — the reconciler's completeness rests only on the bounded
   * escrow_claims table. Optional so third-party stores need not implement it; the
   * reconciler falls back to a scan only when this is absent.
   */
  getInvoiceByEscrowId?(escrowId: string): Promise<Invoice | null>;

  /**
   * O20 — get the invoice whose escrow binding currently references `scid`. Same
   * motivation as getInvoiceByEscrowId: the escrow lifecycle handlers
   * (requoteCancelledEscrow, handleEscrowFundingMismatch) fire per on-chain event
   * and previously did a full-table scan + `.find()` per event. A targeted lookup
   * removes that O(N)-per-event cost. Optional; callers fall back to a scan.
   */
  getInvoiceByScid?(scid: string): Promise<Invoice | null>;

  /**
   * Update an invoice's status and related fields.
   *
   * O10 — the escrow blob is a whole-column read-modify-write, so two concurrent
   * writers (claim-success vs a lifecycle/requote handler) can clobber each
   * other's escrow transition. For writes where the invoice blob is the ARBITER
   * of the claim outcome, pass `opts.expectedEscrow` to make the escrow write a
   * compare-and-set: the store applies it atomically ONLY if the row's current
   * escrow blob still matches the expected `escrowId`/`escrowStatus`, and returns
   * `false` on a precondition miss so the caller can abort/re-read instead of
   * silently winning a lost-update race. Without `opts` the call is an
   * unconditional write (backward compatible; return value is `true`).
   */
  updateInvoice(
    id: string,
    updates: Partial<
      Pick<
        Invoice,
        "status" | "amountReceived" | "completedAt" | "payments" | "escrow" | "metadata"
      >
    >,
    opts?: UpdateInvoiceOpts
  ): Promise<boolean>;

  /**
   * Add a payment to an invoice.
   */
  addPayment(invoiceId: string, payment: Payment): Promise<void>;

  /**
   * Update a payment's confirmation count and status.
   */
  updatePayment(
    invoiceId: string,
    txid: string,
    updates: Partial<Pick<Payment, "confirmations" | "status">>
  ): Promise<void>;

  /**
   * List invoices with optional filters.
   */
  listInvoices(filter?: InvoiceFilter): Promise<Invoice[]>;

  /**
   * Get all active (non-terminal) invoices.
   * Returns invoices in created, pending, confirming, or partial states.
   */
  getActiveInvoices(): Promise<Invoice[]>;

  /**
   * Get summary statistics.
   */
  getStats(): Promise<InvoiceStats>;

  /**
   * Mark a receipt JTI as used for replay protection.
   * Returns true when this is the first use, false when already used.
   *
   * Implementations should expire entries at or after `expiresAt`.
   */
  markReceiptJtiUsed?(jti: string, expiresAt: string): Promise<boolean>;

  /**
   * Atomically check and reserve x402 route usage against a quota window.
   * Returns the resulting counters whether or not the reservation was allowed.
   */
  reserveX402Usage?(
    reservation: X402UsageReservation
  ): Promise<X402UsageReservationResult>;

  /**
   * Atomically check and reserve multiple x402 quota windows together.
   */
  reserveX402UsageBatch?(
    reservations: X402UsageReservation[]
  ): Promise<X402UsageBatchReservationResult>;

  createPaymentLink?(args: CreatePaymentLinkArgs): PaymentLink;
  listPaymentLinks?(filter?: {
    includeArchived?: boolean;
    includeRevoked?: boolean;
    limit?: number;
  }): PaymentLink[];
  getPaymentLink?(id: string): PaymentLink | null;
  getPaymentLinkBySlug?(slug: string): PaymentLink | null;
  updatePaymentLink?(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      amountAtomic?: bigint | null;
      usageLimit?: number | null;
      expiresAt?: number | null;
      redirectUrl?: string | null;
      metadata?: Record<string, unknown>;
      invoiceTemplateId?: string | null;
    }
  ): PaymentLink;
  revokePaymentLink?(id: string): PaymentLink;
  incrementPaymentLinkUses?(id: string): PaymentLink;
  recordPaymentLinkView?(idOrSlug: string): PaymentLinkStats | null;
  getPaymentLinkStats?(id: string): PaymentLinkStats;

  // --- Webhook outbox (durable at-least-once delivery; optional capability) ---
  // A store that implements these supports the DeroPay Bridge. The combined
  // apply*WithOutbox methods are the SOLE writer of amount_received on the
  // bridge path and commit the invoice mutation + outbox row in one tx.
  applyPaymentWithOutbox?(
    invoiceId: string,
    payment: Payment,
    buildEvent: (committedTotal: bigint, invoice: Invoice) => OutboxEvent | null
  ): { invoice: Invoice; total: bigint };
  applyInvoiceUpdateWithOutbox?(
    invoiceId: string,
    updates: Partial<Pick<Invoice, "status" | "amountReceived" | "completedAt">>,
    buildEvent: (invoice: Invoice) => OutboxEvent | null
  ): { invoice: Invoice };
  claimDueOutbox?(now: number, leaseMs: number, limit: number): Promise<OutboxRecord[]>;
  markOutboxDelivered?(id: string, deliveredAt: number): Promise<void>;
  rescheduleOutbox?(id: string, nextAttemptAt: number, lastError: string): Promise<void>;
  markOutboxDead?(id: string, lastError: string): Promise<void>;
  pruneDeliveredOutbox?(olderThan: number): Promise<number>;
  countOutboxByStatus?(): Promise<Record<OutboxStatus, number>>;
  getOutboxRecord?(id: string): Promise<OutboxRecord | null>;

  /**
   * Create a durable claim guard for the escrow quote->claim transition, if the
   * backend supports one. The engine injects it into the EscrowManager so a
   * multi-process server cannot double-claim (and double-deploy) a quote.
   */
  createClaimGuard?(): EscrowClaimGuard;

  /**
   * Close the store and release any resources.
   */
  close(): Promise<void>;
};
