/**
 * DERO Wallet RPC client.
 *
 * Communicates with the DERO wallet's HTTP JSON-RPC interface
 * for headless server-side payment operations.
 *
 * The wallet must be started with --rpc-server flag:
 *   dero-wallet-cli --wallet-file wallet.db --rpc-server --rpc-bind=127.0.0.1:10103
 *
 * Default ports:
 *   - Mainnet: 10103
 *   - Testnet: 40403
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  GetBalanceParams,
  GetBalanceResult,
  GetAddressResult,
  GetHeightResult,
  GetTransfersParams,
  GetTransfersResult,
  TransferEntry,
  TransferParams,
  TransferResult,
  MakeIntegratedAddressParams,
  MakeIntegratedAddressResult,
  SplitIntegratedAddressParams,
  SplitIntegratedAddressResult,
  GetTransferByTXIDParams,
  GetTransferByTXIDResult,
  PayloadRpcArg,
  ScRpcArg,
  InstallScParams,
  InvokeScParams,
  InvokeScResult,
} from "./types.js";

/** Wallet RPC client configuration */
export type WalletRpcConfig = {
  /** Wallet RPC endpoint (default: http://127.0.0.1:10103/json_rpc) */
  url?: string;
  /** Basic auth credentials */
  auth?: { username: string; password: string };
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
};

/**
 * Wrapper marking a value that MUST be emitted as a JSON integer literal,
 * not a JavaScript number.
 *
 * DERO's `dstport` and the "D" (RPC_DESTINATION_PORT) payload are uint64.
 * Routing them through `Number()` silently truncates any value >= 2^53 to the
 * nearest double BEFORE it ever reaches the wallet, so the integrated address
 * the payer pays to and the dstport the poller queries diverge — a real
 * on-chain payment is then never matched. Go's encoding/json decodes a JSON
 * integer literal straight into uint64 with no loss, so we serialize the full
 * bigint as a raw token instead of a JS number.
 */
class RawUint64 {
  constructor(readonly value: bigint) {}
}

const RAW_U64_PREFIX = "__DERO_RAW_U64__";

/**
 * JSON.stringify a request body, emitting any RawUint64 as a bare integer
 * literal (e.g. 18446744073709551615) rather than a precision-losing number.
 */
function serializeRpcBody(request: unknown): string {
  const json = JSON.stringify(request, (_key, value) => {
    if (value instanceof RawUint64) {
      // Emit a unique placeholder string; swapped for the raw digits below.
      return `${RAW_U64_PREFIX}${value.value.toString()}`;
    }
    if (typeof value === "bigint") {
      // Any stray bigint is also preserved losslessly as an integer literal.
      return `${RAW_U64_PREFIX}${value.toString()}`;
    }
    return value;
  });
  // Replace "PREFIX<digits>" (a quoted JSON string) with the bare digits.
  return json.replace(
    new RegExp(`"${RAW_U64_PREFIX}(\\d+)"`, "g"),
    "$1"
  );
}

/**
 * DERO Wallet RPC client for server-side payment operations.
 */
export class WalletRpcClient {
  private url: string;
  private headers: Record<string, string>;
  private timeoutMs: number;
  private requestCounter = 0;

  constructor(config?: WalletRpcConfig) {
    this.url = config?.url ?? "http://127.0.0.1:10103/json_rpc";
    this.timeoutMs = config?.timeoutMs ?? 30_000;

    this.headers = {
      "Content-Type": "application/json",
    };

    if (config?.auth) {
      const credentials = btoa(`${config.auth.username}:${config.auth.password}`);
      this.headers["Authorization"] = `Basic ${credentials}`;
    }
  }

  /**
   * The configured per-request timeout in ms. Exposed so the escrow engine can
   * assert its deploy-lease is provably larger than the worst-case broadcast
   * latency (O15) instead of relying on an unchecked prose invariant.
   */
  get requestTimeoutMs(): number {
    return this.timeoutMs;
  }

  /**
   * Send a JSON-RPC request to the wallet.
   */
  private async rpcCall<T>(method: string, params?: unknown): Promise<T> {
    const id = String(++this.requestCounter);
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined && { params }),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: this.headers,
        body: serializeRpcBody(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Wallet RPC HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as JsonRpcResponse<T>;

      if (json.error) {
        throw new Error(`Wallet RPC error ${json.error.code}: ${json.error.message}`);
      }

      return json.result as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Wallet RPC timeout after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get the wallet's DERO address.
   */
  async getAddress(): Promise<string> {
    const result = await this.rpcCall<GetAddressResult>("GetAddress");
    return result.address;
  }

  /**
   * Get the wallet balance.
   *
   * @param scid - Optional SCID for token balance (empty = native DERO)
   */
  async getBalance(scid?: string): Promise<GetBalanceResult> {
    const params: GetBalanceParams = {};
    if (scid) params.scid = scid;
    return this.rpcCall<GetBalanceResult>("GetBalance", params);
  }

  /**
   * Get the wallet's current sync height.
   */
  async getHeight(): Promise<number> {
    const result = await this.rpcCall<GetHeightResult>("GetHeight");
    return result.height;
  }

  /**
   * Query transaction history with filters.
   *
   * @param params - Filter parameters
   * @returns Array of transfer entries
   */
  async getTransfers(params?: GetTransfersParams): Promise<TransferEntry[]> {
    const result = await this.rpcCall<GetTransfersResult>("GetTransfers", params ?? {});
    return result.entries ?? [];
  }

  /**
   * Get incoming transfers filtered by destination port (payment ID).
   * This is the primary method for detecting payments for a specific invoice.
   *
   * @param destinationPort - The payment ID (uint64)
   * @param minHeight - Optional minimum block height to search from
   */
  async getIncomingByPaymentId(
    destinationPort: bigint,
    minHeight?: number
  ): Promise<TransferEntry[]> {
    const params: GetTransfersParams = {
      in: true,
      // uint64 — emitted as a raw JSON integer literal, NOT Number() (which
      // would truncate the high bits of a >= 2^53 payment id before the wallet
      // ever sees it, breaking the match against the integrated address).
      dstport: new RawUint64(destinationPort) as unknown as number,
    };
    if (minHeight !== undefined) {
      params.min_height = minHeight;
    }
    return this.getTransfers(params);
  }

  /**
   * Look up a specific transaction by its TXID.
   */
  async getTransferByTxid(txid: string): Promise<TransferEntry> {
    const result = await this.rpcCall<GetTransferByTXIDResult>(
      "GetTransferbyTXID",
      { txid } satisfies GetTransferByTXIDParams
    );
    return result.entry;
  }

  /**
   * Create an integrated address with an embedded payment ID.
   *
   * The payment ID is embedded as RPC_DESTINATION_PORT ("D" parameter),
   * which is DERO's native mechanism for identifying payments.
   *
   * @param paymentId - The payment ID (uint64) to embed
   * @param address - Base address (optional, uses wallet's address if empty)
   */
  async makeIntegratedAddress(
    paymentId: bigint,
    address?: string
  ): Promise<string> {
    const params: MakeIntegratedAddressParams = {
      payload_rpc: [
        {
          name: "D",
          datatype: "U",
          // uint64 — emitted as a raw JSON integer literal, NOT Number(), so the
          // full payment id is encoded into the integrated address the payer
          // pays to and matches the dstport the poller later queries.
          value: new RawUint64(paymentId),
        },
      ],
    };
    if (address) {
      params.address = address;
    }

    const result = await this.rpcCall<MakeIntegratedAddressResult>(
      "MakeIntegratedAddress",
      params
    );
    return result.integrated_address;
  }

  /**
   * Split an integrated address to extract the base address and payload.
   */
  async splitIntegratedAddress(integratedAddress: string): Promise<{
    address: string;
    payloadRpc: PayloadRpcArg[];
  }> {
    const result = await this.rpcCall<SplitIntegratedAddressResult>(
      "SplitIntegratedAddress",
      { integrated_address: integratedAddress } satisfies SplitIntegratedAddressParams
    );
    return {
      address: result.address,
      payloadRpc: result.payload_rpc,
    };
  }

  /**
   * Send a DERO transfer.
   *
   * @param destination - Destination address
   * @param amount - Amount in atomic units
   * @param ringsize - Ring size (default: 16)
   * @returns Transaction ID
   */
  async transfer(
    destination: string,
    amount: bigint,
    ringsize: number = 16
  ): Promise<string> {
    const params: TransferParams = {
      transfers: [
        {
          destination,
          amount: Number(amount),
        },
      ],
      ringsize,
    };

    const result = await this.rpcCall<TransferResult>("Transfer", params);
    return result.txid;
  }

  // ---------------------------------------------------------------------------
  // Smart Contract operations
  // ---------------------------------------------------------------------------

  /**
   * Deploy a smart contract to the DERO blockchain.
   *
   * Uses the wallet's `transfer` RPC method with the top-level `"sc"` field,
   * which the wallet auto-decodes (base64 → raw source) before passing to the DVM.
   * Do NOT put SC_CODE into sc_rpc manually — the wallet only base64-decodes
   * from the `"sc"` field, not from sc_rpc entries.
   *
   * @param code - Smart contract source code (DVM-BASIC)
   * @param args - Optional SC_RPC arguments for the Initialize() function
   * @param ringsize - Ring size (default: 2, minimum for SC operations)
   * @returns Transaction ID (which also serves as the SCID)
   */
  async installSc(
    code: string,
    args?: ScRpcArg[],
    ringsize: number = 2
  ): Promise<string> {
    const params: InstallScParams = {
      sc: btoa(code), // wallet auto-decodes base64 → raw source for the DVM
      sc_rpc: args ?? [],
      ringsize,
    };

    const result = await this.rpcCall<TransferResult>("transfer", params);
    return result.txid;
  }

  /**
   * Invoke a smart contract function.
   *
   * Uses the wallet's `scinvoke` RPC method.
   *
   * @param scid - Smart Contract ID (deployment TXID)
   * @param entrypoint - Function name to call (e.g. "Deposit", "ConfirmDelivery")
   * @param args - Additional SC_RPC arguments for the function
   * @param deposit - DERO amount (atomic units) to deposit into the SC
   * @param ringsize - Ring size (default: 2)
   * @returns Transaction ID
   */
  async invokeSc(
    scid: string,
    entrypoint: string,
    args?: ScRpcArg[],
    deposit?: bigint,
    ringsize: number = 2
  ): Promise<string> {
    const scRpc: ScRpcArg[] = [
      { name: "entrypoint", datatype: "S", value: entrypoint },
      ...(args ?? []),
    ];

    const params: InvokeScParams = {
      scid,
      sc_rpc: scRpc,
      ringsize,
    };

    if (deposit !== undefined && deposit > 0n) {
      params.sc_dero_deposit = Number(deposit);
    }

    const result = await this.rpcCall<InvokeScResult>("scinvoke", params);
    return result.txid;
  }

  /**
   * Raw scinvoke call — for advanced usage where you want full control
   * over the SC_RPC array and parameters.
   *
   * @param params - Full InvokeScParams
   * @returns Transaction ID
   */
  async scinvokeRaw(params: InvokeScParams): Promise<string> {
    const result = await this.rpcCall<InvokeScResult>("scinvoke", params);
    return result.txid;
  }

  /**
   * Check if the wallet RPC is reachable.
   */
  async ping(): Promise<boolean> {
    try {
      await this.getHeight();
      return true;
    } catch {
      return false;
    }
  }
}
