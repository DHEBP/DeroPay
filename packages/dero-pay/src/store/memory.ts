/**
 * In-memory invoice store for development and testing.
 *
 * Data is lost when the process exits.
 * NOT suitable for production — use SQLite or a database-backed store.
 */

import type { Invoice, InvoiceStatus, Payment } from "../core/types.js";
import type {
  InvoiceStore,
  InvoiceFilter,
  InvoiceStats,
  X402UsageReservation,
  X402UsageBatchReservationResult,
  X402UsageReservationResult,
} from "./types.js";

/**
 * In-memory implementation of InvoiceStore.
 */
export class MemoryInvoiceStore implements InvoiceStore {
  private invoices = new Map<string, Invoice>();
  private paymentIdIndex = new Map<bigint, string>();
  private usedReceiptJtis = new Map<string, number>();
  private x402UsageWindows = new Map<
    string,
    { windowEndMs: number; receiptCount: number; totalAmountAtomic: bigint }
  >();

  async createInvoice(invoice: Invoice): Promise<void> {
    if (this.invoices.has(invoice.id)) {
      throw new Error(`Invoice ${invoice.id} already exists`);
    }
    this.invoices.set(invoice.id, { ...invoice });
    this.paymentIdIndex.set(invoice.paymentId, invoice.id);
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    const invoice = this.invoices.get(id);
    return invoice ? { ...invoice } : null;
  }

  async getInvoiceByPaymentId(paymentId: bigint): Promise<Invoice | null> {
    const id = this.paymentIdIndex.get(paymentId);
    if (!id) return null;
    return this.getInvoice(id);
  }

  async updateInvoice(
    id: string,
    updates: Partial<Pick<Invoice, "status" | "amountReceived" | "completedAt" | "payments">>
  ): Promise<void> {
    const invoice = this.invoices.get(id);
    if (!invoice) {
      throw new Error(`Invoice ${id} not found`);
    }

    if (updates.status !== undefined) invoice.status = updates.status;
    if (updates.amountReceived !== undefined) invoice.amountReceived = updates.amountReceived;
    if (updates.completedAt !== undefined) invoice.completedAt = updates.completedAt;
    if (updates.payments !== undefined) invoice.payments = [...updates.payments];
  }

  async addPayment(invoiceId: string, payment: Payment): Promise<void> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    // Idempotency: skip if TXID already recorded
    if (invoice.payments.some((p) => p.txid === payment.txid)) {
      return;
    }

    invoice.payments.push({ ...payment });
    invoice.amountReceived += payment.amount;
  }

  async updatePayment(
    invoiceId: string,
    txid: string,
    updates: Partial<Pick<Payment, "confirmations" | "status">>
  ): Promise<void> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    const payment = invoice.payments.find((p) => p.txid === txid);
    if (!payment) {
      throw new Error(`Payment ${txid} not found on invoice ${invoiceId}`);
    }

    if (updates.confirmations !== undefined) payment.confirmations = updates.confirmations;
    if (updates.status !== undefined) payment.status = updates.status;
  }

  async listInvoices(filter?: InvoiceFilter): Promise<Invoice[]> {
    let invoices = Array.from(this.invoices.values());

    if (filter?.status) {
      const statuses = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      invoices = invoices.filter((inv) =>
        statuses.includes(inv.status)
      );
    }

    if (filter?.createdAfter) {
      const after = filter.createdAfter.getTime();
      invoices = invoices.filter(
        (inv) => new Date(inv.createdAt).getTime() >= after
      );
    }

    if (filter?.createdBefore) {
      const before = filter.createdBefore.getTime();
      invoices = invoices.filter(
        (inv) => new Date(inv.createdAt).getTime() <= before
      );
    }

    // Sort by creation date descending (newest first)
    invoices.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? invoices.length;
    return invoices.slice(offset, offset + limit).map((inv) => ({ ...inv }));
  }

  async getActiveInvoices(): Promise<Invoice[]> {
    const activeStatuses: InvoiceStatus[] = [
      "created",
      "pending",
      "confirming",
      "partial",
      // O15 — a funded escrow invoice is NON-terminal: its settlement is still
      // in flight on the escrow rail (ConfirmDelivery / ClaimAfterExpiry /
      // Arbitrate). It must stay in the active set so a restart reloads it and
      // the escrow lifecycle keeps driving it to completed/expired.
      "escrow_funded",
      // O19 — a disputed escrow invoice is ALSO non-terminal (settlement blocked
      // pending Arbitrate()); keep it active so a restart reloads it.
      "disputed",
    ];
    return this.listInvoices({ status: activeStatuses });
  }

  async getStats(): Promise<InvoiceStats> {
    const invoices = Array.from(this.invoices.values());
    let totalAmountReceived = 0n;

    const counts: Record<InvoiceStatus, number> = {
      created: 0,
      pending: 0,
      confirming: 0,
      completed: 0,
      expired: 0,
      partial: 0,
      misrouted_to_base: 0,
      escrow_funded: 0,
      disputed: 0,
      refunded: 0,
    };

    for (const inv of invoices) {
      counts[inv.status]++;
      totalAmountReceived += inv.amountReceived;
    }

    return {
      total: invoices.length,
      ...counts,
      totalAmountReceived,
    };
  }

  async markReceiptJtiUsed(jti: string, expiresAt: string): Promise<boolean> {
    this.pruneExpiredReceiptJtis();
    if (this.usedReceiptJtis.has(jti)) {
      return false;
    }

    const expiryMs = new Date(expiresAt).getTime();
    this.usedReceiptJtis.set(jti, Number.isFinite(expiryMs) ? expiryMs : Date.now());
    return true;
  }

  async reserveX402Usage(
    reservation: X402UsageReservation
  ): Promise<X402UsageReservationResult> {
    this.pruneExpiredUsageWindows();
    const windowEndMs = new Date(reservation.windowEnd).getTime();
    const existing = this.x402UsageWindows.get(reservation.windowKey) ?? {
      windowEndMs: Number.isFinite(windowEndMs) ? windowEndMs : Date.now(),
      receiptCount: 0,
      totalAmountAtomic: 0n,
    };

    const nextReceiptCount = existing.receiptCount + 1;
    const nextTotalAmountAtomic = existing.totalAmountAtomic + reservation.amountAtomic;

    const exceedsReceiptLimit =
      reservation.maxReceipts !== undefined && nextReceiptCount > reservation.maxReceipts;
    const exceedsAmountLimit =
      reservation.maxAmountAtomic !== undefined &&
      nextTotalAmountAtomic > reservation.maxAmountAtomic;

    if (exceedsReceiptLimit || exceedsAmountLimit) {
      return {
        allowed: false,
        receiptCount: existing.receiptCount,
        totalAmountAtomic: existing.totalAmountAtomic,
      };
    }

    this.x402UsageWindows.set(reservation.windowKey, {
      windowEndMs: existing.windowEndMs,
      receiptCount: nextReceiptCount,
      totalAmountAtomic: nextTotalAmountAtomic,
    });

    return {
      allowed: true,
      receiptCount: nextReceiptCount,
      totalAmountAtomic: nextTotalAmountAtomic,
    };
  }

  async reserveX402UsageBatch(
    reservations: X402UsageReservation[]
  ): Promise<X402UsageBatchReservationResult> {
    this.pruneExpiredUsageWindows();

    const staged = reservations.map((reservation) => {
      const windowEndMs = new Date(reservation.windowEnd).getTime();
      const existing = this.x402UsageWindows.get(reservation.windowKey) ?? {
        windowEndMs: Number.isFinite(windowEndMs) ? windowEndMs : Date.now(),
        receiptCount: 0,
        totalAmountAtomic: 0n,
      };
      const nextReceiptCount = existing.receiptCount + 1;
      const nextTotalAmountAtomic = existing.totalAmountAtomic + reservation.amountAtomic;
      const allowed =
        (reservation.maxReceipts === undefined ||
          nextReceiptCount <= reservation.maxReceipts) &&
        (reservation.maxAmountAtomic === undefined ||
          nextTotalAmountAtomic <= reservation.maxAmountAtomic);

      return {
        reservation,
        existing,
        nextReceiptCount,
        nextTotalAmountAtomic,
        allowed,
      };
    });

    if (staged.some((entry) => !entry.allowed)) {
      return {
        allowed: false,
        results: staged.map((entry) => ({
          allowed: entry.allowed,
          receiptCount: entry.existing.receiptCount,
          totalAmountAtomic: entry.existing.totalAmountAtomic,
        })),
      };
    }

    for (const entry of staged) {
      this.x402UsageWindows.set(entry.reservation.windowKey, {
        windowEndMs: entry.existing.windowEndMs,
        receiptCount: entry.nextReceiptCount,
        totalAmountAtomic: entry.nextTotalAmountAtomic,
      });
    }

    return {
      allowed: true,
      results: staged.map((entry) => ({
        allowed: true,
        receiptCount: entry.nextReceiptCount,
        totalAmountAtomic: entry.nextTotalAmountAtomic,
      })),
    };
  }

  async close(): Promise<void> {
    this.invoices.clear();
    this.paymentIdIndex.clear();
    this.usedReceiptJtis.clear();
    this.x402UsageWindows.clear();
  }

  private pruneExpiredReceiptJtis(nowMs = Date.now()): void {
    for (const [jti, expiresAtMs] of this.usedReceiptJtis.entries()) {
      if (expiresAtMs <= nowMs) {
        this.usedReceiptJtis.delete(jti);
      }
    }
  }

  private pruneExpiredUsageWindows(nowMs = Date.now()): void {
    for (const [windowKey, window] of this.x402UsageWindows.entries()) {
      if (window.windowEndMs <= nowMs) {
        this.x402UsageWindows.delete(windowKey);
      }
    }
  }
}
