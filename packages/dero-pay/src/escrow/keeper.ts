/**
 * EscrowKeeper — keeps a pool of pre-minted, confirmed EMPTY escrow boxes stocked
 * so checkout only has to Bind (not mint + confirm + bind).
 *
 * The keeper runs a background loop that:
 *   1. confirms minted boxes  — GetSC each 'minted' SCID; a box becomes pool-ready
 *      ONLY once it reads back owner-set + bound=0 + status=0 (see THE TRAP below).
 *   2. refills when low       — when ready count < refillBelow, mint empty boxes up
 *      to targetReady (accounting for in-flight minted boxes so it never over-mints).
 *
 * THE TRAP — the keeper and the binder MUST be the SAME owner wallet.
 * The contract's Bind is owner-gated (`IF SIGNER() != LOAD("owner")`), and
 * Initialize sets owner = SIGNER() at mint. A box minted by wallet A can only be
 * bound by wallet A. This keeper is therefore constructed with the SAME
 * EscrowContract instance the EscrowManager binds with — one platform wallet mints
 * AND binds. Do NOT hand it a second signer.
 *
 * Second trap — a mint's SCID exists only after the mint confirms (~1 block).
 * Offering an unconfirmed SCID would make bind() fail with "SC not found". The
 * confirm gate below is the guard: a box is pool-ready ONLY after GetSC proves it.
 */

import type { EscrowContract } from "./contract.js";
import type { EscrowInventoryStore } from "./inventory-store.js";

export interface EscrowKeeperOptions {
  /** Desired number of confirmed, pool-ready boxes to keep on hand. */
  targetReady: number;
  /** Refill is triggered when ready count drops BELOW this. */
  refillBelow: number;
  /** Interval between keeper ticks (confirm + refill), in ms. */
  pollMs: number;
}

const DEFAULT_OPTS: EscrowKeeperOptions = {
  targetReady: 5,
  refillBelow: 2,
  pollMs: 10_000,
};

export interface EscrowKeeperEvents {
  /** A minted box passed its GetSC gate and entered the pool. */
  boxConfirmed: (scid: string) => void;
  /** A box was minted (SCID broadcast, not yet confirmed). */
  boxMinted: (scid: string) => void;
  /** A keeper tick threw (mint RPC error, GetSC error). Non-fatal; the loop
   *  continues on the next tick. */
  error: (error: Error) => void;
}

export class EscrowKeeper {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private readonly opts: EscrowKeeperOptions;
  private listeners: Partial<{
    [K in keyof EscrowKeeperEvents]: EscrowKeeperEvents[K][];
  }> = {};

  constructor(
    /** MUST mint with the SAME platform wallet the manager binds with (THE TRAP). */
    private readonly contract: EscrowContract,
    private readonly store: EscrowInventoryStore,
    opts?: Partial<EscrowKeeperOptions>
  ) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
  }

  // -- events ---------------------------------------------------------------

  on<K extends keyof EscrowKeeperEvents>(
    event: K,
    cb: EscrowKeeperEvents[K]
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as EscrowKeeperEvents[K][]).push(cb);
    return () => {
      const arr = this.listeners[event] as EscrowKeeperEvents[K][];
      const i = arr.indexOf(cb);
      if (i !== -1) arr.splice(i, 1);
    };
  }

  private emit<K extends keyof EscrowKeeperEvents>(
    event: K,
    ...args: Parameters<EscrowKeeperEvents[K]>
  ): void {
    for (const cb of (this.listeners[event] ?? []) as EscrowKeeperEvents[K][]) {
      (cb as (...a: unknown[]) => void)(...args);
    }
  }

  // -- lifecycle ------------------------------------------------------------

  /** Start the background loop. Runs one tick immediately, then every pollMs. */
  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.pollMs);
    // Don't keep the process alive solely for the keeper loop.
    (this.timer as { unref?: () => void }).unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // -- pool operations ------------------------------------------------------

  /** Whether the backing inventory store pops atomically ACROSS processes. The
   *  engine asserts this is true for a multi-process deployment (two workers must
   *  never pop the same box). */
  get durable(): boolean {
    return this.store.durable;
  }

  /** Pop a confirmed box for a checkout to bind. Returns null when the pool is
   *  empty (caller falls back to inline mint-on-demand). */
  async take(): Promise<string | null> {
    return this.store.claimOne();
  }

  /** Return a taken box to the keeper after a FAILED bind so it is not leaked in
   *  the 'claimed' state. The next tick re-verifies it via GetSC and either
   *  re-pools it (bind never landed) or retires it (bind landed, bound!=0). */
  async release(scid: string): Promise<void> {
    return this.store.release(scid);
  }

  /** Confirmed (pool-ready) box count — surfaced so the app can alert on low stock. */
  async readyCount(): Promise<number> {
    return this.store.countReady();
  }

  /**
   * One keeper cycle: confirm minted boxes, then refill if the pool is low.
   * Re-entrancy-guarded so a slow tick (many GetSC / mint RPCs) never overlaps
   * itself under the interval. Exposed for deterministic tests (drive it directly
   * instead of waiting on the timer).
   */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.confirmMinted();
      const ready = await this.store.countReady();
      if (ready < this.opts.refillBelow) {
        await this.refill();
      }
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Promote minted boxes that GetSC proves are empty and ours. THE TRAP gate:
   * pool-ready iff owner is set (minted by us), bound === 0 (no terms yet),
   * status === 0 (never funded), NOT paused (a paused box bricks Deposit), and
   * carrying NO pendingOwner (O13 — a pre-Bind hot-key plant could complete a
   * mid-escrow rotation and redirect the fee leg). Anything else stays 'minted'
   * (still confirming) and is retried next tick — never handed out early.
   */
  private async confirmMinted(): Promise<void> {
    for (const scid of await this.store.listMinted()) {
      let state;
      try {
        state = await this.contract.getState(scid);
      } catch {
        // Not on-chain yet (or transient RPC): leave 'minted', retry next tick.
        continue;
      }
      const poolReady =
        state.owner !== "" &&
        state.bound === 0 &&
        state.statusCode === 0 &&
        !state.paused &&
        state.pendingOwner === null;
      if (poolReady) {
        await this.store.markConfirmed(scid);
        this.emit("boxConfirmed", scid);
      }
    }
  }

  /**
   * Mint empty boxes up to targetReady. The deficit subtracts BOTH confirmed and
   * still-minted (in-flight) boxes so a burst of ticks before the first mint
   * confirms does not over-mint the pool.
   */
  private async refill(): Promise<void> {
    const ready = await this.store.countReady();
    const pending = (await this.store.listMinted()).length;
    const deficit = this.opts.targetReady - ready - pending;
    for (let i = 0; i < deficit; i++) {
      const scid = await this.contract.deploy();
      await this.store.add(scid);
      this.emit("boxMinted", scid);
    }
  }
}
