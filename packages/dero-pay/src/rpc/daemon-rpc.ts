/**
 * DERO Daemon RPC client.
 *
 * Communicates with the DERO daemon's HTTP JSON-RPC interface
 * for blockchain queries (height, transaction lookup, etc.).
 *
 * Default ports:
 *   - Mainnet: 10102
 *   - Testnet: 40402
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  GetInfoResult,
  GetTransactionParams,
  GetTransactionResult,
  GetScParams,
  GetScResult,
  GasEstimateParams,
  GasEstimateResult,
} from "./types.js";

/** Daemon RPC client configuration */
export type DaemonRpcConfig = {
  /** Daemon RPC endpoint (default: http://127.0.0.1:10102/json_rpc) */
  url?: string;
  /** Basic auth credentials */
  auth?: { username: string; password: string };
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
};

/**
 * DERO Daemon RPC client for blockchain queries.
 */
export class DaemonRpcClient {
  private url: string;
  private headers: Record<string, string>;
  private timeoutMs: number;
  private requestCounter = 0;

  constructor(config?: DaemonRpcConfig) {
    this.url = config?.url ?? "http://127.0.0.1:10102/json_rpc";
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
   * Send a JSON-RPC request to the daemon.
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
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Daemon RPC HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as JsonRpcResponse<T>;

      if (json.error) {
        throw new Error(`Daemon RPC error ${json.error.code}: ${json.error.message}`);
      }

      return json.result as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Daemon RPC timeout after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get daemon info including current height, network stats, etc.
   */
  async getInfo(): Promise<GetInfoResult> {
    return this.rpcCall<GetInfoResult>("get_info");
  }

  /**
   * Get the current blockchain height.
   *
   * NOTE: this returns TOPOHEIGHT (the topological order index), which runs
   * ahead of block height across side-blocks. For anything compared against
   * GetTransfers.min_height or TransferEntry.height (BLOCK height), use
   * {@link getBlockHeight} instead.
   */
  async getHeight(): Promise<number> {
    const info = await this.getInfo();
    return info.topoheight;
  }

  /**
   * Get the current BLOCK height (info.height), the unit GetTransfers.min_height
   * filters on. Used to anchor an invoice's wallet-scan floor at creation time.
   */
  async getBlockHeight(): Promise<number> {
    const info = await this.getInfo();
    return info.height;
  }

  /**
   * Get the current stable height (finalized blocks).
   */
  async getStableHeight(): Promise<number> {
    const info = await this.getInfo();
    return info.stableheight;
  }

  /**
   * Look up transactions by their hashes.
   */
  async getTransactions(txHashes: string[]): Promise<GetTransactionResult> {
    return this.rpcCall<GetTransactionResult>("get_transaction", {
      txs_hashes: txHashes,
    } satisfies GetTransactionParams);
  }

  // ---------------------------------------------------------------------------
  // Smart Contract queries
  // ---------------------------------------------------------------------------

  /**
   * Query a smart contract's state, code, and variables.
   *
   * @param scid - Smart Contract ID
   * @param options - Query options (code, variables, specific keys, topoheight)
   * @returns SC state including code, variables, and balance
   */
  async getSc(
    scid: string,
    options?: {
      code?: boolean;
      variables?: boolean;
      topoheight?: number;
      keysstring?: string[];
      keysuint64?: number[];
    }
  ): Promise<GetScResult> {
    const params: GetScParams = {
      scid,
      code: options?.code ?? false,
      variables: options?.variables ?? false,
    };

    if (options?.topoheight !== undefined) {
      params.topoheight = options.topoheight;
    }
    if (options?.keysstring) {
      params.keysstring = options.keysstring;
    }
    if (options?.keysuint64) {
      params.keysuint64 = options.keysuint64;
    }

    return this.rpcCall<GetScResult>("getsc", params);
  }

  /**
   * Convenience method to read a specific string-keyed variable from a smart contract.
   * Uses the targeted `keysstring` query which only fetches the requested key.
   *
   * @param scid - Smart Contract ID
   * @param key - Variable name to read
   * @returns The raw string value from valuesstring[0], or undefined if not found
   */
  async getScVariable(scid: string, key: string): Promise<string | undefined> {
    const result = await this.getSc(scid, { keysstring: [key] });
    const raw = result.valuesstring?.[0];
    if (!raw || raw.startsWith("NOT AVAILABLE")) return undefined;
    return raw;
  }

  /**
   * Get the DERO balance held by a smart contract.
   *
   * @param scid - Smart Contract ID
   * @returns Balance in atomic units
   */
  async getScBalance(scid: string): Promise<number> {
    const result = await this.getSc(scid);
    return result.balance;
  }

  /**
   * Estimate the gas cost of a smart contract operation.
   *
   * @param params - Gas estimation parameters (same structure as a transfer)
   * @returns Compute and storage gas costs
   */
  async gasEstimate(params: GasEstimateParams): Promise<GasEstimateResult> {
    return this.rpcCall<GasEstimateResult>("DERO.GetGasEstimate", params);
  }

  /**
   * Check if the daemon is reachable.
   */
  async ping(): Promise<boolean> {
    try {
      await this.getInfo();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the daemon is on testnet.
   */
  async isTestnet(): Promise<boolean> {
    const info = await this.getInfo();
    return info.testnet;
  }
}
