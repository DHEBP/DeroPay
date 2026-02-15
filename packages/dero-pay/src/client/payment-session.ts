/**
 * Client-side payment session for tracking invoice status.
 *
 * Used on the customer's payment page to poll the DeroPay server
 * for real-time invoice status updates (amount received, confirmations,
 * completion).
 */

import type { Invoice, InvoiceStatus } from "../core/types.js";

/** Payment session events */
export type PaymentSessionEvents = {
  /** Invoice status changed */
  statusChanged: (status: InvoiceStatus, invoice: Invoice) => void;
  /** Payment was detected */
  paymentDetected: (invoice: Invoice) => void;
  /** Invoice is fully paid and confirmed */
  completed: (invoice: Invoice) => void;
  /** Invoice expired */
  expired: (invoice: Invoice) => void;
  /** Error occurred */
  error: (error: Error) => void;
};

/**
 * Client-side payment session that polls the server for invoice status.
 *
 * Usage:
 * ```ts
 * const session = new PaymentSession({
 *   invoiceId: "abc-123",
 *   statusEndpoint: "/api/pay/status",
 * });
 *
 * session.on("completed", (invoice) => {
 *   // Redirect to success page
 *   window.location.href = "/order/success";
 * });
 *
 * session.start();
 * ```
 */
export class PaymentSession {
  private invoiceId: string;
  private statusEndpoint: string;
  private pollIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private lastStatus: InvoiceStatus | null = null;
  private listeners: Partial<{
    [K in keyof PaymentSessionEvents]: PaymentSessionEvents[K][];
  }> = {};

  constructor(options: {
    /** Invoice ID to track */
    invoiceId: string;
    /** Server endpoint that returns invoice status */
    statusEndpoint?: string;
    /** Polling interval in ms (default: 3000) */
    pollIntervalMs?: number;
  }) {
    this.invoiceId = options.invoiceId;
    this.statusEndpoint = options.statusEndpoint ?? "/api/pay/status";
    this.pollIntervalMs = options.pollIntervalMs ?? 3_000;
  }

  /** Register an event listener */
  on<K extends keyof PaymentSessionEvents>(
    event: K,
    callback: PaymentSessionEvents[K]
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as PaymentSessionEvents[K][]).push(callback);
    return () => {
      const arr = this.listeners[event] as PaymentSessionEvents[K][];
      const idx = arr.indexOf(callback);
      if (idx !== -1) arr.splice(idx, 1);
    };
  }

  private emit<K extends keyof PaymentSessionEvents>(
    event: K,
    ...args: Parameters<PaymentSessionEvents[K]>
  ): void {
    const callbacks = this.listeners[event] as PaymentSessionEvents[K][] | undefined;
    if (callbacks) {
      for (const cb of callbacks) {
        (cb as (...a: unknown[]) => void)(...args);
      }
    }
  }

  /** Start polling for status updates */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  /** Stop polling */
  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Get the last known status */
  getLastStatus(): InvoiceStatus | null {
    return this.lastStatus;
  }

  private async poll(): Promise<void> {
    try {
      const url = `${this.statusEndpoint}?invoiceId=${encodeURIComponent(this.invoiceId)}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Status check failed: HTTP ${response.status}`);
      }

      const invoice = (await response.json()) as Invoice;

      // Deserialize BigInt fields that come as strings from JSON
      invoice.amount = BigInt(invoice.amount);
      invoice.amountReceived = BigInt(invoice.amountReceived);
      invoice.paymentId = BigInt(invoice.paymentId);
      if (invoice.payments) {
        for (const p of invoice.payments) {
          p.amount = BigInt(p.amount);
          p.destinationPort = BigInt(p.destinationPort);
        }
      }

      // Detect status changes
      if (this.lastStatus !== invoice.status) {
        const previousStatus = this.lastStatus;
        this.lastStatus = invoice.status;

        this.emit("statusChanged", invoice.status, invoice);

        // Emit specific events
        if (
          previousStatus !== null &&
          (invoice.status === "confirming" || invoice.status === "partial")
        ) {
          this.emit("paymentDetected", invoice);
        }

        if (invoice.status === "completed") {
          this.emit("completed", invoice);
          this.stop(); // Stop polling once completed
        }

        if (invoice.status === "expired") {
          this.emit("expired", invoice);
          this.stop(); // Stop polling once expired
        }
      }
    } catch (err) {
      this.emit(
        "error",
        err instanceof Error ? err : new Error("Unknown polling error")
      );
    }
  }
}
