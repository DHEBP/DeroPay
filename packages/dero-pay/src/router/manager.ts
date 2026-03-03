/**
 * RouterManager — lifecycle manager for payment router contracts.
 *
 * Manages deployment and interaction with payment router contracts.
 * Unlike EscrowManager, the router doesn't need polling — payments
 * are instant (single transaction, no state machine).
 *
 * Usage:
 * ```ts
 * const manager = new RouterManager({
 *   walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
 *   daemonRpcUrl: "http://127.0.0.1:10102/json_rpc",
 * });
 *
 * // Deploy a router with no fee (merchant keeps 100%)
 * const router = await manager.deployRouter();
 *
 * // Deploy a router with a 2% fee to a partner
 * const router = await manager.deployRouter({
 *   feeRecipientAddress: "deto1q...",
 *   feeBasisPoints: 200,
 * });
 *
 * // Send a payment through the router
 * const txid = await manager.pay(router.scid!, "inv_abc123", 50000n);
 * ```
 */

import { randomUUID } from "node:crypto";
import { WalletRpcClient } from "../rpc/wallet-rpc.js";
import { DaemonRpcClient } from "../rpc/daemon-rpc.js";
import { RouterContract } from "./contract.js";
import type {
  DeployRouterParams,
  RouterManagerConfig,
  RouterManagerEvents,
  RouterOnChainState,
  RouterRecord,
} from "./types.js";

export class RouterManager {
  private walletRpc: WalletRpcClient;
  private daemonRpc: DaemonRpcClient;
  private contract: RouterContract;
  private routers: Map<string, RouterRecord> = new Map();
  private scidToId: Map<string, string> = new Map();

  private listeners: Partial<{
    [K in keyof RouterManagerEvents]: RouterManagerEvents[K][];
  }> = {};

  constructor(config?: RouterManagerConfig) {
    this.walletRpc = new WalletRpcClient({
      url: config?.walletRpcUrl,
      auth: config?.rpcAuth,
    });

    this.daemonRpc = new DaemonRpcClient({
      url: config?.daemonRpcUrl,
      auth: config?.rpcAuth,
    });

    this.contract = new RouterContract(this.walletRpc, this.daemonRpc);
  }

  // -------------------------------------------------------------------------
  // Event system
  // -------------------------------------------------------------------------

  on<K extends keyof RouterManagerEvents>(
    event: K,
    callback: RouterManagerEvents[K]
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as RouterManagerEvents[K][]).push(callback);
    return () => {
      const arr = this.listeners[event] as RouterManagerEvents[K][];
      const idx = arr.indexOf(callback);
      if (idx !== -1) arr.splice(idx, 1);
    };
  }

  private emit<K extends keyof RouterManagerEvents>(
    event: K,
    ...args: Parameters<RouterManagerEvents[K]>
  ): void {
    const callbacks = this.listeners[event] as
      | RouterManagerEvents[K][]
      | undefined;
    if (callbacks) {
      for (const cb of callbacks) {
        (cb as (...a: unknown[]) => void)(...args);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------

  /**
   * Deploy a new payment router contract.
   *
   * The current wallet becomes the merchant (payment recipient).
   */
  async deployRouter(params?: DeployRouterParams): Promise<RouterRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const fee = params?.feeBasisPoints ?? 0;

    const record: RouterRecord = {
      id,
      scid: null,
      deployTxid: null,
      status: "deploying",
      feeRecipientAddress: params?.feeRecipientAddress ?? "",
      feeBasisPoints: fee,
      createdAt: now,
      metadata: {},
    };

    this.routers.set(id, record);

    try {
      const txid = await this.contract.deploy({
        feeRecipientAddress: params?.feeRecipientAddress,
        feeBasisPoints: fee,
      });

      record.deployTxid = txid;
      record.scid = txid;
      record.status = "active";

      this.scidToId.set(txid, id);
      this.emit("routerDeployed", { ...record });
    } catch (err) {
      record.status = "deploy_failed";
      this.emit(
        "routerDeployFailed",
        { ...record },
        err instanceof Error ? err : new Error(String(err))
      );
    }

    return { ...record };
  }

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  /**
   * Send a payment through a deployed router contract.
   *
   * The contract instantly splits the payment between the merchant
   * and the fee recipient.
   *
   * @param scidOrId - Router SCID or local ID
   * @param invoiceId - Invoice identifier for correlation
   * @param amount - Amount in atomic units
   * @returns Transaction ID
   */
  async pay(
    scidOrId: string,
    invoiceId: string,
    amount: bigint
  ): Promise<string> {
    const scid = this.resolveScid(scidOrId);
    const txid = await this.contract.pay(scid, invoiceId, amount);
    this.emit("paymentProcessed", scid, invoiceId, txid);
    return txid;
  }

  /**
   * Update the merchant address on a deployed router.
   * Only the current merchant can call this.
   */
  async updateMerchant(scidOrId: string, newAddress: string): Promise<string> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.updateMerchant(scid, newAddress);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Get a router record by its local ID. */
  getRouter(id: string): RouterRecord | null {
    const record = this.routers.get(id);
    return record ? { ...record } : null;
  }

  /** Get a router record by its SCID. */
  getRouterByScid(scid: string): RouterRecord | null {
    const id = this.scidToId.get(scid);
    if (!id) return null;
    return this.getRouter(id);
  }

  /** List all tracked routers. */
  listRouters(): RouterRecord[] {
    return Array.from(this.routers.values()).map((r) => ({ ...r }));
  }

  /** Query the live on-chain state of a router contract. */
  async getOnChainState(scidOrId: string): Promise<RouterOnChainState> {
    const scid = this.resolveScid(scidOrId);
    return this.contract.getState(scid);
  }

  /** Get the underlying RouterContract for advanced usage. */
  getContract(): RouterContract {
    return this.contract;
  }

  /**
   * Import an existing router (e.g. from persistent storage on restart).
   */
  importRouter(record: RouterRecord): void {
    this.routers.set(record.id, { ...record });
    if (record.scid) {
      this.scidToId.set(record.scid, record.id);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private resolveScid(scidOrId: string): string {
    const record = this.routers.get(scidOrId);
    if (record?.scid) return record.scid;
    if (this.scidToId.has(scidOrId)) return scidOrId;
    return scidOrId;
  }
}
