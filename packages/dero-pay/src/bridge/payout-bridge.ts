/**
 * PayoutBridge — the long-lived, outbound-only host-side daemon.
 *
 * Composes InvoiceEngine (with a durable webhookSink) + WebhookOutbox +
 * WebhookDeliveryWorker, plus a port-free heartbeat. It binds NO inbound
 * listener: it only makes loopback JSON-RPC calls to a local wallet/daemon and
 * outbound HTTPS POSTs to the merchant.
 */

import { InvoiceEngine } from "../server/invoice-engine.js";
import { SqliteInvoiceStore } from "../store/sqlite.js";
import { OutboxWebhookSink } from "../webhook/outbox-sink.js";
import { WebhookOutbox, storeSupportsOutbox } from "../webhook/outbox.js";
import {
  WebhookDeliveryWorker,
  type DeadLetter,
} from "../webhook/delivery-worker.js";
import { writeHeartbeat } from "./health.js";
import type { BridgeConfig } from "./config.js";

export class PayoutBridge {
  private store: SqliteInvoiceStore | null = null;
  private engine: InvoiceEngine | null = null;
  private outbox: WebhookOutbox | null = null;
  private worker: WebhookDeliveryWorker | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private deadLetterCount = 0;
  private started = false;

  constructor(private readonly config: BridgeConfig) {}

  /**
   * Boot order: open store -> assert durable+outbox-capable -> build sink +
   * worker -> engine.start() (which re-hydrates tracked invoices AND, on its
   * first tick, the worker re-claims undelivered rows) -> start worker ->
   * heartbeat. A failure here throws and the process exits nonzero.
   */
  async start(): Promise<void> {
    if (this.started) return;

    this.store = new SqliteInvoiceStore({ path: this.config.storePath });
    if (!storeSupportsOutbox(this.store)) {
      throw new Error("store does not support the durable outbox");
    }

    this.outbox = new WebhookOutbox(this.store);
    this.worker = new WebhookDeliveryWorker(this.outbox, {
      url: this.config.webhookUrl,
      secret: this.config.webhookSecret,
      intervalMs: this.config.deliveryIntervalMs,
      maxAttempts: this.config.maxAttempts,
      onDeadLetter: (dl) => this.onDeadLetter(dl),
    });

    const sink = new OutboxWebhookSink(this.store, () => {
      // Kick the worker the moment an event is enqueued (don't wait a tick).
      void this.worker?.kick();
    });

    this.engine = new InvoiceEngine({
      walletRpcUrl: this.config.walletRpcUrl,
      daemonRpcUrl: this.config.daemonRpcUrl,
      rpcAuth: this.config.rpcAuth,
      store: this.store,
      pollIntervalMs: this.config.pollIntervalMs,
      defaultRequiredConfirmations: this.config.defaultRequiredConfirmations,
      webhookSink: sink,
    });

    // Engine.start() pings loopback wallet+daemon (throws if unreachable) and
    // re-hydrates tracked invoices from the store.
    await this.engine.start();

    // First worker tick claims any rows left undelivered by a prior process.
    this.worker.start();

    await this.refreshHeartbeat();
    this.heartbeatTimer = setInterval(
      () => void this.refreshHeartbeat(),
      this.config.heartbeatIntervalMs
    );
    this.heartbeatTimer.unref?.();

    this.started = true;
  }

  /** Graceful drain: stop intake, stop worker, close store. */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    await this.worker?.stop();
    if (this.engine?.running) await this.engine.stop();
    await this.store?.close();
  }

  /** Install SIGINT/SIGTERM handlers for a clean shutdown. */
  installSignalHandlers(): void {
    const shutdown = () => {
      void this.stop().then(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  get engineRef(): InvoiceEngine {
    if (!this.engine) throw new Error("bridge not started");
    return this.engine;
  }

  private async onDeadLetter(dl: DeadLetter): Promise<void> {
    // Durable, never a dropped in-memory emit: bump the heartbeat counter (which
    // makes `status` report unhealthy) and log. The row itself is already parked
    // 'dead' in the store (never deleted) for forensic recovery.
    this.deadLetterCount++;
    process.stderr.write(
      `[deropay-bridge] DEAD-LETTER ${dl.id} invoice=${dl.invoiceId} ` +
        `event=${dl.eventType} attempts=${dl.attempts} lastError=${dl.lastError}\n`
    );
    await this.refreshHeartbeat();
  }

  private async refreshHeartbeat(): Promise<void> {
    if (!this.outbox) return;
    const counts = await this.outbox.counts();
    writeHeartbeat(this.config.heartbeatPath, {
      ts: new Date().toISOString(),
      epochMs: Date.now(),
      pid: process.pid,
      // The store's 'dead' count is the authoritative parked total (survives
      // restart); the in-memory counter is a secondary signal.
      deadLetters: Math.max(counts.dead, this.deadLetterCount),
      pending: counts.pending,
      delivering: counts.delivering,
    });
  }
}
