/**
 * Payment monitoring engine.
 *
 * Polls the DERO wallet RPC for incoming transactions matching
 * specific payment IDs and emits events on state changes.
 */

import { WalletRpcClient } from "../rpc/wallet-rpc.js";
import { DaemonRpcClient } from "../rpc/daemon-rpc.js";
import { calculateConfirmations } from "./confirmation.js";
import type { Payment, Invoice } from "../core/types.js";
import type { TransferEntry } from "../rpc/types.js";

/** Events emitted by the payment monitor */
export type PaymentMonitorEvents = {
  /** A new payment was detected for an invoice */
  paymentDetected: (invoiceId: string, payment: Payment) => void;
  /** A payment reached required confirmations */
  paymentConfirmed: (invoiceId: string, payment: Payment) => void;
  /** An invoice is now fully paid (amount met + confirmations met) */
  invoiceCompleted: (invoiceId: string) => void;
  /** An invoice has expired */
  invoiceExpired: (invoiceId: string) => void;
  /** An invoice received a partial payment */
  invoicePartial: (invoiceId: string, amountReceived: bigint) => void;
  /** Monitor encountered an error */
  error: (error: Error) => void;
};

/** A tracked invoice in the monitor */
type TrackedInvoice = {
  invoice: Invoice;
  /** Set of already-seen TXIDs to avoid duplicate events */
  seenTxids: Set<string>;
  /** The height at which we started tracking (for efficient queries) */
  startHeight: number;
};

/**
 * Payment monitor that watches for incoming DERO payments.
 *
 * Usage:
 * ```ts
 * const monitor = new PaymentMonitor({ walletRpc, daemonRpc });
 * monitor.on("paymentDetected", (invoiceId, payment) => { ... });
 * monitor.on("invoiceCompleted", (invoiceId) => { ... });
 * monitor.track(invoice);
 * monitor.start();
 * ```
 */
export class PaymentMonitor {
  private walletRpc: WalletRpcClient;
  private daemonRpc: DaemonRpcClient;
  private pollIntervalMs: number;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private trackedInvoices = new Map<string, TrackedInvoice>();
  private listeners: Partial<{
    [K in keyof PaymentMonitorEvents]: PaymentMonitorEvents[K][];
  }> = {};

  constructor(options: {
    walletRpc: WalletRpcClient;
    daemonRpc: DaemonRpcClient;
    /** Polling interval in ms (default: 5000) */
    pollIntervalMs?: number;
  }) {
    this.walletRpc = options.walletRpc;
    this.daemonRpc = options.daemonRpc;
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
  }

  /** Register an event listener */
  on<K extends keyof PaymentMonitorEvents>(
    event: K,
    callback: PaymentMonitorEvents[K]
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as PaymentMonitorEvents[K][]).push(callback);
    return () => {
      const arr = this.listeners[event] as PaymentMonitorEvents[K][];
      const idx = arr.indexOf(callback);
      if (idx !== -1) arr.splice(idx, 1);
    };
  }

  private emit<K extends keyof PaymentMonitorEvents>(
    event: K,
    ...args: Parameters<PaymentMonitorEvents[K]>
  ): void {
    const callbacks = this.listeners[event] as PaymentMonitorEvents[K][] | undefined;
    if (callbacks) {
      for (const cb of callbacks) {
        (cb as (...a: unknown[]) => void)(...args);
      }
    }
  }

  /**
   * Start tracking payments for an invoice.
   */
  async track(invoice: Invoice): Promise<void> {
    let startHeight = 0;
    try {
      startHeight = await this.walletRpc.getHeight();
    } catch {
      // If we can't get height, start from 0 (will search all history)
    }

    this.trackedInvoices.set(invoice.id, {
      invoice,
      seenTxids: new Set(invoice.payments.map((p) => p.txid)),
      startHeight: Math.max(0, startHeight - 5), // Small buffer for reorgs
    });
  }

  /**
   * Stop tracking an invoice.
   */
  untrack(invoiceId: string): void {
    this.trackedInvoices.delete(invoiceId);
  }

  /**
   * Update the invoice state for a tracked invoice.
   * Called after external state changes (e.g., store updates).
   */
  updateInvoice(invoice: Invoice): void {
    const tracked = this.trackedInvoices.get(invoice.id);
    if (tracked) {
      tracked.invoice = invoice;
    }
  }

  /**
   * Start the payment monitoring loop.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run immediately, then on interval
    this.poll();
    this.pollingTimer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  /**
   * Stop the payment monitoring loop.
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /** Whether the monitor is currently running */
  get running(): boolean {
    return this.isRunning;
  }

  /** Number of invoices currently being tracked */
  get trackedCount(): number {
    return this.trackedInvoices.size;
  }

  /**
   * Perform a single polling cycle.
   */
  private async poll(): Promise<void> {
    if (this.trackedInvoices.size === 0) return;

    let currentTopoHeight: number;
    try {
      currentTopoHeight = await this.daemonRpc.getHeight();
    } catch (err) {
      this.emit("error", new Error(`Failed to get daemon height: ${err}`));
      return;
    }

    const now = new Date();

    for (const [invoiceId, tracked] of this.trackedInvoices) {
      const { invoice } = tracked;

      // Check if invoice has expired
      if (
        invoice.status !== "completed" &&
        invoice.status !== "expired" &&
        new Date(invoice.expiresAt) < now
      ) {
        this.emit("invoiceExpired", invoiceId);
        continue;
      }

      // Skip if already completed or expired
      if (invoice.status === "completed" || invoice.status === "expired") {
        continue;
      }

      try {
        await this.pollInvoice(tracked, currentTopoHeight);
      } catch (err) {
        this.emit(
          "error",
          new Error(`Error polling invoice ${invoiceId}: ${err}`)
        );
      }
    }
  }

  /**
   * Poll for payments on a specific invoice.
   */
  private async pollInvoice(
    tracked: TrackedInvoice,
    currentTopoHeight: number
  ): Promise<void> {
    const { invoice, seenTxids, startHeight } = tracked;

    // Query wallet for incoming transfers matching this payment ID
    const entries = await this.walletRpc.getIncomingByPaymentId(
      invoice.paymentId,
      startHeight
    );

    // Process new transactions
    for (const entry of entries) {
      if (seenTxids.has(entry.txid)) {
        // Already seen — but update confirmations
        this.updatePaymentConfirmations(
          invoice,
          entry,
          currentTopoHeight
        );
        continue;
      }

      // New payment detected
      seenTxids.add(entry.txid);

      const payment = this.entryToPayment(entry, currentTopoHeight, invoice.requiredConfirmations);
      this.emit("paymentDetected", invoice.id, payment);

      // Check if now fully paid
      const totalReceived =
        invoice.amountReceived + payment.amount;

      if (totalReceived >= invoice.amount) {
        // Check if all payments are confirmed
        if (payment.status === "confirmed") {
          this.emit("invoiceCompleted", invoice.id);
        }
      } else if (totalReceived > 0n) {
        this.emit("invoicePartial", invoice.id, totalReceived);
      }
    }

    // Check if existing confirming payments are now confirmed
    this.checkConfirmationUpdates(tracked, currentTopoHeight);
  }

  /**
   * Check if any confirming payments have reached the required depth.
   */
  private checkConfirmationUpdates(
    tracked: TrackedInvoice,
    currentTopoHeight: number
  ): void {
    const { invoice } = tracked;

    for (const payment of invoice.payments) {
      if (payment.status === "confirming") {
        const confirmations = calculateConfirmations(
          payment.topoHeight,
          currentTopoHeight
        );
        if (confirmations >= invoice.requiredConfirmations) {
          const updatedPayment = { ...payment, confirmations, status: "confirmed" as const };
          this.emit("paymentConfirmed", invoice.id, updatedPayment);

          // Check if all payments confirmed and total met
          if (invoice.amountReceived >= invoice.amount) {
            const allConfirmed = invoice.payments.every(
              (p) =>
                p.txid === payment.txid
                  ? true // this one is now confirmed
                  : p.status === "confirmed"
            );
            if (allConfirmed) {
              this.emit("invoiceCompleted", invoice.id);
            }
          }
        }
      }
    }
  }

  /**
   * Update confirmations for an already-tracked payment.
   */
  private updatePaymentConfirmations(
    invoice: Invoice,
    entry: TransferEntry,
    currentTopoHeight: number
  ): void {
    const payment = invoice.payments.find((p) => p.txid === entry.txid);
    if (payment && payment.status === "confirming") {
      const confirmations = calculateConfirmations(
        entry.topoheight,
        currentTopoHeight
      );
      if (confirmations >= invoice.requiredConfirmations) {
        const updatedPayment = { ...payment, confirmations, status: "confirmed" as const };
        this.emit("paymentConfirmed", invoice.id, updatedPayment);
      }
    }
  }

  /**
   * Convert a wallet transfer entry to a Payment object.
   */
  private entryToPayment(
    entry: TransferEntry,
    currentTopoHeight: number,
    requiredConfirmations: number
  ): Payment {
    const confirmations = calculateConfirmations(
      entry.topoheight,
      currentTopoHeight
    );

    return {
      txid: entry.txid,
      amount: BigInt(entry.amount),
      height: entry.height,
      topoHeight: entry.topoheight,
      confirmations,
      status: confirmations >= requiredConfirmations ? "confirmed" : "confirming",
      detectedAt: new Date().toISOString(),
      destinationPort: BigInt(entry.destination_port),
    };
  }
}
