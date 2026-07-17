/**
 * The payment primitive of the invoice rail: move DERO to a challenge's
 * integrated address and report the txid. Everything else — spend
 * policy, status polling, receipt redemption — lives in the flow layers
 * (createPayingFetch, createPayingToolCaller), so a payer stays a thin
 * wallet adapter.
 */

import type { DeroChainId } from "../core/types.js";

/** One invoice to pay, lifted from a parsed x402 challenge. */
export type InvoicePayment = {
  invoiceId: string;
  /** Destination carrying the invoice's payment ID. A plain transfer here is the payment. */
  integratedAddress: string;
  amountAtomic: bigint;
  network: DeroChainId;
  resource: string;
  expiresAt: string;
};

/** Pays one invoice. Throwing means no DERO left the wallet. */
export type InvoicePayer = (payment: InvoicePayment) => Promise<{ txid: string }>;
