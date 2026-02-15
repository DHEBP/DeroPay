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

/** XSWD application registration data */
export type XSWDPayAppData = {
  id: string;
  name: string;
  description: string;
  url: string;
};

/** XSWD JSON-RPC response */
type XSWDResponse<T = unknown> = {
  jsonrpc?: string;
  id?: string;
  result?: T;
  error?: { code: number; message: string };
  message?: string;
  accepted?: boolean;
};

/** Events emitted by the XSWD pay client */
export type XSWDPayEvents = {
  statusChange: (status: WalletStatus) => void;
  addressReceived: (address: string) => void;
  error: (error: Error) => void;
};

/**
 * Generate a random 64-character hex ID for XSWD registration.
 */
function generateAppId(): string {
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto !== "undefined") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const DEFAULT_XSWD_URL = "ws://localhost:44326/xswd";

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
  private socket: WebSocket | null = null;
  private status: WalletStatus = "disconnected";
  private requestCounter = 1;
  private pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();
  private listeners: Partial<{
    [K in keyof XSWDPayEvents]: XSWDPayEvents[K][];
  }> = {};
  private url: string;
  private appData: XSWDPayAppData;
  private connectTimeoutMs: number;
  private walletAddress: string | null = null;

  constructor(options?: {
    url?: string;
    appName?: string;
    appDescription?: string;
    connectTimeoutMs?: number;
  }) {
    this.url = options?.url ?? DEFAULT_XSWD_URL;
    this.connectTimeoutMs = options?.connectTimeoutMs ?? 120_000;
    this.appData = {
      id: generateAppId(),
      name: options?.appName ?? "DeroPay",
      description:
        options?.appDescription ?? "Pay with your DERO wallet",
      url:
        typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost",
    };
  }

  /** Get the current connection status */
  getStatus(): WalletStatus {
    return this.status;
  }

  /** Get the connected wallet address (null if not connected) */
  getAddress(): string | null {
    return this.walletAddress;
  }

  /** Register an event listener */
  on<K extends keyof XSWDPayEvents>(event: K, callback: XSWDPayEvents[K]): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as XSWDPayEvents[K][]).push(callback);
    return () => {
      const arr = this.listeners[event] as XSWDPayEvents[K][];
      const idx = arr.indexOf(callback);
      if (idx !== -1) arr.splice(idx, 1);
    };
  }

  private emit<K extends keyof XSWDPayEvents>(
    event: K,
    ...args: Parameters<XSWDPayEvents[K]>
  ): void {
    const callbacks = this.listeners[event] as XSWDPayEvents[K][] | undefined;
    if (callbacks) {
      for (const cb of callbacks) {
        (cb as (...a: unknown[]) => void)(...args);
      }
    }
  }

  private setStatus(status: WalletStatus): void {
    this.status = status;
    this.emit("statusChange", status);
  }

  /**
   * Connect to the DERO wallet via XSWD.
   * @returns The wallet's DERO address
   */
  async connect(): Promise<string> {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      throw new Error("Already connected or connecting");
    }

    this.appData.id = generateAppId();
    if (typeof window !== "undefined") {
      this.appData.url = window.location.origin;
    }

    this.setStatus("connecting");

    return new Promise<string>((resolve, reject) => {
      const timeoutSec = Math.round(this.connectTimeoutMs / 1000);
      const timeoutId = setTimeout(() => {
        this.disconnect();
        reject(new Error(`Connection timeout (${timeoutSec}s). Is the wallet running?`));
      }, this.connectTimeoutMs);

      try {
        this.socket = new WebSocket(this.url);
      } catch {
        clearTimeout(timeoutId);
        this.setStatus("error");
        reject(new Error(`Failed to create WebSocket connection to ${this.url}`));
        return;
      }

      this.socket.onopen = () => {
        this.socket!.send(JSON.stringify(this.appData));
      };

      this.socket.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data) as XSWDResponse;

          if (response.accepted === false) {
            clearTimeout(timeoutId);
            this.setStatus("error");
            const err = new Error(response.message ?? "Connection rejected by wallet");
            this.emit("error", err);
            reject(err);
            return;
          }

          if (response.accepted === true) {
            this.setStatus("connected");

            this.sendRequest<string | { address: string }>("GetAddress")
              .then((result) => {
                const address =
                  typeof result === "object" && result !== null && "address" in result
                    ? (result as { address: string }).address
                    : String(result);
                this.walletAddress = address;
                clearTimeout(timeoutId);
                this.emit("addressReceived", address);
                resolve(address);
              })
              .catch((err) => {
                clearTimeout(timeoutId);
                reject(err);
              });
            return;
          }

          // Handle JSON-RPC responses
          const responseId = response.id
            ? String(response.id).replace(/^"|"$/g, "")
            : undefined;
          if (responseId && this.pendingRequests.has(responseId)) {
            const pending = this.pendingRequests.get(responseId)!;
            this.pendingRequests.delete(responseId);

            if (response.error) {
              pending.reject(new Error(response.error.message));
            } else {
              pending.resolve(response.result);
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      this.socket.onerror = () => {
        clearTimeout(timeoutId);
        this.setStatus("error");
        const err = new Error("WebSocket error. Is the DERO wallet running?");
        this.emit("error", err);
        reject(err);
      };

      this.socket.onclose = () => {
        this.setStatus("disconnected");
        this.walletAddress = null;
      };
    });
  }

  /** Disconnect from the wallet */
  disconnect(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore close errors
      }
      this.socket = null;
    }
    this.walletAddress = null;
    this.setStatus("disconnected");
  }

  /**
   * Send a JSON-RPC request to the wallet.
   */
  private async sendRequest<T = unknown>(
    method: string,
    params?: unknown
  ): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to wallet");
    }

    return new Promise<T>((resolve, reject) => {
      const id = String(this.requestCounter++);
      const request: Record<string, unknown> = {
        jsonrpc: "2.0",
        id,
        method,
      };
      if (params !== undefined) {
        request.params = params;
      }

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.socket!.send(JSON.stringify(request));
    });
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
    const result = await this.sendRequest<{ txid: string }>("transfer", {
      transfers: [
        {
          destination,
          amount: Number(amount),
        },
      ],
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
    const params = scid ? { scid } : {};
    const result = await this.sendRequest<{
      balance: number;
      unlocked_balance: number;
    }>("GetBalance", params);
    return {
      balance: BigInt(result.balance),
      unlockedBalance: BigInt(result.unlocked_balance),
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

    const params: Record<string, unknown> = {
      scid,
      sc_rpc: scRpc,
      ringsize,
    };

    if (deposit !== undefined && deposit > 0n) {
      params.sc_dero_deposit = Number(deposit);
    }

    const result = await this.sendRequest<{ txid: string }>("scinvoke", params);
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
