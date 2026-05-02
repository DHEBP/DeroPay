import type { WalletStatus } from "../../../core/types.js";
import {
  normalizeWalletConnectorError,
  WalletConnectorError,
} from "../errors.js";
import {
  assertSpendOperationsAllowed,
  confirmSpendOperation,
  mergeWalletConnectorPolicy,
} from "../policy.js";
import type {
  IntegratedAddressResult,
  ScInvokeRequest,
  TransferResult,
  WalletCapability,
  WalletConnector,
  WalletConnectorContext,
  WalletConnectorState,
  WalletTransferFilter,
} from "../types.js";
import {
  mapScInvokeRequest,
  mapTransferRequest,
  parseRpcBigInt,
} from "./xswd-mapper.js";

export type XSWDAppData = {
  id: string;
  name: string;
  description: string;
  url: string;
  permissions?: Record<string, unknown>;
  signature?: string;
};

export type XSWDConnectorEvents = {
  statusChange: (status: WalletStatus) => void;
  addressReceived: (address: string) => void;
  error: (error: Error) => void;
};

export type XSWDConnectorOptions = {
  url?: string;
  appName?: string;
  appDescription?: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  /** Minimum ms between requests to avoid XSWD rate limit (default: 150) */
  throttleMs?: number;
  /** Auto-reconnect on disconnect with exponential backoff (default: false) */
  autoReconnect?: boolean;
  /** Initial reconnect delay in ms (default: 1000) */
  reconnectDelayMs?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  maxReconnectDelayMs?: number;
};

type XSWDResponse<T = unknown> = {
  jsonrpc?: string;
  id?: string | number;
  result?: T;
  error?: { code: number; message: string };
  message?: string;
  accepted?: boolean;
};

const DEFAULT_XSWD_URL = "ws://localhost:44326/xswd";
const DEFAULT_THROTTLE_MS = 150; // ~6.6 req/sec, safe under XSWD 10/sec limit
const DEFAULT_RECONNECT_DELAY_MS = 1000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30000;

const XSWD_CAPABILITIES: WalletCapability[] = [
  "connect",
  "disconnect",
  "getAddress",
  "getBalance",
  "makeIntegratedAddress",
  "splitIntegratedAddress",
  "transfer",
  "scInvoke",
  "getTransfers",
  "signData",
  "checkSignature",
  "queryKey",
];

export class XSWDConnector implements WalletConnector {
  readonly type = "xswd";
  readonly version = "1";

  private socket: WebSocket | null = null;
  private status: WalletStatus = "disconnected";
  private requestCounter = 1;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();
  private listeners: Partial<{
    [K in keyof XSWDConnectorEvents]: XSWDConnectorEvents[K][];
  }> = {};
  private readonly url: string;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly throttleMs: number;
  private readonly autoReconnect: boolean;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private appData: XSWDAppData;
  private walletAddress: string | null = null;
  private lastSendTime = 0;
  private currentReconnectDelay: number;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isIntentionalDisconnect = false;
  private context: WalletConnectorContext = {
    appName: "DeroPay",
    policy: mergeWalletConnectorPolicy(),
    nativeWalletConfirmation: true,
  };

  constructor(options?: XSWDConnectorOptions) {
    this.url = options?.url ?? DEFAULT_XSWD_URL;
    this.connectTimeoutMs = options?.connectTimeoutMs ?? 120_000;
    this.requestTimeoutMs = options?.requestTimeoutMs ?? 30_000;
    this.throttleMs = options?.throttleMs ?? DEFAULT_THROTTLE_MS;
    this.autoReconnect = options?.autoReconnect ?? false;
    this.reconnectDelayMs = options?.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    this.maxReconnectDelayMs = options?.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
    this.currentReconnectDelay = this.reconnectDelayMs;
    this.appData = {
      id: generateAppId(),
      name: options?.appName ?? "DeroPay",
      description: options?.appDescription ?? "Pay with your DERO wallet",
      url: getCurrentOrigin(),
      permissions: {},
      signature: "",
    };
  }

  getState(): WalletConnectorState {
    return {
      connected: this.status === "connected",
      connectorType: this.type,
      address: this.walletAddress ?? undefined,
      network: this.context.policy.network,
      capabilities: [...XSWD_CAPABILITIES],
    };
  }

  getStatus(): WalletStatus {
    return this.status;
  }

  supports(capability: WalletCapability): boolean {
    return XSWD_CAPABILITIES.includes(capability);
  }

  on<K extends keyof XSWDConnectorEvents>(
    event: K,
    callback: XSWDConnectorEvents[K]
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as XSWDConnectorEvents[K][]).push(callback);
    return () => {
      const arr = this.listeners[event] as XSWDConnectorEvents[K][];
      const idx = arr.indexOf(callback);
      if (idx !== -1) arr.splice(idx, 1);
    };
  }

  async connect(ctx: WalletConnectorContext): Promise<WalletConnectorState> {
    // Cancel any pending reconnect attempt
    this.cancelReconnect();
    this.isIntentionalDisconnect = false;

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      throw new WalletConnectorError(
        "TRANSPORT_FAILURE",
        "Already connected or connecting"
      );
    }

    this.context = {
      ...ctx,
      policy: mergeWalletConnectorPolicy(ctx.policy),
      nativeWalletConfirmation: ctx.nativeWalletConfirmation ?? true,
    };
    this.appData = {
      ...this.appData,
      id: generateAppId(),
      name: ctx.appName || this.appData.name,
      url: getCurrentOrigin(),
    };

    this.setStatus("connecting");

    return new Promise<WalletConnectorState>((resolve, reject) => {
      const timeoutSec = Math.round(this.connectTimeoutMs / 1000);
      const timeoutId = setTimeout(() => {
        void this.disconnect();
        reject(
          new WalletConnectorError(
            "OFFLINE_MODE",
            `Connection timeout (${timeoutSec}s). Is the wallet running?`
          )
        );
      }, this.connectTimeoutMs);

      try {
        this.socket = new WebSocket(this.url);
      } catch {
        clearTimeout(timeoutId);
        this.setStatus("error");
        reject(
          new WalletConnectorError(
            "TRANSPORT_FAILURE",
            `Failed to create WebSocket connection to ${this.url}`
          )
        );
        return;
      }

      this.socket.onopen = () => {
        this.socket?.send(JSON.stringify(this.appData));
      };

      this.socket.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data) as XSWDResponse;

          if (response.accepted === false) {
            clearTimeout(timeoutId);
            this.setStatus("error");
            const err = new WalletConnectorError(
              "PERMISSION_DENIED",
              response.message ?? "Connection rejected by wallet"
            );
            this.emit("error", err);
            reject(err);
            return;
          }

          if (response.accepted === true) {
            this.setStatus("connected");
            // Reset reconnect delay on successful connection
            this.currentReconnectDelay = this.reconnectDelayMs;

            this.call<string | { address: string }>("GetAddress")
              .then((result) => {
                const address =
                  typeof result === "object" && result !== null && "address" in result
                    ? (result as { address: string }).address
                    : String(result);
                this.walletAddress = address;
                clearTimeout(timeoutId);
                this.emit("addressReceived", address);
                resolve(this.getState());
              })
              .catch((err: unknown) => {
                clearTimeout(timeoutId);
                reject(normalizeWalletConnectorError(err));
              });
            return;
          }

          this.resolveRpcResponse(response);
        } catch {
          // XSWD may send wallet-specific non-JSON chatter. Ignore it.
        }
      };

      this.socket.onerror = () => {
        clearTimeout(timeoutId);
        this.setStatus("error");
        const err = new WalletConnectorError(
          "TRANSPORT_FAILURE",
          "WebSocket error. Is the DERO wallet running?"
        );
        this.emit("error", err);
        reject(err);
      };

      this.socket.onclose = () => {
        this.rejectAllPending(
          new WalletConnectorError("TRANSPORT_FAILURE", "Wallet connection closed")
        );
        this.walletAddress = null;
        this.setStatus("disconnected");

        // Auto-reconnect if enabled and not an intentional disconnect
        if (this.autoReconnect && !this.isIntentionalDisconnect) {
          this.scheduleReconnect();
        }
      };
    });
  }

  async disconnect(): Promise<void> {
    this.isIntentionalDisconnect = true;
    this.cancelReconnect();

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore close errors.
      }
      this.socket = null;
    }
    this.rejectAllPending(
      new WalletConnectorError("WALLET_NOT_CONNECTED", "Wallet disconnected")
    );
    this.walletAddress = null;
    this.setStatus("disconnected");
  }

  async getAddress(): Promise<string> {
    if (this.walletAddress) {
      return this.walletAddress;
    }
    const result = await this.call<string | { address: string }>("GetAddress");
    const address =
      typeof result === "object" && result !== null && "address" in result
        ? (result as { address: string }).address
        : String(result);
    this.walletAddress = address;
    return address;
  }

  async getBalance(scid?: string): Promise<{
    unlockedAtomic: bigint;
    totalAtomic: bigint;
  }> {
    const result = await this.call<{
      balance?: number | string;
      unlocked_balance?: number | string;
    }>("GetBalance", scid ? { scid } : {});
    return {
      totalAtomic: parseRpcBigInt(result.balance),
      unlockedAtomic: parseRpcBigInt(result.unlocked_balance),
    };
  }

  async transfer(request: {
    transfers: Array<{
      destination: string;
      amountAtomic: bigint;
      payloadRpc?: unknown[];
      scid?: string;
      burnAtomic?: bigint;
    }>;
    ringsize?: number;
    feesAtomic?: bigint;
  }): Promise<TransferResult> {
    assertSpendOperationsAllowed(
      this.context.policy,
      "transfer",
      this.type
    );

    // Build confirmation request with all transfers for multi-transfer batches
    const transfers = request.transfers.map((t) => ({
      destination: t.destination,
      amountAtomic: t.amountAtomic,
    }));
    await confirmSpendOperation(this.context, {
      operation: "transfer",
      connectorType: this.type,
      transfers,
      // Also set single-item fields for backward compatibility
      destination: transfers[0]?.destination,
      amountAtomic: transfers[0]?.amountAtomic,
    });

    const result = await this.call<{ txid: string }>(
      "transfer",
      mapTransferRequest(request.transfers, request.ringsize ?? 16, request.feesAtomic)
    );
    return { txid: result.txid };
  }

  async scInvoke(request: ScInvokeRequest): Promise<TransferResult> {
    assertSpendOperationsAllowed(
      this.context.policy,
      "scInvoke",
      this.type
    );
    await confirmSpendOperation(this.context, {
      operation: "scInvoke",
      connectorType: this.type,
      scid: request.scid,
      amountAtomic: request.deroDepositAtomic,
    });

    const result = await this.call<{ txid: string }>(
      "scinvoke",
      mapScInvokeRequest(request)
    );
    return { txid: result.txid };
  }

  async makeIntegratedAddress(args: {
    address?: string;
    payloadRpc?: unknown[];
  }): Promise<IntegratedAddressResult> {
    const result = await this.call<{
      integrated_address: string;
      payload_rpc?: unknown[];
    }>("MakeIntegratedAddress", {
      ...(args.address ? { address: args.address } : {}),
      ...(args.payloadRpc ? { payload_rpc: args.payloadRpc } : {}),
    });
    return {
      integratedAddress: result.integrated_address,
      payloadRpc: result.payload_rpc,
    };
  }

  async splitIntegratedAddress(
    integratedAddress: string
  ): Promise<{ address: string; payloadRpc?: unknown[] }> {
    const result = await this.call<{
      address: string;
      payload_rpc?: unknown[];
    }>("SplitIntegratedAddress", {
      integrated_address: integratedAddress,
    });
    return {
      address: result.address,
      payloadRpc: result.payload_rpc,
    };
  }

  async getTransfers(filter: WalletTransferFilter): Promise<unknown[]> {
    const result = await this.call<{ entries?: unknown[] }>("GetTransfers", {
      in: filter.in ?? true,
      out: filter.out ?? true,
      ...(filter.minHeight !== undefined ? { min_height: filter.minHeight } : {}),
      ...(filter.maxHeight !== undefined ? { max_height: filter.maxHeight } : {}),
      ...(filter.destinationPort !== undefined
        ? { destination_port: Number(filter.destinationPort) }
        : {}),
      ...(filter.sourcePort !== undefined
        ? { source_port: Number(filter.sourcePort) }
        : {}),
      ...(filter.sender ? { sender: filter.sender } : {}),
      ...(filter.receiver ? { receiver: filter.receiver } : {}),
    });
    return result.entries ?? [];
  }

  async signData(data: string | Uint8Array): Promise<string> {
    const dataStr =
      data instanceof Uint8Array
        ? Array.from(data)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
        : data;
    const result = await this.call<{ signature: string }>("SignData", {
      data: dataStr,
    });
    return result.signature;
  }

  async checkSignature(
    signature: string
  ): Promise<{ signer: string; message: string }> {
    const result = await this.call<{ signer: string; message: string }>(
      "CheckSignature",
      { signature }
    );
    return { signer: result.signer, message: result.message };
  }

  async queryKey(
    keyType: "mnemonic" | "view_key" | "spend_key"
  ): Promise<string> {
    const result = await this.call<{ key: string }>("QueryKey", {
      key_type: keyType,
    });
    return result.key;
  }

  private async call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new WalletConnectorError(
        "WALLET_NOT_CONNECTED",
        "Not connected to wallet"
      );
    }

    // Throttle requests to stay under XSWD rate limit (10/sec, burst 20)
    const now = Date.now();
    const elapsed = now - this.lastSendTime;
    if (elapsed < this.throttleMs) {
      await sleep(this.throttleMs - elapsed);
    }
    this.lastSendTime = Date.now();

    return new Promise<T>((resolve, reject) => {
      const id = String(this.requestCounter++);
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.delete(id)) {
          reject(
            new WalletConnectorError(
              "OFFLINE_MODE",
              `Wallet request timed out: ${method}`,
              { method }
            )
          );
        }
      }, this.requestTimeoutMs);

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
        timeoutId,
      });
      this.socket?.send(JSON.stringify(request));
    });
  }

  private resolveRpcResponse(response: XSWDResponse): void {
    const responseId =
      response.id !== undefined ? String(response.id).replace(/^"|"$/g, "") : undefined;
    if (!responseId || !this.pendingRequests.has(responseId)) {
      return;
    }

    const pending = this.pendingRequests.get(responseId)!;
    this.pendingRequests.delete(responseId);
    clearTimeout(pending.timeoutId);

    if (response.error) {
      pending.reject(normalizeWalletConnectorError(response.error));
      return;
    }
    pending.resolve(response.result);
  }

  private rejectAllPending(error: WalletConnectorError): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private emit<K extends keyof XSWDConnectorEvents>(
    event: K,
    ...args: Parameters<XSWDConnectorEvents[K]>
  ): void {
    const callbacks = this.listeners[event] as XSWDConnectorEvents[K][] | undefined;
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

  private cancelReconnect(): void {
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  private scheduleReconnect(): void {
    this.cancelReconnect();

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;

      // Attempt to reconnect with the stored context
      void this.connect(this.context)
        .then(() => {
          // Success - delay is already reset in connect
        })
        .catch(() => {
          // Increase delay with exponential backoff and schedule another attempt
          this.currentReconnectDelay = Math.min(
            this.currentReconnectDelay * 2,
            this.maxReconnectDelayMs
          );
          // Note: onclose will trigger scheduleReconnect again if autoReconnect is still enabled
        });
    }, this.currentReconnectDelay);
  }
}

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

function getCurrentOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "http://localhost";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
