/**
 * Pluggable storage interface for DeroPay.
 *
 * Implement this interface to use your own storage backend.
 * In-memory and SQLite implementations are provided.
 */

import type { Invoice, InvoiceStatus, Payment } from "../core/types.js";

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

/** Invoice store summary stats */
export type InvoiceStats = {
  total: number;
  created: number;
  pending: number;
  confirming: number;
  completed: number;
  expired: number;
  partial: number;
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
   * Update an invoice's status and related fields.
   */
  updateInvoice(
    id: string,
    updates: Partial<Pick<Invoice, "status" | "amountReceived" | "completedAt" | "payments">>
  ): Promise<void>;

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

  /**
   * Close the store and release any resources.
   */
  close(): Promise<void>;
};
