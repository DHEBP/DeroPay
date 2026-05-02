/**
 * XSWD payment client for browser-side "Pay with DERO" flows.
 *
 * Extends the XSWD WebSocket protocol (used in dero-auth) with
 * payment-specific methods: Transfer and GetBalance.
 *
 * This allows customers to pay invoices directly from their DERO
 * wallet through the dApp without manual copy/paste of addresses.
 *
 * Default endpoints:
 *   - Engram wallet: ws://localhost:44326/xswd (mainnet)
 *   - CLI wallet:    ws://localhost:10103/xswd (mainnet)
 */

import type { WalletStatus } from "../core/types.js";
import {
  XSWDConnector,
  type XSWDAppData,
  type XSWDConnectorEvents,
} from "./connectors/xswd/XSWDConnector.js";
import {
  defaultWalletConnectorPolicy,
  type WalletConnectorPolicy,
} from "./connectors/index.js";

/** XSWD application registration data */
export type XSWDPayAppData = XSWDAppData;

/** Events emitted by the XSWD pay client */
export type XSWDPayEvents = XSWDConnectorEvents;

/**
 * XSWD client extended with payment methods for customer-side usage.
 *
 * Usage:
 * ```ts
 * const client = new XSWDPayClient({ appName: "My Store" });
 * const address = await client.connect();
 * const txid = await client.transfer("deroi...", 5000000000000n); // 5 DERO
 * ```
 */
export class XSWDPayClient {
  private readonly connector: XSWDConnector;
  private readonly appName: string;
  private walletAddress: string | null = null;
  private readonly policy: WalletConnectorPolicy;

  constructor(options?: {
    url?: string;
    appName?: string;
    appDescription?: string;
    connectTimeoutMs?: number;
    policy?: Partial<WalletConnectorPolicy>;
  }) {
    this.appName = options?.appName ?? "DeroPay";
    this.policy = {
      ...defaultWalletConnectorPolicy,
      ...options?.policy,
    };
    this.connector = new XSWDConnector({
      url: options?.url,
      appName: this.appName,
      appDescription: options?.appDescription,
      connectTimeoutMs: options?.connectTimeoutMs,
    });
    this.connector.on("addressReceived", (address) => {
      this.walletAddress = address;
    });
  }

  /** Get the current connection status */
  getStatus(): WalletStatus {
    return this.connector.getStatus();
  }

  /** Get the connected wallet address (null if not connected) */
  getAddress(): string | null {
    return this.walletAddress ?? this.connector.getState().address ?? null;
  }

  /** Register an event listener */
  on<K extends keyof XSWDPayEvents>(event: K, callback: XSWDPayEvents[K]): () => void {
    return this.connector.on(event, callback);
  }

  /**
   * Connect to the DERO wallet via XSWD.
   * @returns The wallet's DERO address
   */
  async connect(): Promise<string> {
    const state = await this.connector.connect({
      appName: this.appName,
      policy: this.policy,
      nativeWalletConfirmation: true,
    });
    this.walletAddress = state.address ?? null;
    return this.walletAddress ?? (await this.connector.getAddress());
  }

  /** Disconnect from the wallet */
  disconnect(): void {
    void this.connector.disconnect();
    this.walletAddress = null;
  }

  /**
   * Send DERO to an address from the connected wallet.
   *
   * The wallet will show a confirmation dialog to the user.
   *
   * @param destination - Destination address (can be an integrated address)
   * @param amount - Amount in atomic units
   * @param ringsize - Ring size (default: 16)
   * @returns Transaction ID
   */
  async transfer(
    destination: string,
    amount: bigint,
    ringsize: number = 16
  ): Promise<string> {
    const result = await this.connector.transfer({
      transfers: [{ destination, amountAtomic: amount }],
      ringsize,
    });
    return result.txid;
  }

  /**
   * Get the wallet balance.
   *
   * @param scid - Optional SCID for token balance (empty = native DERO)
   */
  async getBalance(scid?: string): Promise<{
    balance: bigint;
    unlockedBalance: bigint;
  }> {
    const result = await this.connector.getBalance(scid);
    return {
      balance: result.totalAtomic,
      unlockedBalance: result.unlockedAtomic,
    };
  }

  // -------------------------------------------------------------------------
  // Smart Contract operations
  // -------------------------------------------------------------------------

  /**
   * Invoke a smart contract function from the connected wallet.
   *
   * The wallet will show a confirmation dialog to the user.
   *
   * @param scid - Smart Contract ID
   * @param entrypoint - Function name to call
   * @param args - Additional SC_RPC arguments
   * @param deposit - DERO amount (atomic units) to deposit into the SC
   * @param ringsize - Ring size (default: 2)
   * @returns Transaction ID
   */
  async scinvoke(
    scid: string,
    entrypoint: string,
    args?: Array<{ name: string; datatype: string; value: unknown }>,
    deposit?: bigint,
    ringsize: number = 2
  ): Promise<string> {
    const scRpc = [
      { name: "entrypoint", datatype: "S", value: entrypoint },
      ...(args ?? []),
    ];

    const result = await this.connector.scInvoke({
      scid,
      scRpc,
      ringsize,
      deroDepositAtomic: deposit,
    });
    return result.txid;
  }

  /**
   * Deposit DERO into an escrow smart contract.
   * Convenience wrapper around scinvoke for the Deposit() function.
   */
  async escrowDeposit(scid: string, amount: bigint): Promise<string> {
    return this.scinvoke(scid, "Deposit", [], amount);
  }

  /**
   * Confirm delivery on an escrow contract (buyer action).
   * Releases funds to the seller minus the platform fee.
   */
  async escrowConfirmDelivery(scid: string): Promise<string> {
    return this.scinvoke(scid, "ConfirmDelivery");
  }

  /**
   * Raise a dispute on an escrow contract (buyer action).
   * Locks funds until the arbitrator resolves.
   */
  async escrowDispute(scid: string): Promise<string> {
    return this.scinvoke(scid, "Dispute");
  }
}
