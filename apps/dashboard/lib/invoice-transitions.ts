/**
 * Allowed manual invoice status transitions.
 *
 * The payment engine (see `packages/dero-pay/src/server/invoice-engine.ts`)
 * drives the automatic transitions off blockchain state:
 *   created / pending → confirming → completed
 *                    ↘ expired (via TTL)
 *                    ↘ partial (underpaid, still waiting)
 *
 * This table is the **merchant-override** surface — the limited set of
 * transitions a user is allowed to trigger from the dashboard UI. It is
 * intentionally narrow: the only terminal the UI lets a merchant force is
 * `expired`, which acts as a manual "cancel this draft/pending invoice".
 * `completed` stays engine-only (payments must clear on-chain).
 *
 * Keep this map in sync with the PATCH `/api/pay/invoices/[id]` validator,
 * which enforces the same rules server-side.
 */

import type { InvoiceStatus } from "dero-pay";

export const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  created: ["expired"], // merchant can manually expire a draft
  pending: ["expired"], // merchant can cancel-via-expire
  confirming: ["expired"], // can abort confirmation (rare but allowed)
  partial: ["expired"],
  completed: [], // terminal — no manual transitions
  expired: [], // terminal
  // Escrow-lifecycle statuses are engine/on-chain driven — the merchant UI
  // offers no manual override for any of them.
  misrouted_to_base: [], // alert/reconciliation state, not merchant-forcible
  escrow_funded: [], // funded via Deposit(); proceeds through escrow lifecycle
  disputed: [], // resolved by the arbitrator, not the merchant
  refunded: [], // terminal
};

export function allowedNextStatuses(current: InvoiceStatus): InvoiceStatus[] {
  return ALLOWED_TRANSITIONS[current] ?? [];
}

export function isTransitionAllowed(
  from: InvoiceStatus,
  to: InvoiceStatus,
): boolean {
  return allowedNextStatuses(from).includes(to);
}

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  created: "Created",
  pending: "Pending",
  confirming: "Confirming",
  partial: "Partial",
  completed: "Completed",
  expired: "Expired",
  misrouted_to_base: "Misrouted",
  escrow_funded: "In Escrow",
  disputed: "Disputed",
  refunded: "Refunded",
};

/** Verb used in menu items: "Mark expired", etc. Keep lowercase. */
export const STATUS_VERBS: Record<InvoiceStatus, string> = {
  created: "mark created",
  pending: "mark pending",
  confirming: "mark confirming",
  partial: "mark partial",
  completed: "mark completed",
  expired: "mark expired",
  misrouted_to_base: "mark misrouted",
  escrow_funded: "mark in escrow",
  disputed: "mark disputed",
  refunded: "mark refunded",
};
