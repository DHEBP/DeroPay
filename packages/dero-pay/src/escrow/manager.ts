/**
 * EscrowManager — lifecycle orchestrator for escrow payments.
 *
 * Manages the full lifecycle of escrow transactions:
 * 1. Deploys escrow smart contracts
 * 2. Polls on-chain state for status changes
 * 3. Emits events on transitions (funded, released, disputed, etc.)
 * 4. Maintains local records for fast lookups
 *
 * Usage:
 * ```ts
 * const manager = new EscrowManager({
 *   walletRpcUrl: "http://127.0.0.1:30000/json_rpc",
 *   daemonRpcUrl: "http://127.0.0.1:20000/json_rpc",
 * });
 *
 * await manager.start();
 *
 * // Merchant-known-buyer fast path (quote + deploy in one call):
 * const escrow = await manager.createEscrow({
 *   sellerAddress: "dero1q...",      // base address (NOT integrated deto1…)
 *   buyerAddress: "dero1q...",       // base addr; only this addr may fund (must match SIGNER())
 *   arbitratorAddress: "dero1q...",
 *   feeBasisPoints: 250,
 *   blockExpiration: 9600,           // ~2 days at ~18s/block; must be >= 4000
 *   expectedAmount: 5_000_000_000_000n, // 5 DERO — deposit must be >= this
 * });
 *
 * // Open flow: createEscrowQuote(...) then claimEscrow(id, provenBuyerAddr)
 * // once the buyer connects their wallet.
 * ```
 */

import { randomUUID } from "node:crypto";
import { WalletRpcClient } from "../rpc/wallet-rpc.js";
import { DaemonRpcClient } from "../rpc/daemon-rpc.js";
import { EscrowContract } from "./contract.js";
import {
  statusCodeToString,
  type CreateEscrowParams,
  type CreateEscrowQuoteParams,
  type EscrowManagerConfig,
  type EscrowManagerEvents,
  type EscrowRecord,
  type EscrowResolution,
  type EscrowStatus,
  type EscrowOnChainState,
} from "./types.js";

/**
 * EscrowManager orchestrates the lifecycle of escrow smart contracts.
 */
/**
 * Durable compare-and-set hook for the quote->claim single-claim guard.
 *
 * The in-memory guard in {@link EscrowManager.claimEscrow} is atomic ONLY
 * within a single process. The stated deployment target is a persistent,
 * multi-process server; there, two workers can both read a "quoted" record and
 * both proceed to deploy (a TOCTOU that re-opens the buyer-seat hijack at the
 * claim window). Injecting a durable CAS closes this: `tryClaim` must perform an
 * atomic conditional write (e.g. `UPDATE escrows SET status='deploying' WHERE
 * id=$1 AND status='quoted'`) and return true ONLY if THIS caller won the row.
 */
export interface EscrowClaimGuard {
  /**
   * Whether this guard is atomic ACROSS processes. A process-local guard (e.g.
   * the in-memory Set) is `false` and provides NO protection in a clustered
   * deployment; a shared-storage guard (SQLite/DB) is `true`. The engine uses
   * this to fail LOUD at startup when a multi-process server is configured with
   * a process-local guard (O4) instead of silently failing open.
   */
  readonly durable: boolean;
  /** Atomically flip id from 'quoted' to 'deploying'. Returns true iff this
   *  caller won the transition (i.e. it was still 'quoted'). */
  tryClaim(id: string): Promise<boolean>;
  /** Roll the row back to 'quoted' if the subsequent deploy failed. */
  releaseClaim(id: string): Promise<void>;
  /**
   * Record the deploy TXID against a won claim as soon as the deploy is
   * broadcast, BEFORE the (separate) invoice-blob persist. This is the durable
   * breadcrumb a crash-recovery reconciler follows: a held row carrying a
   * deployTxid means "an on-chain contract for this quote exists" even if the
   * invoice blob never got its scid (O5). Optional so process-local guards may
   * no-op. */
  recordDeployTxid?(id: string, txid: string): Promise<void>;
  /**
   * Enumerate held claim rows for crash recovery (O5). Returns every claimed id
   * with the deployTxid recorded (or null if the crash happened before the
   * deploy was even broadcast) AND the claimedAt epoch-ms the row was won.
   *
   * claimedAt is load-bearing for O12: the reconciler MUST NOT release a row a
   * live peer worker is still mid-deploy against (it has won tryClaim but not yet
   * reached recordDeployTxid). Because a broadcast completes in seconds while a
   * crashed claim leaves an aged row, the reconciler only heals/releases rows
   * older than a deploy lease — never a fresh, actively-deploying peer's row.
   * Optional; a process-local guard returns nothing durable so it may omit this.
   */
  listClaims?(): Promise<
    Array<{ id: string; deployTxid: string | null; claimedAt: number }>
  >;
  /**
   * O18 — return held rows that are OLDER than `leaseMs`, with the age computed
   * against the SAME clock authority that stamped `claimed_at`. The reconciler
   * MUST use this instead of comparing `claimedAt` to its own `Date.now()`:
   * `claimed_at` is stamped by the DEPLOYING worker and the cutoff is evaluated
   * by the RECONCILING worker, which in a multi-host cluster is a different wall
   * clock. Cross-host NTP skew larger than (lease − broadcast latency) would let
   * a reconciler free a live, mid-broadcast peer row and re-open the double-deploy
   * A12 closed. Evaluating age inside the guard (SQLite `unixepoch`) makes the
   * lease a single-clock interval. Each returned row is eligible to heal/release.
   * Optional; a process-local guard has no cross-host concern so it may omit this
   * and the reconciler falls back to listClaims() (single-process = one clock).
   */
  listExpiredClaims?(
    leaseMs: number
  ): Promise<
    Array<{ id: string; deployTxid: string | null; claimedAt: number }>
  >;
}

export class EscrowManager {
  private walletRpc: WalletRpcClient;
  private daemonRpc: DaemonRpcClient;
  private contract: EscrowContract;
  private claimGuard: EscrowClaimGuard | null;
  private escrows: Map<string, EscrowRecord> = new Map();
  private scidToId: Map<string, string> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isStarted = false;

  private pollIntervalMs: number;
  private defaultFeeBasisPoints: number;
  private defaultBlockExpiration: number;

  private listeners: Partial<{
    [K in keyof EscrowManagerEvents]: EscrowManagerEvents[K][];
  }> = {};

  constructor(
    config?: EscrowManagerConfig & {
      /** Inject RPC clients (for testing); when set, walletRpcUrl/daemonRpcUrl are ignored */
      walletRpc?: WalletRpcClient;
      daemonRpc?: DaemonRpcClient;
      /**
       * Durable single-claim guard. REQUIRED for any multi-process deployment:
       * without it the quote->claim transition is only process-atomic and a
       * claim-race attacker can re-open the buyer-seat hijack. When omitted the
       * manager falls back to the in-memory guard (safe ONLY for a single
       * process / tests).
       */
      claimGuard?: EscrowClaimGuard;
    }
  ) {
    this.walletRpc =
      config?.walletRpc ??
      new WalletRpcClient({
        url: config?.walletRpcUrl,
        auth: config?.rpcAuth,
      });

    this.daemonRpc =
      config?.daemonRpc ??
      new DaemonRpcClient({
        url: config?.daemonRpcUrl,
        auth: config?.rpcAuth,
      });

    this.contract = new EscrowContract(this.walletRpc, this.daemonRpc);
    this.claimGuard = config?.claimGuard ?? null;

    this.pollIntervalMs = config?.pollIntervalMs ?? 10_000;
    this.defaultFeeBasisPoints = config?.defaultFeeBasisPoints ?? 250;
    // ~2 days at ~18s/block. Must be >= the on-chain 4000-block floor; a shorter
    // default would revert at deploy and, worse, would give a human buyer too
    // little time to dispute before ClaimAfterExpiry becomes callable.
    this.defaultBlockExpiration = config?.defaultBlockExpiration ?? 9600;
  }

  // -------------------------------------------------------------------------
  // Event system
  // -------------------------------------------------------------------------

  /** Register an event listener. Returns an unsubscribe function. */
  on<K extends keyof EscrowManagerEvents>(
    event: K,
    callback: EscrowManagerEvents[K]
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as EscrowManagerEvents[K][]).push(callback);
    return () => {
      const arr = this.listeners[event] as EscrowManagerEvents[K][];
      const idx = arr.indexOf(callback);
      if (idx !== -1) arr.splice(idx, 1);
    };
  }

  private emit<K extends keyof EscrowManagerEvents>(
    event: K,
    ...args: Parameters<EscrowManagerEvents[K]>
  ): void {
    const callbacks = this.listeners[event] as EscrowManagerEvents[K][] | undefined;
    if (callbacks) {
      for (const cb of callbacks) {
        (cb as (...a: unknown[]) => void)(...args);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start the escrow manager.
   * Begins polling tracked escrows for on-chain status changes.
   */
  async start(): Promise<void> {
    if (this.isStarted) return;

    // Verify connectivity
    const walletOk = await this.walletRpc.ping();
    if (!walletOk) {
      throw new Error("Cannot reach wallet RPC for escrow manager");
    }

    const daemonOk = await this.daemonRpc.ping();
    if (!daemonOk) {
      throw new Error("Cannot reach daemon RPC for escrow manager");
    }

    // Start polling
    this.pollTimer = setInterval(() => this.pollEscrows(), this.pollIntervalMs);
    this.isStarted = true;
  }

  /**
   * Stop the escrow manager.
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isStarted = false;
  }

  /** Whether the manager is running */
  get running(): boolean {
    return this.isStarted;
  }

  // -------------------------------------------------------------------------
  // Escrow CRUD
  // -------------------------------------------------------------------------

  /**
   * Create and deploy a new escrow smart contract.
   *
   * Deploys the contract on-chain and returns a local EscrowRecord
   * that starts being polled for status updates.
   */
  /**
   * Phase 1 — create a local QUOTE. No buyer, no on-chain deployment.
   *
   * The contract is NOT deployed until {@link claimEscrow} binds a proven
   * buyer address. This is what structurally closes the deposit front-run:
   * no unbound-buyer contract ever exists on-chain for an attacker to race.
   */
  async createEscrowQuote(params: CreateEscrowQuoteParams): Promise<EscrowRecord> {
    if (params.expectedAmount == null || params.expectedAmount <= 0n) {
      throw new Error("expectedAmount (> 0) is required to quote an escrow");
    }

    // Fee ceiling enforced at quote time too, so a predatory/misconfigured fee
    // is rejected before a buyer ever claims (matches deploy() + on-chain cap).
    const quotedFee = params.feeBasisPoints ?? this.defaultFeeBasisPoints;
    if (!Number.isInteger(quotedFee) || quotedFee < 0 || quotedFee >= 5000) {
      throw new Error(
        `feeBasisPoints must be an integer in [0, 5000) (< 50%), got ${quotedFee}`
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const record: EscrowRecord = {
      id,
      scid: null,
      deployTxid: null,
      status: "quoted",
      sellerAddress: params.sellerAddress,
      arbitratorAddress: params.arbitratorAddress,
      feeBasisPoints: params.feeBasisPoints ?? this.defaultFeeBasisPoints,
      blockExpiration: params.blockExpiration ?? this.defaultBlockExpiration,
      expectedAmount: params.expectedAmount,
      depositAmount: null,
      buyerAddress: null,
      createdAt: now,
      depositedAt: null,
      resolvedAt: null,
      resolution: null,
      invoiceId: null,
      metadata: params.metadata ?? {},
    };

    this.escrows.set(id, record);
    return { ...record };
  }

  /**
   * Phase 2 — bind a proven buyer and deploy the contract on-chain.
   *
   * IMPORTANT: `buyerAddress` MUST come from an authenticated / wallet-connect
   * source. Binding an unproven address would let refunds and dispute payouts
   * go to the wrong party. Guarded so a quote can be claimed only once.
   *
   * Note: the in-memory status guard is atomic within a single process. A
   * server that persists escrows across processes must back this with a
   * durable compare-and-set to prevent a double-deploy under a claim race.
   */
  async claimEscrow(id: string, buyerAddress: string): Promise<EscrowRecord> {
    const record = this.escrows.get(id);
    if (!record) {
      throw new Error(`escrow ${id} not found`);
    }
    // Single-claim guard (compare-and-set; no await before the state flip).
    if (record.status !== "quoted") {
      throw new Error(
        `escrow ${id} is not claimable (status: ${record.status})`
      );
    }
    if (record.expectedAmount == null) {
      throw new Error(`escrow ${id} has no expectedAmount; cannot deploy`);
    }
    // Collusion + validity guards that can only be checked once the buyer is
    // known (quote time only had seller + arbitrator). The buyer must not be a
    // party that would neutralize the escrow's protections, and must differ from
    // the seller. Also enforced on-chain in Initialize (lines 29-31); mirrored
    // here so the deploy gas is never spent on a doomed contract.
    if (buyerAddress === record.sellerAddress) {
      throw new Error("buyer == seller is not a valid escrow.");
    }
    if (buyerAddress === record.arbitratorAddress) {
      throw new Error(
        "buyer == arbitrator: a buyer cannot arbitrate their own dispute. Use a distinct, neutral arbitrator."
      );
    }

    // Single-claim CAS. In a multi-process deployment the in-memory status flip
    // below is NOT sufficient (two workers can both observe 'quoted'); a durable
    // guard must win the row atomically first. If a durable guard is configured
    // and THIS caller did not win, the quote was already claimed by another
    // worker — reject rather than deploy a second contract.
    if (this.claimGuard) {
      const won = await this.claimGuard.tryClaim(id);
      if (!won) {
        // O17 — the loser MUST NOT mutate its local view. This record is a rebuilt
        // copy of a quote THIS worker does not own and will never deploy. Flipping
        // it to 'deploying' would strand a scid-less, buyer-less record permanently
        // in the escrows map, poisoning every later getEscrowByScid / poll / import
        // that trusts the in-memory record (the winning worker's deploy lives in
        // ITS process; nothing in this process ever reconciles this stale copy).
        // Drop the untracked loser copy instead so a later getEscrow re-imports a
        // fresh, faithful view from the durable invoice when needed.
        this.escrows.delete(id);
        throw new Error(
          `escrow ${id} was concurrently claimed by another worker; not claimable`
        );
      }
    }
    record.status = "deploying";
    record.buyerAddress = buyerAddress;

    try {
      const txid = await this.contract.deploy({
        sellerAddress: record.sellerAddress,
        buyerAddress,
        arbitratorAddress: record.arbitratorAddress,
        feeBasisPoints: record.feeBasisPoints,
        blockExpiration: record.blockExpiration,
        expectedAmount: record.expectedAmount,
      });

      // O5 — the on-chain contract now EXISTS (the deploy TX is broadcast).
      // Stamp the deployTxid onto the held guard row FIRST, before the caller's
      // separate invoice-blob persist. If the process dies in the window between
      // here and that persist, the held row carries the txid so the startup
      // reconciler can find the orphaned live contract and heal the invoice
      // instead of stranding a fundable escrow forever.
      if (this.claimGuard?.recordDeployTxid) {
        try {
          await this.claimGuard.recordDeployTxid(id, txid);
        } catch {
          // best-effort breadcrumb; deploy already succeeded either way.
        }
      }

      // The TXID of the deploy transaction is the SCID
      record.deployTxid = txid;
      record.scid = txid;
      record.status = "awaiting_deposit";

      // Index by SCID for fast lookups
      this.scidToId.set(txid, id);

      this.emit("escrowDeployed", { ...record });
    } catch (err) {
      record.status = "deploy_failed";
      // O6 — do NOT release the durable claim here. Releasing before the caller
      // has persisted escrowStatus='deploy_failed' would open a window where the
      // row is free AND the durable invoice still reads 'quoted', letting a
      // second worker win the row and deploy a SECOND contract. The engine
      // releases the row only AFTER persisting deploy_failed, so the invoice-
      // level 'must be quoted' gate is closed before the row can be re-won. See
      // claimEscrowInvoice's deploy_failed branch.
      this.emit(
        "escrowDeployFailed",
        { ...record },
        err instanceof Error ? err : new Error(String(err))
      );
    }

    return { ...record };
  }

  /**
   * Convenience for the merchant-known-buyer fast path: quote + immediately
   * claim (deploy) in one call. Requires the buyer address up front.
   */
  async createEscrow(params: CreateEscrowParams): Promise<EscrowRecord> {
    const quote = await this.createEscrowQuote(params);
    return this.claimEscrow(quote.id, params.buyerAddress);
  }

  /**
   * Get an escrow record by its local ID.
   */
  getEscrow(id: string): EscrowRecord | null {
    const record = this.escrows.get(id);
    return record ? { ...record } : null;
  }

  /** The configured single-claim guard, or null if none was injected. Exposed
   *  so the engine can assert a durable guard in a multi-process deployment (O4). */
  getClaimGuard(): EscrowClaimGuard | null {
    return this.claimGuard;
  }

  /**
   * Get an escrow record by its SCID.
   */
  getEscrowByScid(scid: string): EscrowRecord | null {
    const id = this.scidToId.get(scid);
    if (!id) return null;
    return this.getEscrow(id);
  }

  /**
   * List all tracked escrows, optionally filtered by status.
   */
  listEscrows(statusFilter?: EscrowStatus[]): EscrowRecord[] {
    const records = Array.from(this.escrows.values());
    if (!statusFilter || statusFilter.length === 0) {
      return records.map((r) => ({ ...r }));
    }
    return records
      .filter((r) => statusFilter.includes(r.status))
      .map((r) => ({ ...r }));
  }

  /**
   * Get the number of active (non-terminal) escrows being tracked.
   */
  get activeCount(): number {
    const terminalStatuses: EscrowStatus[] = [
      "released",
      "refunded",
      "expired_claimed",
      "arbitrated",
      "cancelled",
      "deploy_failed",
    ];
    return Array.from(this.escrows.values()).filter(
      (e) => !terminalStatuses.includes(e.status)
    ).length;
  }

  /**
   * Import an existing escrow (e.g. from persistent storage on restart).
   *
   * O17 — the import is DEFENSIVE, not unconditional. A rebuild-on-any-worker
   * path (claimEscrowInvoice / the reconciler) calls this whenever getEscrow()
   * returns falsy, but a near-simultaneous request in the SAME process can have
   * already advanced the record past 'quoted' (deploying/awaiting_deposit) and
   * bound its scid. An unconditional `set` would blow that live binding away with
   * a fresh scid=null 'quoted' record and desync scidToId. So: NEVER overwrite an
   * existing record that is already past 'quoted'. If a record already exists and
   * is in a live/deployed state, the import is a no-op (the caller's rebuild is
   * stale). We only accept the import when there is no record, or the existing one
   * is still a scid-less 'quoted'/'deploying' placeholder being (re)hydrated.
   */
  importEscrow(record: EscrowRecord): void {
    const existing = this.escrows.get(record.id);
    if (existing) {
      const liveStatuses: EscrowStatus[] = [
        "awaiting_deposit",
        "funded",
        "disputed",
        "released",
        "refunded",
        "expired_claimed",
        "arbitrated",
      ];
      // Existing record already advanced with a real scid: refuse to clobber it
      // with a stale scid-less rebuild. Preserve the live binding.
      if (existing.scid && liveStatuses.includes(existing.status) && !record.scid) {
        return;
      }
    }
    this.escrows.set(record.id, { ...record });
    if (record.scid) {
      this.scidToId.set(record.scid, record.id);
    }
  }

  /**
   * Stop tracking an escrow (removes from polling, keeps in memory).
   */
  untrack(id: string): void {
    const record = this.escrows.get(id);
    if (record?.scid) {
      this.scidToId.delete(record.scid);
    }
    this.escrows.delete(id);
  }

  // -------------------------------------------------------------------------
  // Direct contract operations (for manual invocations)
  // -------------------------------------------------------------------------

  /**
   * Deposit DERO into an escrow contract (buyer action).
   *
   * Note: this uses the *current wallet* as the depositor.
   * For buyer-initiated deposits from their own wallet, use the
   * XSWD client-side flow instead.
   */
  async deposit(scidOrId: string, amount: bigint): Promise<string> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.deposit(scid, amount);
  }

  /**
   * Confirm delivery (buyer action) — releases funds to seller.
   */
  async confirmDelivery(scidOrId: string): Promise<string> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.confirmDelivery(scid);
  }

  /**
   * Cancel a never-funded escrow (seller/owner action). Recovers a status-0
   * contract whose bound buyer never deposited — e.g. the buyer proved wallet A
   * at claim but can only fund from wallet B, so Deposit() perpetually reverts.
   * No funds are at risk (escrowBalance is 0 in status 0).
   */
  async cancelUnfunded(scidOrId: string): Promise<string> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.cancelUnfunded(scid);
  }

  /**
   * Nominate a new owner for an escrow (current-owner action). Two-step: the
   * successor must claimOwnership() to take over. Used to rotate owner authority
   * onto a cold key, bounding a hot-key compromise across the escrow book.
   */
  async transferOwnership(scidOrId: string, newOwner: string): Promise<string> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.transferOwnership(scid, newOwner);
  }

  /**
   * Accept a pending ownership nomination (successor action).
   */
  async claimOwnership(scidOrId: string): Promise<string> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.claimOwnership(scid);
  }

  /**
   * Refund the buyer (seller/owner action).
   */
  async refundBuyer(scidOrId: string): Promise<string> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.refundBuyer(scid);
  }

  /**
   * Claim funds after expiry (seller action).
   */
  async claimAfterExpiry(scidOrId: string): Promise<string> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.claimAfterExpiry(scid);
  }

  /**
   * Raise a dispute (buyer action).
   */
  async dispute(scidOrId: string): Promise<string> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.dispute(scid);
  }

  /**
   * Arbitrate a dispute (arbitrator action).
   */
  async arbitrate(scidOrId: string, releaseToSeller: boolean): Promise<string> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.arbitrate(scid, releaseToSeller);
  }

  /**
   * Query the live on-chain state of an escrow contract.
   */
  async getOnChainState(scidOrId: string): Promise<EscrowOnChainState> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.getState(scid);
  }

  /**
   * Get the underlying EscrowContract for advanced usage.
   */
  getContract(): EscrowContract {
    return this.contract;
  }

  // -------------------------------------------------------------------------
  // Internal: polling
  // -------------------------------------------------------------------------

  /**
   * Poll all tracked escrows for on-chain status changes.
   */
  private async pollEscrows(): Promise<void> {
    const activeStatuses: EscrowStatus[] = [
      "awaiting_deposit",
      "funded",
      "disputed",
      "deploying",
    ];

    for (const record of this.escrows.values()) {
      // Only poll active escrows that have an SCID
      if (!record.scid || !activeStatuses.includes(record.status)) continue;

      try {
        const onChain = await this.contract.getState(record.scid);
        this.reconcile(record, onChain);
      } catch (err) {
        this.emit(
          "error",
          new Error(`Failed to poll escrow ${record.id}: ${err}`)
        );
      }
    }
  }

  /**
   * Reconcile local record with on-chain state,
   * emitting events for any status transitions.
   */
  private reconcile(record: EscrowRecord, onChain: EscrowOnChainState): void {
    const previousStatus = record.status;
    const newStatus = onChain.status;

    // No change
    if (previousStatus === newStatus) return;

    // Update the local record
    record.status = newStatus;

    // Track transitions
    const now = new Date().toISOString();

    if (newStatus === "funded" && previousStatus === "awaiting_deposit") {
      // O18 — do NOT settle a funded escrow on the on-chain status code alone.
      // Independently verify the funded AMOUNT before telling the invoice layer
      // (and thus the merchant) that this escrow is paid and shippable:
      //   1. onChain.escrowBalance MUST equal the expectedAmount we bound at
      //      claim (which O14 already tied to the invoice price). Today Deposit()
      //      stores escrowBalance = expectedAmount, so they agree — but the SDK
      //      must not take that on faith: any future contract edit, partial-
      //      deposit path, or getSc parse quirk that made them diverge would
      //      otherwise settle a wrong-amount invoice as fully funded.
      //   2. onChain.scBalance (the contract's ACTUAL DERO holdings) MUST cover
      //      escrowBalance. escrowBalance is a STORE()'d number; scBalance is the
      //      real locked value. If the contract claims a balance it does not hold,
      //      refuse to settle.
      // On mismatch we do NOT flip the record to funded and do NOT emit
      // escrowFunded; instead we surface an alert and leave the escrow in
      // awaiting_deposit so the invoice never reaches escrow_funded/completed off
      // an unverified amount. Fund-safety: the buyer's real deposit is still on
      // the contract and remains recoverable via the normal refund/expiry paths.
      const expected = record.expectedAmount;
      const onChainBalance = BigInt(onChain.escrowBalance);
      const scBalance = BigInt(onChain.scBalance);
      const amountOk = expected != null && onChainBalance === expected;
      const custodyOk = scBalance >= onChainBalance;
      if (!amountOk || !custodyOk) {
        // Revert the optimistic status bump — this is NOT a clean funded state.
        record.status = previousStatus;
        this.emit(
          "escrowFundingMismatch",
          { ...record },
          {
            expectedAmount: expected,
            onChainBalance,
            scBalance,
            reason: !amountOk ? "amount_mismatch" : "custody_shortfall",
          }
        );
        this.emit(
          "error",
          new Error(
            `Escrow ${record.id} funded-amount verification failed ` +
              `(expected=${expected} onChainBalance=${onChainBalance} scBalance=${scBalance}); ` +
              `not settling.`
          )
        );
        return;
      }
      record.depositAmount = onChainBalance;
      // DO NOT overwrite record.buyerAddress with onChain.buyer here.
      // The contract stores buyer via STORE("buyer", ADDRESS_RAW(...)) — the
      // 33-byte RAW point, which GetSC returns as an opaque hex string, NOT the
      // deto1/dero1 bech32 that claimEscrow bound. Overwriting would flip the
      // record (and every downstream webhook/accounting consumer) from the
      // proven, actionable address to an un-actionable hex blob. The proven
      // bech32 bound at claim time is authoritative; the on-chain RAW form is
      // surfaced separately as onChainBuyerRaw for verification only.
      record.onChainBuyerRaw = onChain.buyer;
      record.depositedAt = now;
      this.emit("escrowFunded", { ...record });
    }

    if (newStatus === "released") {
      record.resolvedAt = now;
      record.resolution = "buyer_confirmed";
      this.emit("escrowReleased", { ...record });
    }

    if (newStatus === "refunded") {
      record.resolvedAt = now;
      // We can't distinguish seller vs owner refund from on-chain state alone
      record.resolution = "seller_refunded";
      this.emit("escrowRefunded", { ...record });
    }

    if (newStatus === "expired_claimed") {
      record.resolvedAt = now;
      record.resolution = "seller_claimed_expiry";
      this.emit("escrowReleased", { ...record });
    }

    if (newStatus === "disputed") {
      this.emit("escrowDisputed", { ...record });
    }

    if (newStatus === "cancelled") {
      record.resolvedAt = now;
      record.resolution = null;
      // Emit so the invoice layer can re-quote a fresh escrow onto a still-open
      // invoice. A CancelUnfunded only ever hits a never-funded (status 0)
      // contract, so no funds are at risk — but the buyer's bound SCID is now
      // dead and must be replaced for their paid intent to proceed.
      this.emit("escrowCancelled", { ...record });
    }

    if (newStatus === "arbitrated") {
      record.resolvedAt = now;
      // Direction is read from the on-chain `arbitrateResult` flag the contract
      // writes in each Arbitrate() branch (1 = seller, 0 = buyer). Balance can
      // NOT disambiguate: both branches zero escrowBalance. If the flag is
      // somehow absent (older contract), leave resolution null rather than
      // reporting a false seller-release for a buyer refund.
      record.resolution =
        onChain.arbitrateResult === 1
          ? "arbitrator_released_seller"
          : onChain.arbitrateResult === 0
            ? "arbitrator_refunded_buyer"
            : null;
      this.emit("escrowArbitrated", { ...record });
    }

    this.emit("escrowStatusChanged", { ...record }, previousStatus);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve a string to an SCID.
   * Accepts either a local escrow ID or a direct SCID.
   */
  private resolveScid(scidOrId: string): string {
    // Check if it's a local ID first
    const record = this.escrows.get(scidOrId);
    if (record?.scid) return record.scid;

    // Check if it maps via the SCID index
    if (this.scidToId.has(scidOrId)) return scidOrId;

    // Assume it's a direct SCID
    return scidOrId;
  }
}
