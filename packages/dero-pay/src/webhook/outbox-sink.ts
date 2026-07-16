/**
 * OutboxWebhookSink — the engine's write seam for durable, money-safe webhooks.
 *
 * The InvoiceEngine, when constructed with a sink, routes every state-changing
 * payment/invoice transition through here instead of through the legacy
 * `store.updateInvoice` + in-memory `WebhookDispatcher.send`. The sink:
 *
 *   1. is the SINGLE point that derives the deterministic delivery id,
 *   2. freezes + (the worker later) signs the payload from store-authoritative
 *      state, and
 *   3. commits the invoice mutation AND the outbox row in ONE transaction via
 *      the store's combined `apply*WithOutbox` methods.
 *
 * Crucially the monitor NEVER supplies the written `amount_received`: the
 * in-transaction bigint re-sum inside `applyPaymentWithOutbox` is the sole
 * writer (invariant 1, closing O34). The sink decides status from the
 * committed total (invariant 2/3), on BOTH the detection and confirmation edges.
 */

import type { Invoice, Payment, WebhookEventType } from "../core/types.js";
import type { InvoiceStore } from "../store/types.js";
import type { OutboxEvent, WebhookSink } from "./outbox-types.js";
import { deriveDeliveryId, deriveDiscriminator } from "./delivery-id.js";

/** Freeze an event body to its signed-bytes form (bigint -> string). */
function freezePayload(
  id: string,
  eventType: WebhookEventType,
  invoice: Invoice,
  payment?: Payment,
): string {
  return JSON.stringify(
    { id, type: eventType, invoice, payment },
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
  );
}

export class OutboxWebhookSink implements WebhookSink {
  constructor(
    private readonly store: InvoiceStore,
    private readonly onEnqueued?: () => void,
  ) {
    if (
      typeof store.applyPaymentWithOutbox !== "function" ||
      typeof store.applyInvoiceUpdateWithOutbox !== "function"
    ) {
      throw new Error(
        "OutboxWebhookSink requires a store implementing apply*WithOutbox (durable outbox)",
      );
    }
  }

  /**
   * A freshly-detected payment (new txid). The sink OWNS the write: it does the
   * single-writer in-tx re-sum + status decision + outbox enqueue, all atomic.
   * The engine must NOT separately store.addPayment in sink mode.
   */
  async onPaymentDetected(invoiceId: string, payment: Payment): Promise<void> {
    const apply = this.store.applyPaymentWithOutbox!.bind(this.store);

    apply(invoiceId, payment, (total, invoice) => {
      const newStatus = decideStatus(invoice, total);
      // Persist the status alongside (the combined update happens in a second
      // call below only if status changed — keep this enqueue tied to the
      // payment.detected event).
      const discriminator = deriveDiscriminator({
        eventType: "payment.detected",
        newStatus,
        cumulativeAtoms: total,
        finalAmount: total,
        triggeringTxid: payment.txid,
      });
      const id = deriveDeliveryId(invoiceId, "payment.detected", discriminator);
      return {
        id,
        eventType: "payment.detected",
        invoiceId,
        payload: freezePayload(id, "payment.detected", invoice, payment),
      };
    });

    // Now reconcile the status edge (partial/confirming/completed) on the
    // committed total in its own atomic update+enqueue.
    await this.reconcileStatus(invoiceId, payment);
    this.onEnqueued?.();
  }

  /**
   * Confirmation-depth crossing (invariant 3): re-read store-authoritative
   * state and enqueue completion/confirming on the confirmation edge so a
   * payment first seen unconfirmed still completes durably.
   */
  async onPaymentConfirmed(invoiceId: string, txid: string): Promise<void> {
    const stored = await this.store.getInvoice(invoiceId);
    if (!stored) return;
    const payment =
      stored.payments.find((p) => p.txid === txid) ?? stored.payments[0];
    if (payment) await this.reconcileStatus(invoiceId, payment);
    this.onEnqueued?.();
  }

  /**
   * Decide the status from the committed total and enqueue the corresponding
   * invoice.* event IF the status changed. Atomic update + outbox row.
   */
  private async reconcileStatus(
    invoiceId: string,
    payment: Payment,
  ): Promise<void> {
    const stored = await this.store.getInvoice(invoiceId);
    if (!stored) return;

    const total = stored.amountReceived;
    const newStatus = decideStatus(stored, total);
    if (newStatus === stored.status) return; // no edge to emit

    const eventType = `invoice.${newStatus}` as WebhookEventType;
    const isTerminal = newStatus === "completed" || newStatus === "expired";
    const updates: Partial<Pick<Invoice, "status" | "completedAt">> = {
      status: newStatus,
    };
    if (newStatus === "completed") updates.completedAt = new Date().toISOString();

    this.store.applyInvoiceUpdateWithOutbox!(invoiceId, updates, (invoice) => {
      const discriminator = deriveDiscriminator({
        eventType,
        newStatus,
        cumulativeAtoms: total,
        finalAmount: isTerminal ? total : 0n,
        triggeringTxid: payment.txid,
      });
      const id = deriveDeliveryId(invoiceId, eventType, discriminator);
      return {
        id,
        eventType,
        invoiceId,
        payload: freezePayload(id, eventType, invoice, payment),
      };
    });
  }

  /** Payment-aware expiry: enqueue a terminal invoice.expired event. */
  async onInvoiceExpired(invoiceId: string): Promise<void> {
    const stored = await this.store.getInvoice(invoiceId);
    if (!stored) return;

    this.store.applyInvoiceUpdateWithOutbox!(
      invoiceId,
      { status: "expired" },
      (invoice) => {
        const discriminator = deriveDiscriminator({
          eventType: "invoice.expired",
          newStatus: "expired",
          cumulativeAtoms: invoice.amountReceived,
          finalAmount: invoice.amountReceived,
          triggeringTxid: null,
        });
        const id = deriveDeliveryId(invoiceId, "invoice.expired", discriminator);
        return {
          id,
          eventType: "invoice.expired",
          invoiceId,
          payload: freezePayload(id, "invoice.expired", invoice),
        };
      },
    );
    this.onEnqueued?.();
  }
}

/**
 * Status from a store-authoritative committed total (mirrors the engine's
 * calculateInvoiceStatus but driven purely by committed state, never a stale
 * in-memory monitor amount).
 */
function decideStatus(invoice: Invoice, total: bigint): Invoice["status"] {
  // O16 — escrow guard, IDENTICAL to the engine's calculateInvoiceStatus. An
  // escrow invoice is settled EXCLUSIVELY through its SCID (Deposit ->
  // ConfirmDelivery/ClaimAfterExpiry/Arbitrate), never the integrated-address
  // rail. A direct integrated-address payment to an escrow invoice is a buyer
  // routing error: the funds hit the merchant's base wallet with zero escrow
  // protection and must NEVER drive the invoice to confirming/completed (which
  // would tell the merchant to ship with nothing in escrow). The sink is the
  // durable/multi-process production writer, so the guard MUST live here too —
  // otherwise the recommended production config re-opens the O11 dual-rail
  // hijack. Flag for reconciliation instead of settling.
  if (invoice.escrow) {
    return "misrouted_to_base";
  }
  if (total >= invoice.amount) {
    const allConfirmed =
      invoice.payments.length > 0 &&
      invoice.payments.every((p) => p.status === "confirmed");
    return allConfirmed ? "completed" : "confirming";
  }
  if (total > 0n) return "partial";
  return "pending";
}
