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
  UpdateInvoiceOpts,
} from "./types.js";
import type { EscrowClaimGuard } from "../escrow/manager.js";
import { MemoryEscrowClaimGuard } from "../escrow/claim-guard.js";
import type { EscrowInventoryStore } from "../escrow/inventory-store.js";
import { MemoryEscrowInventoryStore } from "../escrow/inventory-store.js";
import {
  PrepaidError,
  type CapturePrepaidInput,
  type CreditPrepaidInput,
  type PrepaidBalance,
  type PrepaidCaptureResult,
  type PrepaidCreditResult,
  type PrepaidHold,
  type PrepaidReleaseResult,
  type PrepaidReservationResult,
  type PrepaidStore,
  type PrepaidTransaction,
  type PrepaidTransactionPage,
  type RefundPrepaidInput,
  type ReleasePrepaidInput,
  type ReservePrepaidInput,
} from "../prepaid/types.js";

/**
 * In-memory implementation of InvoiceStore.
 */
export class MemoryInvoiceStore implements InvoiceStore, PrepaidStore {
  private invoices = new Map<string, Invoice>();
  private claimGuard?: EscrowClaimGuard;
  private inventoryStore?: EscrowInventoryStore;

  /** Per-process claim guard (in-memory). Memoized for the store's lifetime. */
  createClaimGuard(): EscrowClaimGuard {
    return (this.claimGuard ??= new MemoryEscrowClaimGuard());
  }

  /** Per-process keeper inventory (in-memory). Memoized for the store's lifetime. */
  createInventoryStore(): EscrowInventoryStore {
    return (this.inventoryStore ??= new MemoryEscrowInventoryStore());
  }

  private paymentIdIndex = new Map<bigint, string>();
  private usedReceiptJtis = new Map<string, number>();
  private x402UsageWindows = new Map<
    string,
    { windowEndMs: number; receiptCount: number; totalAmountAtomic: bigint }
  >();
  private prepaidBalances = new Map<string, PrepaidBalance>();
  private prepaidTransactions = new Map<string, PrepaidTransaction>();
  private prepaidHolds = new Map<string, PrepaidHold>();
  private prepaidHoldReferences = new Map<string, string>();

  async createInvoice(invoice: Invoice): Promise<void> {
    if (this.invoices.has(invoice.id)) {
      throw new Error(`Invoice ${invoice.id} already exists`);
    }
    this.invoices.set(invoice.id, { ...invoice });
    this.paymentIdIndex.set(invoice.paymentId, invoice.id);
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    const invoice = this.invoices.get(id);
    return invoice ? this.snapshot(invoice) : null;
  }

  /**
   * O10 — return a fully DETACHED copy so a caller mutating invoice.escrow (or
   * metadata) in place cannot "write through" to the stored blob by shared
   * reference. A shallow `{ ...invoice }` aliases the nested escrow object, which
   * both masks a missing persist AND defeats the updateInvoice compare-and-set
   * (the CAS would read the caller's in-place mutation instead of the committed
   * state). Deep-copying the nested blobs makes the in-memory store model the
   * same serialize/deserialize boundary the SQLite store has. bigint scalars are
   * copied by the spread; only escrow/metadata need the structured clone.
   */
  private snapshot(invoice: Invoice): Invoice {
    const copy: Invoice = { ...invoice };
    if (invoice.escrow) {
      copy.escrow = JSON.parse(JSON.stringify(invoice.escrow)) as Invoice["escrow"];
    }
    copy.metadata = { ...invoice.metadata };
    copy.payments = invoice.payments.map((p) => ({ ...p }));
    return copy;
  }

  async getInvoiceByPaymentId(paymentId: bigint): Promise<Invoice | null> {
    const id = this.paymentIdIndex.get(paymentId);
    if (!id) return null;
    return this.getInvoice(id);
  }

  async getInvoiceByScid(scid: string): Promise<Invoice | null> {
    for (const inv of this.invoices.values()) {
      if (inv.escrow?.scid === scid) return this.getInvoice(inv.id);
    }
    return null;
  }

  async updateInvoice(
    id: string,
    updates: Partial<
      Pick<
        Invoice,
        "status" | "amountReceived" | "completedAt" | "payments" | "escrow" | "metadata"
      >
    >,
    opts?: UpdateInvoiceOpts
  ): Promise<boolean> {
    const invoice = this.invoices.get(id);
    if (!invoice) {
      throw new Error(`Invoice ${id} not found`);
    }

    // O10 — compare-and-set precondition. The check and the mutation below run
    // with no intervening await, so within this single-threaded process they are
    // atomic; a stale caller whose expected escrow no longer matches the current
    // blob is rejected (returns false) rather than clobbering a newer transition.
    if (opts?.expectedEscrow) {
      const cur = invoice.escrow;
      const curId = cur?.escrowId ?? null;
      const curStatus = cur?.escrowStatus ?? null;
      if (
        curId !== opts.expectedEscrow.escrowId ||
        curStatus !== opts.expectedEscrow.escrowStatus
      ) {
        return false;
      }
    }

    if (updates.status !== undefined) invoice.status = updates.status;
    if (updates.amountReceived !== undefined) invoice.amountReceived = updates.amountReceived;
    if (updates.completedAt !== undefined) invoice.completedAt = updates.completedAt;
    if (updates.payments !== undefined) invoice.payments = [...updates.payments];
    // Deep-copy escrow/metadata so the stored record does not alias the caller's
    // object. getInvoice returns a shallow copy that shares these nested refs;
    // without an explicit persist here a caller mutating invoice.escrow would
    // "write through" by reference and mask a store that never persists escrow
    // (exactly what hid the SQLite empty-patch bug). Require the explicit patch.
    if (updates.escrow !== undefined) {
      invoice.escrow = updates.escrow
        ? (JSON.parse(JSON.stringify(updates.escrow)) as typeof invoice.escrow)
        : null;
    }
    if (updates.metadata !== undefined) {
      invoice.metadata = { ...updates.metadata };
    }
    return true;
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
    // O10 — detached snapshots (see getInvoice): handlers mutate the returned
    // escrow blob then CAS-persist it, so they must NOT alias the stored object.
    return invoices.slice(offset, offset + limit).map((inv) => this.snapshot(inv));
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

  async creditPrepaid(input: CreditPrepaidInput): Promise<PrepaidCreditResult> {
    const existing = this.prepaidTransactions.get(input.reference);
    if (existing) {
      if (
        existing.type !== "TOP_UP" ||
        existing.accountId !== input.accountId ||
        existing.amountAtomic !== input.amountAtomic ||
        existing.relatedReference !== input.relatedReference
      ) {
        throw new PrepaidError("idempotency_conflict", "Prepaid reference already exists");
      }
      return {
        created: false,
        balance: this.prepaidBalance(input.accountId),
        transaction: this.prepaidTransaction(existing),
      };
    }

    if (input.relatedReference) {
      // ponytail: linear only in the development store; index if in-memory top-up volume grows.
      const usedInvoice = Array.from(this.prepaidTransactions.values()).some(
        (transaction) =>
          transaction.type === "TOP_UP" &&
          transaction.relatedReference === input.relatedReference,
      );
      if (usedInvoice) {
        throw new PrepaidError("idempotency_conflict", "Top-up invoice was already credited");
      }
    }

    const balance = this.prepaidBalance(input.accountId);
    balance.availableAtomic += input.amountAtomic;
    balance.updatedAt = input.createdAt;
    this.prepaidBalances.set(input.accountId, balance);
    const transaction: PrepaidTransaction = {
      id: input.id,
      accountId: input.accountId,
      type: "TOP_UP",
      amountAtomic: input.amountAtomic,
      balanceAfterAtomic: balance.availableAtomic,
      reference: input.reference,
      relatedReference: input.relatedReference,
      createdAt: input.createdAt,
      metadata: { ...input.metadata },
    };
    this.prepaidTransactions.set(input.reference, transaction);
    return {
      created: true,
      balance: this.prepaidBalance(input.accountId),
      transaction: this.prepaidTransaction(transaction),
    };
  }

  async reservePrepaid(input: ReservePrepaidInput): Promise<PrepaidReservationResult> {
    const existingId = this.prepaidHoldReferences.get(input.reference);
    if (existingId) {
      const existing = this.prepaidHolds.get(existingId)!;
      if (
        existing.accountId !== input.accountId ||
        existing.reservedAtomic !== input.amountAtomic
      ) {
        throw new PrepaidError("idempotency_conflict", "Prepaid hold reference already exists");
      }
      return {
        created: false,
        balance: this.prepaidBalance(input.accountId),
        hold: this.prepaidHold(existing),
      };
    }

    const balance = this.prepaidBalance(input.accountId);
    if (balance.availableAtomic < input.amountAtomic) {
      throw new PrepaidError("insufficient_balance", "Insufficient prepaid balance", {
        availableAtomic: balance.availableAtomic.toString(),
        requiredAtomic: input.amountAtomic.toString(),
      });
    }
    balance.availableAtomic -= input.amountAtomic;
    balance.reservedAtomic += input.amountAtomic;
    balance.updatedAt = input.createdAt;
    this.prepaidBalances.set(input.accountId, balance);
    const hold: PrepaidHold = {
      id: input.id,
      accountId: input.accountId,
      reference: input.reference,
      reservedAtomic: input.amountAtomic,
      capturedAtomic: 0n,
      state: "open",
      createdAt: input.createdAt,
      metadata: { ...input.metadata },
    };
    this.prepaidHolds.set(hold.id, hold);
    this.prepaidHoldReferences.set(hold.reference, hold.id);
    return {
      created: true,
      balance: this.prepaidBalance(input.accountId),
      hold: this.prepaidHold(hold),
    };
  }

  async capturePrepaid(input: CapturePrepaidInput): Promise<PrepaidCaptureResult> {
    const hold = this.prepaidHolds.get(input.holdId);
    if (!hold) throw new PrepaidError("hold_not_found", "Prepaid hold was not found");
    const chargeReference = `charge:${hold.id}`;
    if (hold.state === "captured") {
      if (hold.capturedAtomic !== input.amountAtomic) {
        throw new PrepaidError("idempotency_conflict", "Hold was captured for another amount");
      }
      const existing = this.prepaidTransactions.get(chargeReference);
      return {
        created: false,
        balance: this.prepaidBalance(hold.accountId),
        hold: this.prepaidHold(hold),
        transaction: existing ? this.prepaidTransaction(existing) : undefined,
      };
    }
    if (hold.state !== "open") {
      throw new PrepaidError("hold_not_open", "Prepaid hold is no longer open");
    }
    if (input.amountAtomic > hold.reservedAtomic) {
      throw new PrepaidError(
        "capture_exceeds_reservation",
        "Capture amount exceeds prepaid reservation",
      );
    }

    const balance = this.prepaidBalance(hold.accountId);
    balance.availableAtomic += hold.reservedAtomic - input.amountAtomic;
    balance.reservedAtomic -= hold.reservedAtomic;
    balance.updatedAt = input.finalizedAt;
    this.prepaidBalances.set(hold.accountId, balance);
    hold.state = "captured";
    hold.capturedAtomic = input.amountAtomic;
    hold.finalizedAt = input.finalizedAt;
    hold.metadata = { ...hold.metadata, ...input.metadata };

    let transaction: PrepaidTransaction | undefined;
    if (input.amountAtomic > 0n) {
      transaction = {
        id: input.transactionId,
        accountId: hold.accountId,
        type: "CHARGE",
        amountAtomic: input.amountAtomic,
        balanceAfterAtomic: balance.availableAtomic,
        reference: chargeReference,
        relatedReference: hold.reference,
        createdAt: input.finalizedAt,
        metadata: { ...input.metadata },
      };
      this.prepaidTransactions.set(transaction.reference, transaction);
    }
    return {
      created: true,
      balance: this.prepaidBalance(hold.accountId),
      hold: this.prepaidHold(hold),
      transaction: transaction ? this.prepaidTransaction(transaction) : undefined,
    };
  }

  async releasePrepaid(input: ReleasePrepaidInput): Promise<PrepaidReleaseResult> {
    const hold = this.prepaidHolds.get(input.holdId);
    if (!hold) throw new PrepaidError("hold_not_found", "Prepaid hold was not found");
    if (hold.state === "released") {
      return {
        released: false,
        balance: this.prepaidBalance(hold.accountId),
        hold: this.prepaidHold(hold),
      };
    }
    if (hold.state !== "open") {
      throw new PrepaidError("hold_not_open", "Captured prepaid hold cannot be released");
    }
    const balance = this.prepaidBalance(hold.accountId);
    balance.availableAtomic += hold.reservedAtomic;
    balance.reservedAtomic -= hold.reservedAtomic;
    balance.updatedAt = input.finalizedAt;
    this.prepaidBalances.set(hold.accountId, balance);
    hold.state = "released";
    hold.finalizedAt = input.finalizedAt;
    return {
      released: true,
      balance: this.prepaidBalance(hold.accountId),
      hold: this.prepaidHold(hold),
    };
  }

  async refundPrepaid(input: RefundPrepaidInput): Promise<PrepaidCreditResult> {
    const existing = this.prepaidTransactions.get(input.reference);
    if (existing) {
      if (
        existing.type !== "REFUND" ||
        existing.accountId !== input.accountId ||
        existing.amountAtomic !== input.amountAtomic ||
        existing.relatedReference !== input.chargeReference
      ) {
        throw new PrepaidError("idempotency_conflict", "Refund reference already exists");
      }
      return {
        created: false,
        balance: this.prepaidBalance(input.accountId),
        transaction: this.prepaidTransaction(existing),
      };
    }
    const charge = this.prepaidTransactions.get(input.chargeReference);
    if (!charge || charge.type !== "CHARGE" || charge.accountId !== input.accountId) {
      throw new PrepaidError("charge_not_found", "Charge reference was not found");
    }
    let refunded = 0n;
    for (const transaction of this.prepaidTransactions.values()) {
      if (
        transaction.type === "REFUND" &&
        transaction.relatedReference === input.chargeReference
      ) {
        refunded += transaction.amountAtomic;
      }
    }
    if (refunded + input.amountAtomic > charge.amountAtomic) {
      throw new PrepaidError("refund_exceeds_charge", "Refund exceeds original charge");
    }
    const balance = this.prepaidBalance(input.accountId);
    balance.availableAtomic += input.amountAtomic;
    balance.updatedAt = input.createdAt;
    this.prepaidBalances.set(input.accountId, balance);
    const transaction: PrepaidTransaction = {
      id: input.id,
      accountId: input.accountId,
      type: "REFUND",
      amountAtomic: input.amountAtomic,
      balanceAfterAtomic: balance.availableAtomic,
      reference: input.reference,
      relatedReference: input.chargeReference,
      createdAt: input.createdAt,
      metadata: { ...input.metadata },
    };
    this.prepaidTransactions.set(transaction.reference, transaction);
    return {
      created: true,
      balance: this.prepaidBalance(input.accountId),
      transaction: this.prepaidTransaction(transaction),
    };
  }

  async getPrepaidBalance(accountId: string): Promise<PrepaidBalance> {
    return this.prepaidBalance(accountId);
  }

  async getPrepaidTransaction(reference: string): Promise<PrepaidTransaction | null> {
    const transaction = this.prepaidTransactions.get(reference);
    return transaction ? this.prepaidTransaction(transaction) : null;
  }

  async listPrepaidTransactions(
    accountId: string,
    options: { limit: number; offset: number },
  ): Promise<PrepaidTransactionPage> {
    const all = Array.from(this.prepaidTransactions.values())
      .filter((transaction) => transaction.accountId === accountId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      items: all
        .slice(options.offset, options.offset + options.limit)
        .map((transaction) => this.prepaidTransaction(transaction)),
      total: all.length,
      limit: options.limit,
      offset: options.offset,
    };
  }

  async listOpenPrepaidHolds(
    options: { accountId?: string; limit?: number } = {},
  ): Promise<PrepaidHold[]> {
    return Array.from(this.prepaidHolds.values())
      .filter(
        (hold) =>
          hold.state === "open" &&
          (options.accountId === undefined || hold.accountId === options.accountId),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, options.limit ?? 100)
      .map((hold) => this.prepaidHold(hold));
  }

  async close(): Promise<void> {
    this.invoices.clear();
    this.paymentIdIndex.clear();
    this.usedReceiptJtis.clear();
    this.x402UsageWindows.clear();
    this.prepaidBalances.clear();
    this.prepaidTransactions.clear();
    this.prepaidHolds.clear();
    this.prepaidHoldReferences.clear();
  }

  private prepaidBalance(accountId: string): PrepaidBalance {
    const balance = this.prepaidBalances.get(accountId);
    return balance
      ? { ...balance }
      : {
          accountId,
          availableAtomic: 0n,
          reservedAtomic: 0n,
          updatedAt: new Date(0).toISOString(),
        };
  }

  private prepaidTransaction(transaction: PrepaidTransaction): PrepaidTransaction {
    return { ...transaction, metadata: { ...transaction.metadata } };
  }

  private prepaidHold(hold: PrepaidHold): PrepaidHold {
    return { ...hold, metadata: { ...hold.metadata } };
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
