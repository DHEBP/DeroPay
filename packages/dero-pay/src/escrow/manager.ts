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
 * const escrow = await manager.createEscrow({
 *   sellerAddress: "deto1q...",
 *   arbitratorAddress: "deto1q...",
 *   feeBasisPoints: 250,
 *   blockExpiration: 60,
 *   expectedAmount: 5_000_000_000_000n, // 5 DERO
 * });
 *
 * // Escrow is now deployed and being monitored
 * ```
 */

import { randomUUID } from "node:crypto";
import { WalletRpcClient } from "../rpc/wallet-rpc.js";
import { DaemonRpcClient } from "../rpc/daemon-rpc.js";
import { EscrowContract } from "./contract.js";
import {
  statusCodeToString,
  type CreateEscrowParams,
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
export class EscrowManager {
  private walletRpc: WalletRpcClient;
  private daemonRpc: DaemonRpcClient;
  private contract: EscrowContract;
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

  constructor(config?: EscrowManagerConfig) {
    this.walletRpc = new WalletRpcClient({
      url: config?.walletRpcUrl,
      auth: config?.rpcAuth,
    });

    this.daemonRpc = new DaemonRpcClient({
      url: config?.daemonRpcUrl,
      auth: config?.rpcAuth,
    });

    this.contract = new EscrowContract(this.walletRpc, this.daemonRpc);

    this.pollIntervalMs = config?.pollIntervalMs ?? 10_000;
    this.defaultFeeBasisPoints = config?.defaultFeeBasisPoints ?? 250;
    this.defaultBlockExpiration = config?.defaultBlockExpiration ?? 60;
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
  async createEscrow(params: CreateEscrowParams): Promise<EscrowRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const record: EscrowRecord = {
      id,
      scid: null,
      deployTxid: null,
      status: "deploying",
      sellerAddress: params.sellerAddress,
      arbitratorAddress: params.arbitratorAddress,
      feeBasisPoints: params.feeBasisPoints ?? this.defaultFeeBasisPoints,
      blockExpiration: params.blockExpiration ?? this.defaultBlockExpiration,
      expectedAmount: params.expectedAmount ?? null,
      depositAmount: null,
      buyerAddress: null,
      createdAt: now,
      depositedAt: null,
      resolvedAt: null,
      resolution: null,
      invoiceId: null,
      metadata: params.metadata ?? {},
    };

    // Store locally before deploying (track the "deploying" state)
    this.escrows.set(id, record);

    try {
      const txid = await this.contract.deploy({
        sellerAddress: params.sellerAddress,
        arbitratorAddress: params.arbitratorAddress,
        feeBasisPoints: record.feeBasisPoints,
        blockExpiration: record.blockExpiration,
      });

      // The TXID of the deploy transaction is the SCID
      record.deployTxid = txid;
      record.scid = txid;
      record.status = "awaiting_deposit";

      // Index by SCID for fast lookups
      this.scidToId.set(txid, id);

      this.emit("escrowDeployed", { ...record });
    } catch (err) {
      record.status = "deploy_failed";
      this.emit(
        "escrowDeployFailed",
        { ...record },
        err instanceof Error ? err : new Error(String(err))
      );
    }

    return { ...record };
  }

  /**
   * Get an escrow record by its local ID.
   */
  getEscrow(id: string): EscrowRecord | null {
    const record = this.escrows.get(id);
    return record ? { ...record } : null;
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
      "deploy_failed",
    ];
    return Array.from(this.escrows.values()).filter(
      (e) => !terminalStatuses.includes(e.status)
    ).length;
  }

  /**
   * Import an existing escrow (e.g. from persistent storage on restart).
   */
  importEscrow(record: EscrowRecord): void {
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
      record.depositAmount = BigInt(onChain.escrowBalance);
      record.buyerAddress = onChain.buyer;
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

    if (newStatus === "arbitrated") {
      record.resolvedAt = now;
      // Determine direction from balance: if seller has funds, released to seller
      record.resolution =
        onChain.escrowBalance === 0
          ? "arbitrator_released_seller" // funds left the SC
          : "arbitrator_refunded_buyer";
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
