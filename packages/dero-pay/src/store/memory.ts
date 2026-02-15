/**
 * In-memory invoice store for development and testing.
 *
 * Data is lost when the process exits.
 * NOT suitable for production — use SQLite or a database-backed store.
 */

import type { Invoice, InvoiceStatus, Payment } from "../core/types.js";
import type { InvoiceStore, InvoiceFilter, InvoiceStats } from "./types.js";

/**
 * In-memory implementation of InvoiceStore.
 */
export class MemoryInvoiceStore implements InvoiceStore {
  private invoices = new Map<string, Invoice>();
  private paymentIdIndex = new Map<bigint, string>();

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

  async close(): Promise<void> {
    this.invoices.clear();
    this.paymentIdIndex.clear();
  }
}
