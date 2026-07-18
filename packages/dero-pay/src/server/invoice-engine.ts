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
import type { EscrowClaimGuard } from "../escrow/manager.js";
import type { EscrowRecord, EscrowStatus } from "../escrow/types.js";
import type {
  Invoice,
  InvoiceEscrow,
  Payment,
  CreateInvoiceParams,
  DeroPayConfig,
  InvoiceStatus,
  EscrowInvoiceStatus,
} from "../core/types.js";
import type { InvoiceStore, InvoiceFilter, InvoiceStats } from "../store/types.js";
import type { WebhookSink } from "../webhook/outbox-types.js";

export type X402AuditEventType =
  | "x402.challenge_issued"
  | "x402.receipt_issued"
  | "x402.receipt_used"
  | "x402.receipt_rejected";

export type X402AuditEvent = {
  type: X402AuditEventType;
  timestamp: string;
  resource?: string;
  invoiceId?: string;
  jti?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

/** Events emitted by the invoice engine */
export type InvoiceEngineEvents = {
  /** Invoice status changed */
  invoiceStatusChanged: (invoice: Invoice, previousStatus: InvoiceStatus) => void;
  /** New payment detected */
  paymentDetected: (invoice: Invoice, payment: Payment) => void;
  /** Payment confirmed */
  paymentConfirmed: (invoice: Invoice, payment: Payment) => void;
  /** x402 payment lifecycle audit event */
  x402Audit: (event: X402AuditEvent) => void;
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
  private webhookSink: WebhookSink | null = null;
  private escrowManager: EscrowManager | null = null;
  private config: Required<
    Pick<
      DeroPayConfig,
      "defaultTtlSeconds" | "defaultRequiredConfirmations" | "pollIntervalMs"
    >
  > & {
    escrowFeeBasisPoints: number;
    escrowBlockExpiration: number;
    escrowMaxAutoRequotes: number;
    escrowRequoteCooldownMs: number;
  };
  private baseAddress: string | null = null;
  private isStarted = false;
  /** O4 — set when the caller declares a multi-process deployment; drives the
   *  durable-claim-guard startup assertion. */
  private multiProcess = false;
  private expiryTimer: ReturnType<typeof setInterval> | null = null;
  /** O15c — re-entrancy guard so a slow reconcile pass never stacks on the next
   *  tick of the engine's expiry timer (the reconciler is idempotent via its CAS
   *  gates, but overlapping passes would waste RPC and could interleave releases). */
  private reconcileInFlight = false;
  private listeners: Partial<{
    [K in keyof InvoiceEngineEvents]: InvoiceEngineEvents[K][];
  }> = {};

  constructor(
    options: DeroPayConfig & {
      /** Custom store implementation (default: MemoryInvoiceStore) */
      store?: InvoiceStore;
      /** Default escrow fee in basis points (default: 250 = 2.5%) */
      escrowFeeBasisPoints?: number;
      /** Default block expiration for escrow (default: 9600 ~= 2 days at ~18s/block; must be >= 4000) */
      escrowBlockExpiration?: number;
      /** Enable escrow support (default: false — must be explicitly opted into) */
      enableEscrow?: boolean;
      /**
       * O4 — declare that this engine runs in a MULTI-PROCESS deployment
       * (cluster / PM2 / multiple pods sharing one store). When true and escrow
       * is enabled, start() HARD-FAILS unless the store provides a DURABLE
       * (cross-process) claim guard. This turns the silent fail-open — a
       * clustered server on the memory store, or any store whose createClaimGuard
       * yields a process-local guard, gets N independent guards and N deploys —
       * into a loud startup error. Default false (single-process); a single
       * process is safe with the in-memory guard.
       */
      multiProcess?: boolean;
      /**
       * Max number of AUTOMATIC re-quotes a single invoice may receive after
       * CancelUnfunded races (O13 amplifier guard). Once hit, the invoice is
       * parked in a terminal alert state instead of looping. Default: 3.
       */
      escrowMaxAutoRequotes?: number;
      /**
       * Minimum wall-clock gap between automatic re-quotes of the same invoice
       * (O13 amplifier guard). Requote events arriving sooner are dropped.
       * Default: 60_000 ms.
       */
      escrowRequoteCooldownMs?: number;
      /** Inject RPC clients (for testing); when set, walletRpcUrl/daemonRpcUrl are ignored */
      walletRpc?: WalletRpcClient;
      daemonRpc?: DaemonRpcClient;
      /**
       * Opt-in durable webhook sink (the DeroPay Bridge). When provided, every
       * state-changing payment/invoice transition is routed through the sink's
       * transactional, deterministic-id, durable-outbox path instead of the
       * in-memory WebhookDispatcher. When omitted, the engine behaves exactly as
       * before (the default no-sink path is byte-identical — the regression gate).
       */
      webhookSink?: WebhookSink;
    }
  ) {
    this.walletRpc =
      options.walletRpc ??
      new WalletRpcClient({
        url: options.walletRpcUrl,
        auth: options.rpcAuth,
      });

    this.daemonRpc =
      options.daemonRpc ??
      new DaemonRpcClient({
        url: options.daemonRpcUrl,
        auth: options.rpcAuth,
      });

    this.store = options.store ?? new MemoryInvoiceStore();

    this.config = {
      defaultTtlSeconds: options.defaultTtlSeconds ?? 900,
      defaultRequiredConfirmations: options.defaultRequiredConfirmations ?? 3,
      pollIntervalMs: options.pollIntervalMs ?? 5_000,
      escrowFeeBasisPoints: options.escrowFeeBasisPoints ?? 250,
      // ~2 days at ~18s/block. Must clear the on-chain 4000-block floor and give
      // a human buyer a realistic window to dispute before ClaimAfterExpiry.
      escrowBlockExpiration: options.escrowBlockExpiration ?? 9600,
      escrowMaxAutoRequotes: options.escrowMaxAutoRequotes ?? 3,
      escrowRequoteCooldownMs: options.escrowRequoteCooldownMs ?? 60_000,
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

    this.webhookSink = options.webhookSink ?? null;

    this.multiProcess = options.multiProcess === true;

    // Set up escrow manager (opt-in: must be explicitly enabled)
    if (options.enableEscrow === true) {
      this.escrowManager = new EscrowManager({
        walletRpc: options.walletRpc ?? undefined,
        daemonRpc: options.daemonRpc ?? undefined,
        walletRpcUrl: options.walletRpcUrl,
        daemonRpcUrl: options.daemonRpcUrl,
        rpcAuth: options.rpcAuth,
        pollIntervalMs: this.config.pollIntervalMs * 2, // poll escrows less frequently
        defaultFeeBasisPoints: this.config.escrowFeeBasisPoints,
        defaultBlockExpiration: this.config.escrowBlockExpiration,
        // Durable claim guard from the store (if it provides one) so a
        // multi-process server cannot double-claim a quote at the claim window.
        claimGuard: this.store.createClaimGuard?.(),
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
      // O4 — a multi-process deployment MUST use a durable (cross-process) claim
      // guard. A process-local guard (memory store, or a store whose
      // createClaimGuard yields a per-process guard) gives each worker its own
      // guard, so N workers win N claims and deploy N contracts — silently. Fail
      // LOUD at startup rather than fail open at the claim window.
      if (this.multiProcess) {
        const guard = this.escrowManager.getClaimGuard();
        if (!guard) {
          throw new Error(
            "multiProcess=true but the store provides no escrow claim guard " +
              "(createClaimGuard is absent). A clustered server would double-deploy " +
              "escrows. Use a durable store (e.g. SqliteInvoiceStore) or run single-process."
          );
        }
        if (!guard.durable) {
          throw new Error(
            "multiProcess=true but the escrow claim guard is process-local " +
              "(durable=false, e.g. the in-memory guard). Each worker would hold an " +
              "independent guard and double-deploy escrows. Use a durable store " +
              "(e.g. SqliteInvoiceStore) or run single-process."
          );
        }
      } else {
        // O4 (default-safe) — not declared multiProcess, but a process-local
        // guard is only safe for a SINGLE process. There is no portable way to
        // detect sibling workers, so this cannot be auto-enforced; warn LOUD so a
        // clustered memory-store deployment is never SILENTLY unprotected.
        const guard = this.escrowManager.getClaimGuard();
        if (guard && !guard.durable) {
          console.warn(
            "[dero-pay] escrow claim guard is process-local (durable=false). " +
              "Safe for a SINGLE process only — a clustered/multi-worker deployment " +
              "will double-deploy escrows. For clusters use a durable store " +
              "(e.g. SqliteInvoiceStore) and set multiProcess=true."
          );
        }
      }
      await this.escrowManager.start();
      // O15 — REHYDRATE in-flight escrows before the poll loop runs. The escrow
      // manager holds records purely in-memory; a bare start() begins polling an
      // EMPTY map, so after any restart/crash/deploy every awaiting_deposit /
      // funded / disputed escrow stops being reconciled — real locked DERO goes
      // untracked, no escrowFunded/Released/Arbitrated event ever fires again,
      // and the invoice never maps to its terminal state. Reload the persisted
      // escrow bindings from the invoice store back into the poller.
      await this.rehydrateEscrows();
    }

    // Start the expiry checker (runs every 30 seconds). PREMINT: no periodic
    // orphaned-claim reconcile — the broadcast-ambiguous deploy quarantine it healed
    // can no longer occur (mint is empty + off the terms path; Bind is a normal
    // invoke), so there is nothing to sweep.
    this.expiryTimer = setInterval(() => {
      this.checkExpiredInvoices();
    }, 30_000);

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

    // Capture the daemon BLOCK height at creation so a restart can re-anchor
    // the wallet-scan floor for a not-yet-paid invoice (the scan floor filters
    // block height; no payment can predate creation). Best-effort: if the
    // daemon is briefly unreachable we leave it undefined and fall back to the
    // current-height anchor — the failure that only re-introduces the original
    // window, never worse.
    let createdBlockHeight: number | undefined;
    try {
      createdBlockHeight = await this.daemonRpc.getBlockHeight();
    } catch {
      createdBlockHeight = undefined;
    }

    // Build escrow data if requested
    let escrowData: InvoiceEscrow | null = null;

    if (params.escrow && this.escrowManager) {
      const sellerAddress = params.escrow.sellerAddress;

      // Arbitrator must be explicit — no silent platform default. Refereeing a
      // dispute the platform also collects a fee on is a liability/conflict, so
      // arbitrator == platform owner is rejected unless explicitly opted into.
      const arbitratorAddress = params.escrow.arbitratorAddress;
      if (!arbitratorAddress) {
        throw new Error(
          "escrow.arbitratorAddress is required (no default). Set a distinct arbitrator, or pass allowSelfArbitration: true to knowingly self-arbitrate."
        );
      }
      if (
        !params.escrow.allowSelfArbitration &&
        this.baseAddress &&
        arbitratorAddress === this.baseAddress
      ) {
        throw new Error(
          "arbitrator == platform owner/fee-recipient (self-arbitration). Use a distinct arbitrator, or pass allowSelfArbitration: true to override."
        );
      }

      // Collusion guard: the arbitrator is the buyer's ONLY protection once
      // funded, so it must never be a party to the trade. A seller-as-arbitrator
      // would self-release every dispute (Arbitrate(1) pays the seller), making
      // Dispute() a no-op; a buyer-as-arbitrator would self-refund. This is NOT
      // opt-out-able (unlike self-arbitration by the platform, which is at least
      // a neutral-ish third party) — a trade party refereeing its own dispute is
      // never acceptable. Also enforced on-chain in Initialize (lines 29-31).
      // arbitrator == seller is checkable now (both known at quote time). The
      // buyer isn't bound until claimEscrowInvoice(), so arbitrator == buyer and
      // seller == buyer are enforced there (manager.claimEscrow) and on-chain in
      // Initialize (lines 29-31) as the authoritative backstop.
      if (arbitratorAddress === sellerAddress) {
        throw new Error(
          "arbitrator == seller. A seller cannot arbitrate their own dispute; the buyer's dispute path would be a no-op. Use a distinct, neutral arbitrator."
        );
      }

      const feeBasisPoints =
        params.escrow.feeBasisPoints ?? this.config.escrowFeeBasisPoints;
      const blockExpiration =
        params.escrow.blockExpiration ?? this.config.escrowBlockExpiration;

      // Phase 1: QUOTE only — no buyer, no on-chain deploy. The escrow contract
      // is deployed later by claimEscrowInvoice(), once a proven buyer address
      // is bound. This structurally closes the deposit front-run.
      const escrowRecord = await this.escrowManager.createEscrowQuote({
        sellerAddress,
        arbitratorAddress,
        feeBasisPoints,
        blockExpiration,
        expectedAmount: params.amount,
        metadata: { invoicePaymentId: paymentId.toString() },
      });

      escrowData = {
        escrowId: escrowRecord.id,
        scid: null,
        deployTxid: null,
        escrowStatus: "quoted",
        // O14/O3 — freeze the quote-time principal so the drift guard has a real
        // anchor on every worker, not a value re-derived from invoice.amount.
        escrowAmount: params.amount.toString(),
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
      createdBlockHeight,
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
   * Get the underlying invoice store.
   */
  getStore(): InvoiceStore {
    return this.store;
  }

  /**
   * Emit a structured x402 audit event for observability and monitoring.
   */
  emitX402AuditEvent(event: Omit<X402AuditEvent, "timestamp"> & { timestamp?: string }): void {
    this.emit("x402Audit", {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    });
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
        if (this.webhookSink) {
          // Bridge path: the sink OWNS the write — single in-tx bigint re-sum
          // (sole writer of amount_received), status decision on the committed
          // total, and durable outbox enqueue, all atomic. No legacy
          // store.addPayment / store.updateInvoice / webhook.send here.
          await this.webhookSink.onPaymentDetected(invoiceId, payment);
          const invoice = await this.store.getInvoice(invoiceId);
          if (invoice) {
            this.monitor.updateInvoice(invoice);
            this.emit("paymentDetected", invoice, payment);
          }
          return;
        }

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
          // O20 — a misrouted base payment to an escrow invoice must not leave a
          // live escrow contract that a later correct Deposit could fund,
          // overwriting the misroute flag and settling the invoice while the
          // merchant silently keeps the orphaned base funds (a silent double
          // charge). Tear down the still-open escrow binding on misroute: cancel
          // the deployed status-0 contract (CancelUnfunded — it holds 0) and drop
          // the quote, so no Deposit can ever land against this invoice again.
          // The invoice STAYS in misrouted_to_base as the authoritative alert
          // (reconciliation/refund is a merchant out-of-band action on the base
          // funds; there is no escrow to refund from).
          if (newStatus === "misrouted_to_base" && invoice.escrow) {
            await this.teardownEscrowOnMisroute(invoice).catch((err) =>
              this.emit(
                "error",
                new Error(`Escrow teardown on misroute failed: ${err}`)
              )
            );
          }
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
        // Update payment in store (both paths need the confirmed status so the
        // completion decision can observe it).
        await this.store.updatePayment(invoiceId, payment.txid, {
          confirmations: payment.confirmations,
          status: "confirmed",
        });

        const invoice = await this.store.getInvoice(invoiceId);
        if (!invoice) return;

        this.emit("paymentConfirmed", invoice, payment);

        if (this.webhookSink) {
          // Bridge path: decide completion on BOTH edges (invariant 3). The
          // sink re-reads store-authoritative totals and enqueues the
          // confirmation-edge status event durably.
          await this.webhookSink.onPaymentConfirmed(invoiceId, payment.txid);
          return;
        }

        await this.webhook?.send("payment.confirmed", invoice, payment);
      } catch (err) {
        this.emit("error", new Error(`Error handling confirmation: ${err}`));
      }
    });

    this.monitor.on("invoiceCompleted", async (invoiceId) => {
      try {
        // Bridge path: the monitor's completion signal is ADVISORY only. The
        // store-authoritative completion was already decided + enqueued on the
        // detection/confirmation edge by the sink (invariants 2/3). We only need
        // to stop tracking; we must NOT write status from monitor memory.
        if (this.webhookSink) {
          const invoice = await this.store.getInvoice(invoiceId);
          if (invoice && invoice.status === "completed") {
            this.monitor.untrack(invoiceId);
          }
          return;
        }

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
        // Payment-aware expiry (invariant 6), enforced on STORE-authoritative
        // state — the monitor's in-memory amount can be stale (the sink writes
        // amount_received to the store, not to monitor memory). Never expire a
        // funded invoice out from under an in-flight settlement; keep tracking
        // it so confirmations keep accruing.
        const current = await this.store.getInvoice(invoiceId);
        if (!current) return;
        if (current.amountReceived > 0n || current.payments.length > 0) {
          this.monitor.updateInvoice(current); // refresh monitor's stale copy
          return;
        }
        // Never expire an escrow invoice on the integrated-address clock once it
        // has deployed a contract or been funded — settlement runs on the escrow
        // rail with its own on-chain expiry window (blockExpiration). Expiring it
        // here would strand DERO locked in the escrow SC.
        if (this.isEscrowSettling(current)) {
          this.monitor.untrack(invoiceId);
          return;
        }

        if (this.webhookSink) {
          // Bridge path: enqueue a durable terminal invoice.expired whose frozen
          // payload carries any partial amount.
          const previousStatus = current.status;
          await this.webhookSink.onInvoiceExpired(invoiceId);
          this.monitor.untrack(invoiceId);
          const invoice = await this.store.getInvoice(invoiceId);
          if (invoice) this.emit("invoiceStatusChanged", invoice, previousStatus);
          return;
        }

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
        // Bridge path (O34): the monitor's in-memory `amountReceived` is a
        // SECOND, stale, non-bigint writer of amount_received and must NEVER be
        // written. In sink mode the partial status+amount were already decided
        // and enqueued by the sink on the detection edge from the committed
        // in-tx bigint total. This handler is advisory-only here.
        if (this.webhookSink) return;

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
    // Escrow-backed invoices are settled through the escrow SCID (Deposit ->
    // ConfirmDelivery/ClaimAfterExpiry/Arbitrate), NOT the integrated-address
    // rail. A payment that lands on the integrated address of an escrow invoice
    // is a buyer routing error: those funds hit the merchant's base wallet with
    // zero escrow protection and must NEVER be allowed to drive the invoice to
    // confirming/completed (which would tell the merchant to ship with nothing
    // in escrow). Flag it for reconciliation instead of settling. Escrow invoice
    // completion is driven exclusively by escrow lifecycle events
    // (onEscrowFunded / escrow released|expired_claimed|arbitrated).
    if (invoice.escrow) {
      return "misrouted_to_base";
    }

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
   * True once an invoice's escrow has left the pre-deploy stage — i.e. a
   * contract exists on-chain (awaiting_deposit) or funds are locked/settling.
   * Such invoices must NOT be expired on the integrated-address TTL clock; they
   * settle on the escrow contract's own on-chain window. A still-quoted (or
   * deploy_failed / cancelled) escrow has no on-chain funds and may expire
   * normally on the base rail.
   */
  private isEscrowSettling(invoice: Invoice): boolean {
    const s = invoice.escrow?.escrowStatus;
    if (!s) return false;
    return (
      s === "awaiting_deposit" ||
      s === "funded" ||
      s === "disputed" ||
      s === "deploying"
    );
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
  /**
   * Bind a proven buyer to a QUOTED escrow invoice and deploy the contract.
   *
   * `buyerAddress` MUST come from an authenticated / wallet-connect source —
   * binding an unproven address would let refunds and dispute payouts go to
   * the wrong party. On success the invoice's escrow gains its scid/deployTxid
   * and moves to "awaiting_deposit".
   */
  async claimEscrowInvoice(
    invoiceId: string,
    buyerAddress: string
  ): Promise<Invoice> {
    let invoice = await this.store.getInvoice(invoiceId);
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
    if (!invoice.escrow) throw new Error(`Invoice ${invoiceId} has no escrow`);
    if (!this.escrowManager) throw new Error("Escrow manager not available");
    // O19 — a deploy_failed escrow is RECOVERABLE, not a dead end. A deploy can
    // fail transiently (installSc RPC timeout — the very case the A15 lease models
    // — daemon eviction/rejection, momentarily empty gas wallet). The old code
    // durably stamped 'deploy_failed' and the entry gate below rejected everything
    // not 'quoted', so a proven buyer whose deploy merely blipped was stranded
    // forever with no retry surface. Instead: on a fresh proven-buyer claim against
    // a deploy_failed escrow, re-quote a NEW escrow inline (new escrowId, fresh
    // two-phase proof) and proceed. This preserves the front-run protection (a new
    // buyer proof is required for the new quote) and is bounded by the SAME O13/O21
    // auto-requote budget as the cancel-griefing path, so it cannot become an
    // unbounded platform-gas amplifier. If the budget is exhausted the invoice is
    // parked in the terminal cancel_griefed alert for out-of-band handling.
    if (invoice.escrow.escrowStatus === "deploy_failed") {
      const reset = await this.resetDeployFailedEscrow(invoice);
      if (!reset) {
        throw new Error(
          `Invoice ${invoiceId} escrow deploy has failed too many times ` +
            `(auto-retry budget exhausted); parked for manual handling.`
        );
      }
      invoice = reset;
    }
    const esc0 = invoice.escrow;
    if (!esc0) throw new Error(`Invoice ${invoiceId} has no escrow`);
    if (esc0.escrowStatus !== "quoted") {
      throw new Error(
        `Invoice ${invoiceId} escrow is not claimable (status: ${esc0.escrowStatus})`
      );
    }
    const escrowId = esc0.escrowId;
    if (!escrowId) {
      throw new Error(`Invoice ${invoiceId} escrow has no escrowId to claim`);
    }

    // O14/O3 — the authoritative expected principal is the value FROZEN at quote
    // time (invoice.escrow.escrowAmount), NOT the current invoice.amount. On a
    // rebuilding worker, seeding the record from invoice.amount and then checking
    // it against invoice.amount is a tautology; anchoring to the frozen quote
    // value gives the drift guard teeth on every worker. Pre-migration rows have
    // no frozen anchor: fall back to invoice.amount (prior behavior) rather than
    // hard-fail an in-flight legacy quote.
    const anchoredExpected =
      esc0.escrowAmount != null
        ? BigInt(esc0.escrowAmount)
        : invoice.amount;

    // Multi-process claim: a quoted escrow lives only in the worker that created
    // it (rehydrateEscrows skips scid-less quotes). If THIS worker doesn't hold
    // the record, rebuild it from the persisted invoice so any worker can claim;
    // the durable claim guard then guarantees only one worker actually deploys.
    if (!this.escrowManager.getEscrow(escrowId)) {
      this.escrowManager.importEscrow({
        id: escrowId,
        scid: null,
        deployTxid: null,
        status: "quoted",
        sellerAddress: esc0.sellerAddress,
        arbitratorAddress: esc0.arbitratorAddress,
        feeBasisPoints: esc0.feeBasisPoints,
        blockExpiration: esc0.blockExpiration,
        // Seed from the frozen quote-time anchor, not the current invoice.amount.
        expectedAmount: anchoredExpected,
        depositAmount: null,
        buyerAddress: null,
        createdAt: invoice.createdAt,
        depositedAt: null,
        resolvedAt: null,
        resolution: null,
        invoiceId: invoice.id,
        metadata: { invoicePaymentId: invoice.paymentId.toString() },
      });
    }

    // O14 invariant — the amount that will be bound on-chain (and thus the most
    // the seller can ever be protected for) MUST equal the invoice price the
    // buyer sees. Guard here, before any deploy gas, against a quote whose
    // expectedAmount drifted from invoice.amount (e.g. a mutated invoice.amount
    // or a directly-constructed quote). The fee is deducted FROM expectedAmount
    // on release (seller-borne, not added on top): at feeBps=250 the seller nets
    // 97.5% of the price. That is the intended model and is disclosed via
    // invoice.escrow.feeBasisPoints; this invariant only guarantees the escrowed
    // principal matches the displayed price so the shortfall is exactly the fee,
    // never a silent under-escrow.
    // Cross-check the CURRENT invoice price against the FROZEN quote-time anchor.
    // If invoice.amount was mutated after the quote (or a record was constructed
    // with a mismatched amount), the frozen anchor no longer equals invoice.amount
    // and we refuse to deploy — this is the real drift guard, and it fires on any
    // worker because the anchor is not re-derived from invoice.amount. Then also
    // confirm the record we're about to deploy carries that same anchor.
    if (esc0.escrowAmount != null && anchoredExpected !== invoice.amount) {
      throw new Error(
        `Invoice ${invoiceId} escrow amount drift: frozen quote principal (${anchoredExpected}) != current invoice amount (${invoice.amount}); refusing to deploy an under/over-bound escrow.`
      );
    }
    const quotedEscrow = this.escrowManager.getEscrow(escrowId);
    if (quotedEscrow && quotedEscrow.expectedAmount !== anchoredExpected) {
      throw new Error(
        `Invoice ${invoiceId} escrow expectedAmount (${quotedEscrow.expectedAmount}) != frozen quote principal (${anchoredExpected}); refusing to deploy an under/over-bound escrow.`
      );
    }

    const record = await this.escrowManager.claimEscrow(escrowId, buyerAddress);
    const guard = this.escrowManager.getClaimGuard();
    if (record.status === "deploy_failed" || !record.scid) {
      // O6 — persist deploy_failed FIRST, THEN release the guard row. The manager
      // deliberately no longer releases on failure: releasing before this persist
      // would open a window where the row is free yet the durable invoice still
      // reads 'quoted', letting a second worker win the row and deploy a SECOND
      // contract. By ordering persist-before-release, the invoice-level 'must be
      // quoted' gate (top of this method) is already closed when the row frees, so
      // no concurrent re-claim can slip through.
      esc0.escrowStatus = "deploy_failed";
      await this.store.updateInvoice(invoice.id, { escrow: esc0 });
      if (guard) {
        try {
          await guard.releaseClaim(escrowId);
        } catch {
          // best-effort; deploy_failed is already durable, which blocks re-claim.
        }
      }
      throw new Error(`Escrow deploy failed for invoice ${invoiceId}`);
    }

    esc0.scid = record.scid;
    esc0.deployTxid = record.deployTxid;
    esc0.buyerAddress = buyerAddress;
    esc0.escrowStatus = "awaiting_deposit";
    // O21 — a fresh, proven buyer bind is a legitimate new attempt: reset the
    // auto-requote budget so an earlier griefing spree can't permanently deny a
    // later honest buyer's ability to be re-quoted after a cancel race.
    esc0.requoteCount = 0;
    esc0.lastRequoteAt = 0;
    // O10 — the invoice blob is the post-success ARBITER (A6/O7), so this write
    // must be a compare-and-set: apply it ONLY if the persisted escrow is STILL
    // the 'quoted' record with the escrowId we claimed. A concurrent requote (or
    // any other lifecycle writer) that flipped the blob first would otherwise be
    // silently rolled back by this whole-blob overwrite, stranding a freshly
    // deployed, buyer-bound contract invisibly (no invoice maps its scid). On a
    // precondition miss we do NOT clobber: the deployTxid breadcrumb is already
    // stamped on the held guard row, so the on-restart reconciler (or a manual
    // sweep) can adopt the live contract; here we surface an alert and leave the
    // durable blob to the winning writer.
    const applied = await this.store.updateInvoice(
      invoice.id,
      { escrow: esc0 },
      { expectedEscrow: { escrowId, escrowStatus: "quoted" } }
    );
    if (!applied) {
      this.emit(
        "error",
        new Error(
          `Invoice ${invoiceId} escrow claim CAS lost to a concurrent writer ` +
            `(escrowId ${escrowId} no longer the quoted binding); deployed scid ` +
            `${record.scid} left for reconcile via the guard-row deployTxid breadcrumb.`
        )
      );
      // Do NOT release the guard row: the held row + deployTxid is the ONLY
      // durable pointer to the orphaned live contract until the reconciler heals it.
      return invoice;
    }
    // O7 — the invoice blob is now durably 'awaiting_deposit' WITH its scid, so
    // that record (not the guard row) is henceforth the arbiter: the top-of-method
    // 'must be quoted' gate blocks any re-claim, and the on-chain SIGNER()==buyer
    // gate independently closes the buyer-seat. The guard row has done its job and
    // can be released to bound table growth (one row per successful escrow would
    // otherwise leak forever). Ordered AFTER the persist so there is never a window
    // where the row is free while the invoice still reads 'quoted' (mirrors O6).
    if (guard) {
      try {
        await guard.releaseClaim(escrowId);
      } catch {
        // best-effort GC; correctness does not depend on the row being gone.
      }
    }
    return invoice;
  }

  /**
   * O19 — recover a deploy_failed escrow into a fresh QUOTE so a proven buyer can
   * re-claim. Mints a NEW escrow quote (new escrowId, no scid) and persists it
   * under a compare-and-set against the observed deploy_failed binding, so a
   * concurrent writer (a peer also retrying, a reconciler) cannot be clobbered.
   * Bounded by the same O13/O21 auto-requote budget as the cancel path to keep a
   * flapping deploy from becoming an unbounded platform-gas amplifier. Returns the
   * updated invoice (escrow reset to 'quoted') on success, or null if the retry
   * budget is exhausted / the CAS was lost (caller should re-read + retry or park).
   */
  private async resetDeployFailedEscrow(invoice: Invoice): Promise<Invoice | null> {
    if (!this.escrowManager || !invoice.escrow) return null;
    const esc = invoice.escrow;
    // Fire ONLY for a deploy_failed escrow. PREMINT: a mint/Bind failure is
    // deterministic and fungible, so re-quoting is always safe (there is no
    // broadcast-ambiguous quarantine that could hide a live contract). This guard
    // also absorbs a concurrent reset that already advanced the status.
    if (esc.escrowStatus !== "deploy_failed") {
      // Not a re-quotable failure (already advanced). Re-read.
      return this.store.getInvoice(invoice.id);
    }
    const observedEscrowId = esc.escrowId ?? null;

    // Budget gate — share the auto-requote counters so deploy_failed retries and
    // cancel-grief requotes draw from ONE bounded budget (an attacker can't get 2x
    // the deploys by alternating the two failure modes).
    const requoteCount = esc.requoteCount ?? 0;
    const lastRequoteAt = esc.lastRequoteAt ?? 0;
    const now = Date.now();
    if (now - lastRequoteAt < this.config.escrowRequoteCooldownMs) {
      // Too soon since the last auto attempt — treat as budget-blocked for now.
      return null;
    }
    if (requoteCount >= this.config.escrowMaxAutoRequotes) {
      esc.escrowStatus = "cancelled";
      await this.store.updateInvoice(
        invoice.id,
        { escrow: esc },
        { expectedEscrow: { escrowId: observedEscrowId, escrowStatus: "deploy_failed" } }
      );
      return null;
    }

    const anchored =
      esc.escrowAmount != null ? BigInt(esc.escrowAmount) : invoice.amount;
    const fresh = await this.escrowManager.createEscrowQuote({
      sellerAddress: esc.sellerAddress,
      arbitratorAddress: esc.arbitratorAddress,
      feeBasisPoints: esc.feeBasisPoints,
      blockExpiration: esc.blockExpiration,
      expectedAmount: anchored,
      metadata: { invoicePaymentId: invoice.paymentId.toString(), retriedFrom: observedEscrowId ?? "" },
    });

    esc.escrowId = fresh.id;
    esc.scid = null;
    esc.deployTxid = null;
    esc.buyerAddress = null;
    esc.escrowStatus = "quoted";
    esc.requoteCount = requoteCount + 1;
    esc.lastRequoteAt = now;
    const applied = await this.store.updateInvoice(
      invoice.id,
      { escrow: esc },
      { expectedEscrow: { escrowId: observedEscrowId, escrowStatus: "deploy_failed" } }
    );
    if (!applied) {
      // A concurrent writer transitioned the escrow first; drop our unreferenced
      // fresh quote and let the winner stand. Caller re-reads.
      this.escrowManager.untrack(fresh.id);
      return null;
    }
    return this.store.getInvoice(invoice.id);
  }

  async escrowAction(
    invoiceId: string,
    action: "confirmDelivery" | "refundBuyer" | "dispute" | "claimAfterExpiry" | "arbitrateRelease" | "arbitrateRefund"
  ): Promise<string> {
    const invoice = await this.store.getInvoice(invoiceId);
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
    if (!invoice.escrow) throw new Error(`Invoice ${invoiceId} has no escrow`);
    if (!this.escrowManager) throw new Error("Escrow manager not available");

    const scid = invoice.escrow.scid;
    if (!scid) {
      throw new Error(
        `Invoice ${invoiceId} escrow is not yet claimed/deployed (no SCID). Bind a buyer with claimEscrowInvoice() first.`
      );
    }

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

      // Map the escrow lifecycle onto the invoice's own status so the escrow
      // rail — NOT the integrated-address monitor — drives an escrow invoice to
      // its terminal state. Without this, a buyer who only calls Deposit() (and
      // never pays the integrated address) leaves the invoice stuck 'pending'
      // until it wrongly expires, even though real DERO is locked in escrow.
      //  - funded            -> escrow_funded (paid into escrow; do not expire)
      //  - disputed          -> disputed (non-terminal; settlement blocked, O19)
      //  - released / expiry -> completed (seller got paid)
      //  - refunded          -> refunded (buyer got their money back; O19 — a
      //                         chargeback-equivalent, NOT 'expired'/never-paid)
      //  - arbitrated        -> completed if seller-release, refunded if buyer-refund
      let mappedStatus: InvoiceStatus | null = null;
      switch (escrow.status) {
        case "funded":
          mappedStatus = "escrow_funded";
          // O21 — a real deposit landed: this buyer succeeded, so clear the
          // per-invoice auto-requote budget. A later grief (if the escrow is ever
          // re-quoted) starts from a fresh budget instead of an exhausted one.
          invoice.escrow.requoteCount = 0;
          invoice.escrow.lastRequoteAt = 0;
          break;
        case "disputed":
          mappedStatus = "disputed";
          break;
        case "released":
        case "expired_claimed":
          mappedStatus = "completed";
          break;
        case "refunded":
          mappedStatus = "refunded";
          break;
        case "arbitrated":
          mappedStatus =
            escrow.resolution === "arbitrator_released_seller"
              ? "completed"
              : escrow.resolution === "arbitrator_refunded_buyer"
                ? "refunded"
                : null;
          break;
        default:
          mappedStatus = null;
      }

      const previousStatus = invoice.status;
      const statusChanged = mappedStatus !== null && mappedStatus !== previousStatus;
      if (statusChanged) {
        invoice.status = mappedStatus!;
        if (mappedStatus === "completed") {
          invoice.completedAt = new Date().toISOString();
        }
      }

      await this.store.updateInvoice(invoice.id, {
        status: statusChanged ? invoice.status : undefined,
        completedAt: statusChanged && invoice.status === "completed"
          ? invoice.completedAt
          : undefined,
        // Persist the escrow-blob mutations above (escrowStatus/buyerAddress/
        // resolution + the O21 budget reset). Without this the durable escrow
        // status lags the on-chain state and a restart re-imports a stale blob.
        escrow: invoice.escrow,
      });

      if (statusChanged) {
        // Stop the integrated-address monitor once escrow reaches a terminal
        // invoice state; the escrow rail is authoritative from here.
        if (
          invoice.status === "completed" ||
          invoice.status === "expired" ||
          invoice.status === "refunded"
        ) {
          this.monitor.untrack(invoice.id);
        }
        this.emit("invoiceStatusChanged", invoice, previousStatus);
      }

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

    this.escrowManager.on("escrowCancelled", (escrow) => {
      this.requoteCancelledEscrow(escrow).catch((err) =>
        this.emit("error", new Error(`Escrow cancelled handler: ${err}`))
      );
    });

    // O18 — a funded escrow whose amount failed independent verification must
    // NOT settle the invoice. Surface it as an alert (keep the invoice off the
    // shippable path) rather than mapping funded -> escrow_funded.
    this.escrowManager.on("escrowFundingMismatch", (escrow) => {
      this.handleEscrowFundingMismatch(escrow).catch((err) =>
        this.emit("error", new Error(`Escrow funding-mismatch handler: ${err}`))
      );
    });

    this.escrowManager.on("error", (err) => {
      this.emit("error", err);
    });
  }

  /**
   * Re-quote a fresh escrow onto a still-open invoice whose escrow was cancelled
   * while never funded. A hostile/regretful seller (or a griefer) can land
   * CancelUnfunded ahead of a buyer's Deposit (both target status 0; SCDATA is
   * plaintext in the mempool). That never risks funds — a status-0 contract
   * holds 0 — but it strands the buyer against a dead SCID. Here we detect the
   * dead binding and reset the invoice's escrow to a fresh QUOTE so the buyer
   * can re-claim + deposit. No auto re-deploy: a new buyer proof is required at
   * the next claim, preserving the two-phase front-run protection.
   *
   * Guarded to no-op if the invoice is already paid, completed, expired, or if
   * its current escrow binding is not the cancelled SCID (so a stale event can't
   * clobber a newer binding).
   */
  private async requoteCancelledEscrow(escrow: EscrowRecord): Promise<void> {
    if (!this.escrowManager) return;
    if (!escrow.scid) return;

    // O20 — targeted lookup by scid, not a full-table scan per cancel event.
    const invoice = this.store.getInvoiceByScid
      ? await this.store.getInvoiceByScid(escrow.scid)
      : (await this.store.listInvoices()).find(
          (i) => i.escrow?.scid === escrow.scid
        ) ?? null;
    if (!invoice || !invoice.escrow) return;

    // O10 — snapshot the escrow binding we observed so the requote write can be a
    // compare-and-set. If a concurrent claim-success (or another lifecycle
    // handler) transitions this invoice's escrow between our read and our write,
    // our whole-blob overwrite must NOT clobber it — we abort and let the winner
    // stand rather than replace a live binding with a fresh scid=null quote.
    const observedEscrowId = invoice.escrow.escrowId ?? null;
    const observedEscrowStatus = invoice.escrow.escrowStatus;

    // Only re-quote for an invoice that can still be paid.
    const terminalInvoice: InvoiceStatus[] = [
      "completed",
      "expired",
    ];
    if (
      terminalInvoice.includes(invoice.status) ||
      invoice.amountReceived > 0n ||
      invoice.payments.length > 0
    ) {
      return;
    }

    // O13 guard — bound the auto-requote loop. Without a cap, a hostile seller
    // (or owner) can land CancelUnfunded on each freshly-deployed status-0 SCID
    // before Deposit confirms; each cancel fires escrowCancelled -> auto-requote
    // -> (on re-claim) another platform-gas deploy, forever, at the cost of one
    // cheap CancelUnfunded per cycle. That is an unbounded platform-gas drain and
    // a permanent denial of settlement for the buyer. We cap the number of
    // automatic requotes per invoice and enforce a cooldown between them. Once
    // the cap is hit the invoice is parked in a terminal alert state
    // (escrow_cancel_griefed) for human/out-of-band handling rather than looping.
    // O21 — counters live on the engine-controlled invoice.escrow object, NOT on
    // the caller-supplied invoice.metadata (which createInvoice populates from
    // params.metadata and a merchant/API can rewrite). This closes the reset
    // vector that would otherwise re-open the O9/O13 unbounded gas amplifier.
    const requoteCount = invoice.escrow.requoteCount ?? 0;
    const lastRequoteAt = invoice.escrow.lastRequoteAt ?? 0;
    const now = Date.now();
    if (now - lastRequoteAt < this.config.escrowRequoteCooldownMs) {
      // Too soon since the last auto-requote — drop this cancel (rate limit).
      return;
    }
    if (requoteCount >= this.config.escrowMaxAutoRequotes) {
      // Cap reached: stop auto-amplifying. Park the invoice for manual handling
      // and stop tracking it on the base rail. No funds are at risk (every
      // cancelled contract was status-0 / held 0).
      invoice.escrow.escrowStatus = "cancelled";
      invoice.status = "expired";
      await this.store.updateInvoice(invoice.id, { status: "expired" });
      this.monitor.untrack(invoice.id);
      await this.webhook?.send(
        "escrow.cancel_griefed" as Parameters<typeof this.webhook.send>[0],
        invoice
      );
      return;
    }
    invoice.escrow.requoteCount = requoteCount + 1;
    invoice.escrow.lastRequoteAt = now;

    const fresh = await this.escrowManager.createEscrowQuote({
      sellerAddress: invoice.escrow.sellerAddress,
      arbitratorAddress: invoice.escrow.arbitratorAddress,
      feeBasisPoints: invoice.escrow.feeBasisPoints,
      blockExpiration: invoice.escrow.blockExpiration,
      expectedAmount: invoice.amount,
      metadata: { invoicePaymentId: invoice.paymentId.toString(), requotedFrom: escrow.scid },
    });

    invoice.escrow.escrowId = fresh.id;
    invoice.escrow.scid = null;
    invoice.escrow.deployTxid = null;
    invoice.escrow.buyerAddress = null;
    invoice.escrow.escrowStatus = "quoted";
    invoice.escrow.depositHeight = null;
    invoice.escrow.resolution = null;
    const applied = await this.store.updateInvoice(
      invoice.id,
      { escrow: invoice.escrow },
      {
        expectedEscrow: {
          escrowId: observedEscrowId,
          escrowStatus: observedEscrowStatus,
        },
      }
    );
    if (!applied) {
      // A concurrent writer transitioned the escrow first; the fresh quote we
      // just created is unreferenced (never persisted, never deployed) and is
      // harmless — the manager drops it on next restart. Untrack it so it does
      // not linger in the in-memory map.
      this.escrowManager.untrack(fresh.id);
      return;
    }
    await this.webhook?.send("escrow.requoted" as Parameters<typeof this.webhook.send>[0], invoice);
  }

  /**
   * O20 — tear down a still-open escrow binding when its invoice receives a
   * misrouted base-rail payment. Prevents a later correct Deposit() from funding
   * the escrow and silently overwriting the misrouted_to_base alert (which would
   * settle the invoice while the merchant keeps the orphaned base funds = silent
   * double-charge).
   *
   * - quoted / deploy_failed / no scid: just drop the local quote (no on-chain
   *   contract exists).
   * - awaiting_deposit (deployed, status-0): CancelUnfunded the contract so no
   *   Deposit can land, then untrack. The cancel reverts iff a Deposit raced in
   *   first; in that RARE case the escrow legitimately funds and we deliberately
   *   let the escrow rail win (buyer's real escrow deposit is honored), but the
   *   invoice keeps a metadata audit marker so the earlier misroute is never
   *   invisible.
   * - funded / disputed / terminal: do nothing — real funds are already in
   *   escrow; the escrow rail is authoritative and the misroute is a separate
   *   base-wallet reconciliation item.
   */
  private async teardownEscrowOnMisroute(invoice: Invoice): Promise<void> {
    if (!this.escrowManager || !invoice.escrow) return;
    const esc = invoice.escrow;
    // Record the misroute permanently so a later settlement can never hide it.
    (invoice.metadata as Record<string, unknown>).__escrowMisroutedToBase = true;
    await this.store.updateInvoice(invoice.id, { metadata: invoice.metadata });

    const status = esc.escrowStatus;
    if (status === "funded" || status === "disputed") {
      // Real DERO already locked in escrow; leave the escrow rail authoritative.
      return;
    }
    if (!esc.scid) {
      // Only a quote exists — drop it locally so nothing can be claimed/deployed.
      if (esc.escrowId) this.escrowManager.untrack(esc.escrowId);
      esc.escrowStatus = "cancelled";
      esc.escrowId = null;
      // O9 — persist the escrow blob (NOT an empty patch). An empty {} patch
      // emits no `escrow=@escrow` SET clause, so the cancel would be silently
      // discarded on both stores; on restart rehydrate/claim would then re-open
      // the misrouted binding and re-enable the O20 silent double-charge.
      await this.store.updateInvoice(invoice.id, { escrow: esc });
      return;
    }
    // Deployed but status-0: cancel on-chain so no Deposit can fund it.
    try {
      await this.escrowManager.cancelUnfunded(esc.scid);
    } catch {
      // Reverted — a Deposit raced in and the contract is no longer status-0.
      // The escrow legitimately funds; the __escrowMisroutedToBase marker above
      // keeps the base-rail overpay auditable. Nothing further to do here.
      return;
    }
    if (esc.escrowId) this.escrowManager.untrack(esc.escrowId);
    esc.escrowStatus = "cancelled";
    // O9 — persist the escrow blob (NOT an empty patch); see the quote-only
    // branch above. An empty {} patch silently drops the cancel, leaving a live
    // scid + pollable status that rehydrate re-imports, re-opening the O20
    // silent double-charge the teardown exists to prevent.
    await this.store.updateInvoice(invoice.id, { escrow: esc });
  }

  /**
   * O18 — an escrow reported on-chain "funded" but its amount failed independent
   * verification (escrowBalance != expectedAmount or the contract's real DERO
   * holdings do not cover it). The escrow manager already declined to settle it
   * (left it in awaiting_deposit and did NOT emit escrowFunded). Here we make
   * that visible at the invoice layer WITHOUT settling: the invoice stays off the
   * shippable path (never escrow_funded/completed) and a funding_mismatch webhook
   * fires for out-of-band handling. We do not expire it either — the buyer's real
   * deposit may still be on the contract and recoverable via the normal paths.
   */
  private async handleEscrowFundingMismatch(
    escrow: EscrowRecord
  ): Promise<void> {
    if (!escrow.scid) return;
    // O20 — targeted lookup by scid, not a full-table scan per mismatch event.
    const invoice = this.store.getInvoiceByScid
      ? await this.store.getInvoiceByScid(escrow.scid)
      : (await this.store.listInvoices()).find(
          (i) => i.escrow?.scid === escrow.scid
        ) ?? null;
    if (!invoice || !invoice.escrow) return;
    // Do NOT change invoice.status to any settled/shippable value. Fire the alert.
    await this.webhook?.send(
      "escrow.funding_mismatch" as Parameters<typeof this.webhook.send>[0],
      invoice
    );
    this.emit(
      "error",
      new Error(
        `Escrow funding mismatch for invoice ${invoice.id} (scid ${escrow.scid}); invoice NOT settled.`
      )
    );
  }

  /**
   * O15 — reload in-flight escrows from the invoice store into the escrow
   * manager's poller after a restart.
   *
   * The escrow manager is in-memory only, so without this its poll loop runs
   * over an empty map and every not-yet-terminal on-chain escrow (real locked
   * DERO) goes permanently un-reconciled: no funded/released/arbitrated event
   * fires again and the invoice never reaches its terminal state.
   *
   * We reconstruct the EscrowRecord from the persisted InvoiceEscrow binding and
   * import it. Only escrows that have actually deployed (have an scid) and are in
   * a non-terminal state need re-polling; a still-`quoted` / `deploy_failed`
   * escrow has no on-chain contract to watch. The record we import is a
   * best-effort local view — the very next poll overwrites status/depositAmount
   * from authoritative on-chain state via reconcile().
   */
  private async rehydrateEscrows(): Promise<void> {
    if (!this.escrowManager) return;
    // Non-terminal on-chain escrow states worth polling. quoted/deploying/
    // deploy_failed/cancelled and the resolved terminals are skipped: they have
    // no live on-chain balance/transition left to observe.
    const pollable = new Set<EscrowStatus>([
      "awaiting_deposit",
      "funded",
      "disputed",
    ]);
    const invoices = await this.store.listInvoices();
    for (const invoice of invoices) {
      const e = invoice.escrow;
      if (!e || !e.scid || !e.escrowId) continue;
      if (!pollable.has(e.escrowStatus as EscrowStatus)) continue;
      // Skip if the manager already knows this escrow (idempotent restart).
      if (this.escrowManager.getEscrow(e.escrowId)) continue;

      // O8 — anchor expectedAmount to the FROZEN quote-time principal
      // (escrowAmount), NOT the current invoice.amount. The claim path already
      // trusts this frozen anchor; if rehydrate re-derived from invoice.amount the
      // two rebuild paths would disagree, and a post-quote-mutated invoice.amount
      // would silently redefine what reconcile()'s O18 funded-amount check
      // compares against on-chain — settling a wrong price or stranding a
      // correctly-funded escrow. Pre-migration rows without a frozen anchor fall
      // back to invoice.amount (prior behavior).
      const rehydratedExpected =
        e.escrowAmount != null ? BigInt(e.escrowAmount) : invoice.amount;
      this.escrowManager.importEscrow({
        id: e.escrowId,
        scid: e.scid,
        deployTxid: e.deployTxid,
        status: e.escrowStatus as EscrowStatus,
        sellerAddress: e.sellerAddress,
        arbitratorAddress: e.arbitratorAddress,
        feeBasisPoints: e.feeBasisPoints,
        blockExpiration: e.blockExpiration,
        expectedAmount: rehydratedExpected,
        depositAmount: e.escrowStatus === "funded" ? rehydratedExpected : null,
        buyerAddress: e.buyerAddress,
        createdAt: invoice.createdAt,
        depositedAt: null,
        resolvedAt: null,
        resolution: (e.resolution as EscrowRecord["resolution"]) ?? null,
        invoiceId: invoice.id,
        metadata: { invoicePaymentId: invoice.paymentId.toString() },
      });
    }
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
          invoice.status === "completed" ||
          invoice.status === "expired" ||
          new Date(invoice.expiresAt) >= now
        ) {
          continue;
        }

        // Payment-aware expiry (invariant 6): never expire a funded invoice out
        // from under an in-flight settlement. A funded-but-unconfirmed invoice
        // keeps being tracked; only a zero-payment invoice expires here.
        if (invoice.amountReceived > 0n || invoice.payments.length > 0) {
          continue;
        }
        // Escrow invoices past the quote stage settle on the escrow rail's own
        // on-chain window, not the integrated-address TTL. Do not expire them
        // here (would strand escrowed DERO); stop tracking on the base rail.
        if (this.isEscrowSettling(invoice)) {
          this.monitor.untrack(invoice.id);
          continue;
        }

        const previousStatus = invoice.status;

        if (this.webhookSink) {
          // Bridge path: route the terminal expiry through the durable outbox
          // (one tx: status + outbox row), exactly like the monitor's expiry
          // handler — NOT the bare updateInvoice, which would drop the webhook.
          await this.webhookSink.onInvoiceExpired(invoice.id);
          this.monitor.untrack(invoice.id);
          const updated = await this.store.getInvoice(invoice.id);
          if (updated) this.emit("invoiceStatusChanged", updated, previousStatus);
          continue;
        }

        await this.store.updateInvoice(invoice.id, { status: "expired" });
        this.monitor.untrack(invoice.id);
        invoice.status = "expired";
        this.emit("invoiceStatusChanged", invoice, previousStatus);
        await this.webhook?.send("invoice.expired", invoice);
      }
    } catch (err) {
      this.emit("error", new Error(`Error checking expired invoices: ${err}`));
    }
  }
}
