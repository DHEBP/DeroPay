/**
 * WebhookDeliveryWorker — the durable at-least-once delivery loop.
 *
 * It claims due outbox rows, re-signs the STORED frozen payload bytes (so every
 * replay is byte-identical, including after a restart), POSTs via the shared
 * `deliverOnce`, and either acks (2xx -> delivered) or reschedules with durable
 * capped-exponential backoff + jitter. A row that exhausts the retry ceiling is
 * parked 'dead' (never deleted) and reported through a durable dead-letter sink
 * — never a dropped in-memory emit.
 *
 * Liveness model: eager-on-boot + interval + an explicit kick(), so an enqueue
 * can wake the loop immediately without waiting for the next tick. Backoff is
 * stored in the row (next_attempt_at), so it survives process restarts — unlike
 * a setTimeout, which would be lost on crash.
 */

import { deliverOnce, signWebhookPayload } from "./dispatcher.js";
import type { WebhookOutbox } from "./outbox.js";
import type { OutboxRecord } from "./outbox-types.js";

export type DeadLetter = {
  id: string;
  invoiceId: string;
  eventType: string;
  attempts: number;
  lastError: string | null;
};

export type WebhookDeliveryWorkerConfig = {
  url: string;
  secret: string;
  /** ms between polling ticks (default 5_000). */
  intervalMs?: number;
  /** claim lease length; a delivering row older than this is reclaimable (default 60_000). */
  leaseMs?: number;
  /** rows claimed per tick (default 20). */
  batchSize?: number;
  /** per-request timeout passed to deliverOnce (default 10_000). */
  timeoutMs?: number;
  /** base backoff (default 5_000). delay = min(base * 2^(attempts-1), maxBackoffMs) + jitter. */
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /** dead after this many failed attempts (default 50). */
  maxAttempts?: number;
  /** called (and awaited) when a row is parked dead. Wire to a DURABLE sink. */
  onDeadLetter?: (dl: DeadLetter) => void | Promise<void>;
  /** injectable clock for tests; defaults to Date.now. */
  now?: () => number;
  /** injectable jitter in [0,1) for tests; defaults to Math.random. */
  jitter?: () => number;
};

export class WebhookDeliveryWorker {
  private readonly cfg: Required<
    Omit<WebhookDeliveryWorkerConfig, "onDeadLetter">
  > &
    Pick<WebhookDeliveryWorkerConfig, "onDeadLetter">;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private ticking = false;

  constructor(
    private readonly outbox: WebhookOutbox,
    config: WebhookDeliveryWorkerConfig
  ) {
    this.cfg = {
      url: config.url,
      secret: config.secret,
      intervalMs: config.intervalMs ?? 5_000,
      leaseMs: config.leaseMs ?? 60_000,
      batchSize: config.batchSize ?? 20,
      timeoutMs: config.timeoutMs ?? 10_000,
      baseBackoffMs: config.baseBackoffMs ?? 5_000,
      maxBackoffMs: config.maxBackoffMs ?? 60 * 60_000, // 1h ceiling
      maxAttempts: config.maxAttempts ?? 50,
      onDeadLetter: config.onDeadLetter,
      now: config.now ?? Date.now,
      jitter: config.jitter ?? Math.random,
    };
  }

  /** Start the loop: deliver eagerly once, then on an interval. */
  start(): void {
    if (this.running) return;
    this.running = true;
    // Eager first tick (fire-and-forget; errors are swallowed per-row inside).
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.cfg.intervalMs);
    // Don't keep the event loop alive solely for the poller.
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Wake the loop immediately (call after an enqueue). */
  kick(): Promise<void> {
    return this.tick();
  }

  /**
   * One delivery pass. Claims due rows and processes each. Re-entrancy guarded:
   * overlapping ticks (interval + kick) collapse to one in-flight pass.
   */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = this.cfg.now();
      const due = await this.outbox.claimDue(
        now,
        this.cfg.leaseMs,
        this.cfg.batchSize
      );
      for (const row of due) {
        await this.deliver(row);
      }
    } finally {
      this.ticking = false;
    }
  }

  private async deliver(row: OutboxRecord): Promise<void> {
    // Re-sign the STORED bytes — identical signature on every replay.
    const signature = `sha256=${signWebhookPayload(row.payload, this.cfg.secret)}`;
    const result = await deliverOnce({
      url: this.cfg.url,
      payload: row.payload,
      signature,
      eventType: row.eventType,
      deliveryId: row.id,
      timeoutMs: this.cfg.timeoutMs,
    });

    if (result.success) {
      await this.outbox.markDelivered(row.id, this.cfg.now());
      return;
    }

    const nextAttemptNumber = row.attempts + 1;
    const lastError = result.error ?? `HTTP ${result.statusCode}`;

    if (nextAttemptNumber >= this.cfg.maxAttempts) {
      await this.outbox.markDead(row.id, lastError);
      if (this.cfg.onDeadLetter) {
        await this.cfg.onDeadLetter({
          id: row.id,
          invoiceId: row.invoiceId,
          eventType: row.eventType,
          attempts: nextAttemptNumber,
          lastError,
        });
      }
      return;
    }

    await this.outbox.reschedule(
      row.id,
      this.cfg.now() + this.backoff(nextAttemptNumber),
      lastError
    );
  }

  /** Capped exponential backoff with full jitter. */
  private backoff(attempt: number): number {
    const exp = this.cfg.baseBackoffMs * 2 ** (attempt - 1);
    const capped = Math.min(exp, this.cfg.maxBackoffMs);
    return Math.floor(capped * (0.5 + 0.5 * this.cfg.jitter()));
  }
}
