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

/**
 * O15b — a wallet RPC call whose outcome is BROADCAST-AMBIGUOUS: the wallet's
 * HTTP response was lost (request-abort/timeout, or a raw fetch/network failure)
 * so we do NOT know whether the daemon already accepted the transaction. For an
 * `installSc` (contract deploy) this is the fund-safety-critical case: a live,
 * fundable escrow contract MAY exist on-chain even though the SDK never learned
 * its SCID. Callers MUST treat this differently from a DETERMINISTIC failure (a
 * JSON-RPC `{error}` response or an HTTP non-200 — the daemon definitively
 * refused, nothing broadcast): an ambiguous deploy must be QUARANTINED (held,
 * never released, never auto-requoted) so a second contract is not deployed and
 * a wallet-side recovery sweep can reconcile the possibly-live first one.
 *
 * SECURITY-CRITICAL taxonomy — FAIL CLOSED. Once the fetch has been ISSUED, the
 * ONLY failures that are DETERMINISTIC (safe to treat as a definitive refusal
 * that broadcast nothing) are the two the client throws ITSELF above and tags
 * with a `Wallet RPC (HTTP|error)` message prefix:
 *   - HTTP non-200                    -> deterministic (our own Error)
 *   - JSON-RPC `{error}` response     -> deterministic (our own Error)
 * EVERY OTHER post-send throw is reclassified BROADCAST-AMBIGUOUS (this class):
 *   - AbortError / timeout                              -> ambiguous
 *   - fetch TypeError / network error                  -> ambiguous
 *   - SyntaxError / RangeError from a corrupt/truncated
 *     HTTP-200 body (response.json() throws)           -> ambiguous
 *   - any unknown / future error type                  -> ambiguous
 * O15c — the default MUST be ambiguous, not deterministic. A SyntaxError/RangeError
 * from response.json() on an HTTP-200-but-truncated/corrupt body means the daemon
 * may have ACCEPTED the installSc while the wallet's response was lost; classifying
 * it deterministic would land 'deploy_failed', RELEASE the guard row, and re-open
 * the double-deploy. Absence of proof-of-refusal, once the request may have hit the
 * wire, must be treated as possible-acceptance.
 */
export class WalletRpcAmbiguousError extends Error {
  /** Discriminant so a caller can classify without an instanceof (survives a
   *  serialize boundary / a different module realm). */
  readonly broadcastAmbiguous = true as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions);
    this.name = "WalletRpcAmbiguousError";
  }
}

/** True iff `err` is a broadcast-ambiguous wallet RPC failure (see
 *  {@link WalletRpcAmbiguousError}). Checks the discriminant property so it
 *  survives an instanceof-defeating realm/serialize boundary. */
export function isBroadcastAmbiguous(err: unknown): boolean {
  return (
    err instanceof WalletRpcAmbiguousError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { broadcastAmbiguous?: unknown }).broadcastAmbiguous === true)
  );
}

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
 * Normalize a wallet transfer entry to the SDK's canonical field names.
 *
 * derohe's wallet RPC emits the payment-id ports as `dstport`/`srcport`
 * (the JSON tags on its `rpc.Entry` struct), but the SDK and DERO docs
 * refer to them as `destination_port`/`source_port`. Without this bridge
 * the monitor reads `entry.destination_port` as undefined and throws
 * `BigInt(undefined)` on every poll, so no live payment is ever detected.
 * Fill the canonical fields from whichever alias the wallet provided.
 */
function normalizeTransferEntry(entry: TransferEntry): TransferEntry {
  const raw = entry as TransferEntry & { dstport?: number; srcport?: number };
  return {
    ...entry,
    destination_port: entry.destination_port ?? raw.dstport ?? 0,
    source_port: entry.source_port ?? raw.srcport ?? 0,
  };
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
        // DETERMINISTIC — the daemon/wallet answered with a non-200; nothing was
        // broadcast into consensus. Safe to treat as a definitive refusal.
        throw new Error(`Wallet RPC HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as JsonRpcResponse<T>;

      if (json.error) {
        // DETERMINISTIC — a JSON-RPC error response is a definitive refusal from
        // the wallet (bad params, insufficient funds, rejected tx); no broadcast.
        throw new Error(`Wallet RPC error ${json.error.code}: ${json.error.message}`);
      }

      return json.result as T;
    } catch (err) {
      // O15c — FAIL CLOSED. Classify BROADCAST-AMBIGUOUS vs DETERMINISTIC by an
      // ALLOW-LIST of the deterministic case, defaulting everything else to
      // ambiguous. The ONLY deterministic failures are the two we threw OURSELVES
      // above (HTTP non-200 / JSON-RPC {error}), matched by their message prefix:
      // the daemon/wallet gave a definitive refusal and nothing broadcast. EVERY
      // other post-send throw — abort/timeout, fetch TypeError, a SyntaxError/
      // RangeError from response.json() on a truncated/corrupt HTTP-200 body, or
      // any unknown/future type — leaves it UNKNOWN whether the daemon already
      // accepted the transaction. For an installSc that means a live contract MAY
      // exist, so it MUST be quarantined: mis-tagging any of these deterministic
      // would land 'deploy_failed', RELEASE the guard row, and re-open the double-
      // deploy. The pre-O15c code inverted this (only Abort/TypeError ambiguous,
      // default deterministic), letting a corrupt-body SyntaxError leak through.
      if (
        err instanceof Error &&
        /^Wallet RPC (HTTP|error)/.test(err.message)
      ) {
        throw err;
      }
      // Everything else after the request was issued is broadcast-ambiguous.
      const name = err instanceof Error ? err.name : "unknown";
      const detail = err instanceof Error ? err.message : String(err);
      const reason =
        err instanceof Error && err.name === "AbortError"
          ? `timeout after ${this.timeoutMs}ms`
          : `${name}: ${detail}`;
      throw new WalletRpcAmbiguousError(
        `Wallet RPC broadcast-ambiguous (${reason}): the daemon may have accepted ` +
          `the transaction before the response was received/parsed`,
        { cause: err }
      );
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
    return (result.entries ?? []).map(normalizeTransferEntry);
  }

  /**
   * O15b — enumerate the wallet's OWN outgoing smart-contract-install TXIDs at or
   * after `sinceHeight`, for the broadcast-ambiguous deploy recovery sweep.
   *
   * When an installSc broadcast was ambiguous (timeout/network — the response was
   * lost) the SCID is UNKNOWABLE client-side: SCID == deploy txid, surfaced ONLY
   * on the RPC success path; there is no client-side pre-derivation and no
   * daemon by-variable/list-contracts query. The ONLY recovery channel is the
   * wallet itself: enumerate our own outgoing SC-install transfers around the
   * crash window and let the caller confirm each candidate txid against the
   * frozen quote terms via `EscrowContract.verifyBinding`.
   *
   * We filter to OUTGOING entries (`incoming === false`) and keep only SC-install
   * TXs. An SC deploy's txid IS its scid, so we return each candidate's txid; a
   * non-escrow (or non-SC) txid simply fails verifyBinding downstream and is
   * discarded — this method is deliberately permissive and pushes the
   * authoritative check to verifyBinding. `sinceHeight` bounds the scan so it is
   * not a full-history walk; derive it CONSERVATIVELY (well before the claim) so a
   * ms-clock-vs-block-height mismatch never drops the real candidate.
   *
   * NOTE: this uses ONLY the wallet's GetTransfers — no daemon scan.
   */
  async listOwnScDeploys(sinceHeight?: number): Promise<string[]> {
    const params: GetTransfersParams = { out: true };
    if (sinceHeight !== undefined && sinceHeight > 0) {
      params.min_height = sinceHeight;
    }
    const entries = await this.getTransfers(params);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of entries) {
      if (e.incoming) continue; // only our own outgoing broadcasts
      // An SC-install entry carries an `scid` equal to its own txid (the wallet
      // sets it on contract-install transfers); fall back to txid when the wallet
      // build does not surface scid so a candidate is never silently dropped.
      const scEntry = e as TransferEntry & { scid?: string };
      const candidate =
        scEntry.scid && scEntry.scid.length > 0 ? scEntry.scid : e.txid;
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      out.push(candidate);
    }
    return out;
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
    return normalizeTransferEntry(result.entry);
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
