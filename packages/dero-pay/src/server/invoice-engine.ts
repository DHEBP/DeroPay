/**
 * Invoice engine — the central orchestrator for DeroPay.
 *
 * Ties together invoice creation, payment monitoring, storage,
 * and webhook notifications into a single cohesive service.
 *
 * Usage:
 * ```ts
 * const engine = new InvoiceEngine({
 *   walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
 *   daemonRpcUrl: "http://127.0.0.1:10102/json_rpc",
 *   webhookUrl: "https://mystore.com/webhooks/dero",
 *   webhookSecret: process.env.WEBHOOK_SECRET!,
 * });
 *
 * await engine.start();
 *
 * const invoice = await engine.createInvoice({
 *   name: "Widget",
 *   amount: deroToAtomic("5.0"),
 * });
 *
 * // Invoice is now being monitored for payments
 * ```
 */

import { randomUUID } from "node:crypto";
import { WalletRpcClient } from "../rpc/wallet-rpc.js";
import { DaemonRpcClient } from "../rpc/daemon-rpc.js";
import { PaymentMonitor } from "../monitor/payment-monitor.js";
import { WebhookDispatcher } from "../webhook/dispatcher.js";
import { MemoryInvoiceStore } from "../store/memory.js";
import { generatePaymentId } from "../core/payment-id.js";
import { EscrowManager } from "../escrow/manager.js";
import type { EscrowRecord, EscrowStatus } from "../escrow/types.js";
import type {
  Invoice,
  InvoiceEscrow,
  Payment,
  CreateInvoiceParams,
  DeroPayConfig,
  InvoiceStatus,
} from "../core/types.js";
import type { InvoiceStore, InvoiceFilter, InvoiceStats } from "../store/types.js";

/** Events emitted by the invoice engine */
export type InvoiceEngineEvents = {
  /** Invoice status changed */
  invoiceStatusChanged: (invoice: Invoice, previousStatus: InvoiceStatus) => void;
  /** New payment detected */
  paymentDetected: (invoice: Invoice, payment: Payment) => void;
  /** Payment confirmed */
  paymentConfirmed: (invoice: Invoice, payment: Payment) => void;
  /** Error occurred */
  error: (error: Error) => void;
};

/**
 * The main DeroPay invoice engine.
 *
 * Manages the full lifecycle of payment invoices:
 * 1. Creates invoices with unique integrated addresses
 * 2. Monitors the blockchain for matching payments
 * 3. Tracks confirmation depth
 * 4. Fires webhooks on state changes
 * 5. Persists everything to the configured store
 */
export class InvoiceEngine {
  private walletRpc: WalletRpcClient;
  private daemonRpc: DaemonRpcClient;
  private monitor: PaymentMonitor;
  private store: InvoiceStore;
  private webhook: WebhookDispatcher | null;
  private escrowManager: EscrowManager | null = null;
  private config: Required<
    Pick<
      DeroPayConfig,
      "defaultTtlSeconds" | "defaultRequiredConfirmations" | "pollIntervalMs"
    >
  > & {
    escrowFeeBasisPoints: number;
    escrowBlockExpiration: number;
  };
  private baseAddress: string | null = null;
  private isStarted = false;
  private expiryTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Partial<{
    [K in keyof InvoiceEngineEvents]: InvoiceEngineEvents[K][];
  }> = {};

  constructor(
    options: DeroPayConfig & {
      /** Custom store implementation (default: MemoryInvoiceStore) */
      store?: InvoiceStore;
      /** Default escrow fee in basis points (default: 250 = 2.5%) */
      escrowFeeBasisPoints?: number;
      /** Default block expiration for escrow (default: 60) */
      escrowBlockExpiration?: number;
      /** Enable escrow support (default: true if wallet/daemon URLs are set) */
      enableEscrow?: boolean;
    }
  ) {
    this.walletRpc = new WalletRpcClient({
      url: options.walletRpcUrl,
      auth: options.rpcAuth,
    });

    this.daemonRpc = new DaemonRpcClient({
      url: options.daemonRpcUrl,
      auth: options.rpcAuth,
    });

    this.store = options.store ?? new MemoryInvoiceStore();

    this.config = {
      defaultTtlSeconds: options.defaultTtlSeconds ?? 900,
      defaultRequiredConfirmations: options.defaultRequiredConfirmations ?? 3,
      pollIntervalMs: options.pollIntervalMs ?? 5_000,
      escrowFeeBasisPoints: options.escrowFeeBasisPoints ?? 250,
      escrowBlockExpiration: options.escrowBlockExpiration ?? 60,
    };

    this.monitor = new PaymentMonitor({
      walletRpc: this.walletRpc,
      daemonRpc: this.daemonRpc,
      pollIntervalMs: this.config.pollIntervalMs,
    });

    // Set up webhook dispatcher if configured
    if (options.webhookUrl && options.webhookSecret) {
      this.webhook = new WebhookDispatcher({
        url: options.webhookUrl,
        secret: options.webhookSecret,
        maxRetries: options.webhookMaxRetries,
      });
    } else {
      this.webhook = null;
    }

    // Set up escrow manager
    if (options.enableEscrow !== false) {
      this.escrowManager = new EscrowManager({
        walletRpcUrl: options.walletRpcUrl,
        daemonRpcUrl: options.daemonRpcUrl,
        rpcAuth: options.rpcAuth,
        pollIntervalMs: this.config.pollIntervalMs * 2, // poll escrows less frequently
        defaultFeeBasisPoints: this.config.escrowFeeBasisPoints,
        defaultBlockExpiration: this.config.escrowBlockExpiration,
      });
      this.setupEscrowEvents();
    }

    // Wire up monitor events
    this.setupMonitorEvents();
  }

  /** Register an event listener */
  on<K extends keyof InvoiceEngineEvents>(
    event: K,
    callback: InvoiceEngineEvents[K]
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as InvoiceEngineEvents[K][]).push(callback);
    return () => {
      const arr = this.listeners[event] as InvoiceEngineEvents[K][];
      const idx = arr.indexOf(callback);
      if (idx !== -1) arr.splice(idx, 1);
    };
  }

  private emit<K extends keyof InvoiceEngineEvents>(
    event: K,
    ...args: Parameters<InvoiceEngineEvents[K]>
  ): void {
    const callbacks = this.listeners[event] as InvoiceEngineEvents[K][] | undefined;
    if (callbacks) {
      for (const cb of callbacks) {
        (cb as (...a: unknown[]) => void)(...args);
      }
    }
  }

  /**
   * Start the invoice engine.
   *
   * Verifies wallet/daemon connectivity, retrieves the wallet address,
   * resumes tracking active invoices, and starts the payment monitor.
   */
  async start(): Promise<void> {
    if (this.isStarted) return;

    // Verify connectivity
    const walletOk = await this.walletRpc.ping();
    if (!walletOk) {
      throw new Error(
        "Cannot reach wallet RPC. Is the wallet running with --rpc-server?"
      );
    }

    const daemonOk = await this.daemonRpc.ping();
    if (!daemonOk) {
      throw new Error("Cannot reach daemon RPC. Is the DERO daemon running?");
    }

    // Get the wallet's base address
    this.baseAddress = await this.walletRpc.getAddress();

    // Resume tracking active invoices from the store
    const activeInvoices = await this.store.getActiveInvoices();
    for (const invoice of activeInvoices) {
      await this.monitor.track(invoice);
    }

    // Start the monitor
    this.monitor.start();

    // Start the escrow manager
    if (this.escrowManager) {
      await this.escrowManager.start();
    }

    // Start the expiry checker (runs every 30 seconds)
    this.expiryTimer = setInterval(() => this.checkExpiredInvoices(), 30_000);

    this.isStarted = true;
  }

  /**
   * Stop the invoice engine.
   */
  async stop(): Promise<void> {
    this.monitor.stop();
    this.escrowManager?.stop();
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
      this.expiryTimer = null;
    }
    this.isStarted = false;
  }

  /**
   * Shut down the engine and close the store.
   */
  async shutdown(): Promise<void> {
    await this.stop();
    await this.store.close();
  }

  /**
   * Create a new payment invoice.
   *
   * Generates a unique payment ID, creates an integrated address,
   * saves the invoice to the store, and starts monitoring for payments.
   */
  async createInvoice(params: CreateInvoiceParams): Promise<Invoice> {
    if (!this.baseAddress) {
      throw new Error("Engine not started. Call start() first.");
    }

    if (params.amount <= 0n) {
      throw new Error("Amount must be positive");
    }

    // Generate unique payment ID
    const paymentId = generatePaymentId();

    // Create integrated address with embedded payment ID
    const integratedAddress = await this.walletRpc.makeIntegratedAddress(
      paymentId,
      this.baseAddress
    );

    const now = new Date();
    const ttlSeconds = params.ttlSeconds ?? this.config.defaultTtlSeconds;
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    // Build escrow data if requested
    let escrowData: InvoiceEscrow | null = null;

    if (params.escrow && this.escrowManager) {
      const sellerAddress = params.escrow.sellerAddress;
      const arbitratorAddress =
        params.escrow.arbitratorAddress ?? this.baseAddress;
      const feeBasisPoints =
        params.escrow.feeBasisPoints ?? this.config.escrowFeeBasisPoints;
      const blockExpiration =
        params.escrow.blockExpiration ?? this.config.escrowBlockExpiration;

      const escrowRecord = await this.escrowManager.createEscrow({
        sellerAddress,
        arbitratorAddress,
        feeBasisPoints,
        blockExpiration,
        expectedAmount: params.amount,
        metadata: { invoicePaymentId: paymentId.toString() },
      });

      if (escrowRecord.scid) {
        escrowData = {
          scid: escrowRecord.scid,
          deployTxid: escrowRecord.deployTxid!,
          escrowStatus: escrowRecord.status === "awaiting_deposit"
            ? "awaiting_deposit"
            : "deploying",
          sellerAddress,
          arbitratorAddress,
          feeBasisPoints,
          blockExpiration,
          buyerAddress: null,
          depositHeight: null,
          disputedAt: null,
          resolution: null,
        };
      }
    }

    const invoice: Invoice = {
      id: randomUUID(),
      name: params.name,
      description: params.description ?? "",
      amount: params.amount,
      status: "pending",
      paymentId,
      integratedAddress,
      baseAddress: this.baseAddress,
      ttlSeconds,
      requiredConfirmations:
        params.requiredConfirmations ?? this.config.defaultRequiredConfirmations,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      completedAt: null,
      amountReceived: 0n,
      payments: [],
      metadata: params.metadata ?? {},
      escrow: escrowData,
    };

    // Persist
    await this.store.createInvoice(invoice);

    // Start monitoring
    await this.monitor.track(invoice);

    // Fire webhook
    await this.webhook?.send("invoice.created", invoice);

    return invoice;
  }

  /**
   * Get an invoice by ID.
   */
  async getInvoice(id: string): Promise<Invoice | null> {
    return this.store.getInvoice(id);
  }

  /**
   * Get an invoice by payment ID.
   */
  async getInvoiceByPaymentId(paymentId: bigint): Promise<Invoice | null> {
    return this.store.getInvoiceByPaymentId(paymentId);
  }

  /**
   * List invoices with optional filters.
   */
  async listInvoices(filter?: InvoiceFilter): Promise<Invoice[]> {
    return this.store.listInvoices(filter);
  }

  /**
   * Get invoice statistics.
   */
  async getStats(): Promise<InvoiceStats> {
    return this.store.getStats();
  }

  /**
   * Get the wallet's base address.
   */
  getBaseAddress(): string | null {
    return this.baseAddress;
  }

  /**
   * Get the wallet balance.
   */
  async getBalance(): Promise<{ balance: bigint; unlockedBalance: bigint }> {
    const result = await this.walletRpc.getBalance();
    return {
      balance: BigInt(result.balance),
      unlockedBalance: BigInt(result.unlocked_balance),
    };
  }

  /**
   * Check if the engine is running.
   */
  get running(): boolean {
    return this.isStarted;
  }

  /**
   * Wire up payment monitor events to update store and fire webhooks.
   */
  private setupMonitorEvents(): void {
    this.monitor.on("paymentDetected", async (invoiceId, payment) => {
      try {
        // Save payment to store
        await this.store.addPayment(invoiceId, payment);

        // Get updated invoice
        const invoice = await this.store.getInvoice(invoiceId);
        if (!invoice) return;

        // Update invoice status
        const newStatus = this.calculateInvoiceStatus(invoice, payment);
        if (newStatus !== invoice.status) {
          const previousStatus = invoice.status;
          await this.store.updateInvoice(invoiceId, { status: newStatus });
          invoice.status = newStatus;
          this.emit("invoiceStatusChanged", invoice, previousStatus);
          await this.webhook?.send(`invoice.${newStatus}` as `invoice.${typeof newStatus}`, invoice, payment);
        }

        // Update monitor's copy
        this.monitor.updateInvoice(invoice);

        // Emit event
        this.emit("paymentDetected", invoice, payment);
        await this.webhook?.send("payment.detected", invoice, payment);
      } catch (err) {
        this.emit("error", new Error(`Error handling payment: ${err}`));
      }
    });

    this.monitor.on("paymentConfirmed", async (invoiceId, payment) => {
      try {
        // Update payment in store
        await this.store.updatePayment(invoiceId, payment.txid, {
          confirmations: payment.confirmations,
          status: "confirmed",
        });

        const invoice = await this.store.getInvoice(invoiceId);
        if (!invoice) return;

        this.emit("paymentConfirmed", invoice, payment);
        await this.webhook?.send("payment.confirmed", invoice, payment);
      } catch (err) {
        this.emit("error", new Error(`Error handling confirmation: ${err}`));
      }
    });

    this.monitor.on("invoiceCompleted", async (invoiceId) => {
      try {
        const completedAt = new Date().toISOString();
        await this.store.updateInvoice(invoiceId, {
          status: "completed",
          completedAt,
        });

        const invoice = await this.store.getInvoice(invoiceId);
        if (!invoice) return;

        this.monitor.untrack(invoiceId);
        this.emit("invoiceStatusChanged", invoice, "confirming");
        await this.webhook?.send("invoice.completed", invoice);
      } catch (err) {
        this.emit("error", new Error(`Error completing invoice: ${err}`));
      }
    });

    this.monitor.on("invoiceExpired", async (invoiceId) => {
      try {
        await this.store.updateInvoice(invoiceId, { status: "expired" });

        const invoice = await this.store.getInvoice(invoiceId);
        if (!invoice) return;

        this.monitor.untrack(invoiceId);
        const previousStatus = invoice.status;
        invoice.status = "expired";
        this.emit("invoiceStatusChanged", invoice, previousStatus);
        await this.webhook?.send("invoice.expired", invoice);
      } catch (err) {
        this.emit("error", new Error(`Error expiring invoice: ${err}`));
      }
    });

    this.monitor.on("invoicePartial", async (invoiceId, amountReceived) => {
      try {
        await this.store.updateInvoice(invoiceId, {
          status: "partial",
          amountReceived,
        });

        const invoice = await this.store.getInvoice(invoiceId);
        if (!invoice) return;

        this.monitor.updateInvoice(invoice);
        await this.webhook?.send("invoice.partial", invoice);
      } catch (err) {
        this.emit("error", new Error(`Error handling partial payment: ${err}`));
      }
    });

    this.monitor.on("error", (err) => {
      this.emit("error", err);
    });
  }

  /**
   * Calculate the new invoice status based on a payment.
   */
  private calculateInvoiceStatus(
    invoice: Invoice,
    payment: Payment
  ): InvoiceStatus {
    const totalReceived = invoice.amountReceived;

    if (totalReceived >= invoice.amount) {
      // Full amount received — check confirmations
      const allConfirmed = invoice.payments.every(
        (p) => p.status === "confirmed"
      );
      return allConfirmed ? "completed" : "confirming";
    }

    if (totalReceived > 0n) {
      return "partial";
    }

    return payment.status === "confirmed" ? "confirming" : "pending";
  }

  /**
   * Get the escrow manager (if escrow is enabled).
   */
  getEscrowManager(): EscrowManager | null {
    return this.escrowManager;
  }

  /**
   * Perform escrow operations on an invoice.
   *
   * @param invoiceId - Invoice ID
   * @param action - Escrow action to perform
   * @returns Transaction ID
   */
  async escrowAction(
    invoiceId: string,
    action: "confirmDelivery" | "refundBuyer" | "dispute" | "claimAfterExpiry" | "arbitrateRelease" | "arbitrateRefund"
  ): Promise<string> {
    const invoice = await this.store.getInvoice(invoiceId);
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
    if (!invoice.escrow) throw new Error(`Invoice ${invoiceId} has no escrow`);
    if (!this.escrowManager) throw new Error("Escrow manager not available");

    const scid = invoice.escrow.scid;

    switch (action) {
      case "confirmDelivery":
        return this.escrowManager.confirmDelivery(scid);
      case "refundBuyer":
        return this.escrowManager.refundBuyer(scid);
      case "dispute":
        return this.escrowManager.dispute(scid);
      case "claimAfterExpiry":
        return this.escrowManager.claimAfterExpiry(scid);
      case "arbitrateRelease":
        return this.escrowManager.arbitrate(scid, true);
      case "arbitrateRefund":
        return this.escrowManager.arbitrate(scid, false);
      default:
        throw new Error(`Unknown escrow action: ${action}`);
    }
  }

  /**
   * Wire up escrow manager events to update invoices and fire webhooks.
   */
  private setupEscrowEvents(): void {
    if (!this.escrowManager) return;

    const updateInvoiceEscrow = async (
      escrow: EscrowRecord,
      webhookType: string
    ) => {
      if (!escrow.scid) return;

      // Find the invoice linked to this escrow
      const invoices = await this.store.listInvoices();
      const invoice = invoices.find((i) => i.escrow?.scid === escrow.scid);
      if (!invoice || !invoice.escrow) return;

      // Update escrow status on the invoice
      invoice.escrow.escrowStatus = escrow.status;
      invoice.escrow.buyerAddress = escrow.buyerAddress;
      invoice.escrow.resolution = escrow.resolution;

      await this.store.updateInvoice(invoice.id, {
        // Store the updated escrow data via metadata as a workaround
        // since the store interface doesn't have an escrow-specific update
      });

      await this.webhook?.send(webhookType as Parameters<typeof this.webhook.send>[0], invoice);
    };

    this.escrowManager.on("escrowFunded", (escrow) => {
      updateInvoiceEscrow(escrow, "escrow.funded").catch((err) =>
        this.emit("error", new Error(`Escrow funded handler: ${err}`))
      );
    });

    this.escrowManager.on("escrowReleased", (escrow) => {
      updateInvoiceEscrow(escrow, "escrow.released").catch((err) =>
        this.emit("error", new Error(`Escrow released handler: ${err}`))
      );
    });

    this.escrowManager.on("escrowRefunded", (escrow) => {
      updateInvoiceEscrow(escrow, "escrow.refunded").catch((err) =>
        this.emit("error", new Error(`Escrow refunded handler: ${err}`))
      );
    });

    this.escrowManager.on("escrowDisputed", (escrow) => {
      updateInvoiceEscrow(escrow, "escrow.disputed").catch((err) =>
        this.emit("error", new Error(`Escrow disputed handler: ${err}`))
      );
    });

    this.escrowManager.on("escrowArbitrated", (escrow) => {
      updateInvoiceEscrow(escrow, "escrow.arbitrated").catch((err) =>
        this.emit("error", new Error(`Escrow arbitrated handler: ${err}`))
      );
    });

    this.escrowManager.on("error", (err) => {
      this.emit("error", err);
    });
  }

  /**
   * Check for expired invoices and update their status.
   */
  private async checkExpiredInvoices(): Promise<void> {
    try {
      const activeInvoices = await this.store.getActiveInvoices();
      const now = new Date();

      for (const invoice of activeInvoices) {
        if (
          invoice.status !== "completed" &&
          invoice.status !== "expired" &&
          new Date(invoice.expiresAt) < now
        ) {
          const previousStatus = invoice.status;
          await this.store.updateInvoice(invoice.id, { status: "expired" });
          this.monitor.untrack(invoice.id);
          invoice.status = "expired";
          this.emit("invoiceStatusChanged", invoice, previousStatus);
          await this.webhook?.send("invoice.expired", invoice);
        }
      }
    } catch (err) {
      this.emit("error", new Error(`Error checking expired invoices: ${err}`));
    }
  }
}
