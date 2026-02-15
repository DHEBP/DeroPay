/**
 * @module dero-pay
 *
 * Core types and utilities for DERO payment processing.
 */

export type {
  DeroChainId,
  InvoiceStatus,
  WalletStatus,
  PaymentStatus,
  Payment,
  Invoice,
  InvoiceEscrow,
  EscrowInvoiceStatus,
  CreateInvoiceParams,
  CreateInvoiceEscrowParams,
  DeroPayConfig,
  WebhookEventType,
  WebhookEvent,
  DeroPayErrorCode,
  DeroPayError,
} from "./types.js";

export {
  generatePaymentId,
  paymentIdToHex,
  hexToPaymentId,
  isValidPaymentId,
} from "./payment-id.js";

export {
  ATOMIC_UNITS_PER_DERO,
  DERO_DECIMALS,
  deroToAtomic,
  atomicToDero,
  formatDero,
  isValidAmount,
} from "./pricing.js";
