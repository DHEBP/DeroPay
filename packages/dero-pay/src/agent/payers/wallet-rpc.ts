/**
 * Wallet-RPC payer: an InvoicePayer backed by the local DERO wallet's
 * JSON-RPC interface. This is the autonomous path — no human approval
 * per payment — so it is loopback-only by default: the wallet an agent
 * can drain must be yours.
 */

import { WalletRpcClient } from "../../rpc/wallet-rpc.js";
import type { InvoicePayer } from "../payer.js";

export type WalletRpcPayerConfig = {
  /** Wallet RPC endpoint. Default: http://127.0.0.1:10103/json_rpc */
  url?: string;
  /**
   * Pre-built client (tests / advanced wiring). Bypasses the loopback
   * check — the caller owns the endpoint's trust decision.
   */
  client?: WalletRpcClient;
  /**
   * Allow a non-loopback wallet URL. Off by default: an autonomous payer
   * pointed at a remote wallet is a key-exfiltration hazard.
   */
  allowNonLoopback?: boolean;
  /** Ring size for payment transfers. Default 16. */
  ringsize?: number;
};

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      LOOPBACK_HOSTNAMES.has(host) ||
      host === "::1" ||
      host.startsWith("127.")
    );
  } catch {
    return false;
  }
}

/**
 * Build an InvoicePayer that pays challenges through the local wallet:
 * a plain transfer to the invoice's integrated address, whose embedded
 * payment ID is what the merchant's PaymentMonitor matches on.
 */
export function createWalletRpcPayer(config: WalletRpcPayerConfig = {}): InvoicePayer {
  let client: WalletRpcClient;
  if (config.client) {
    client = config.client;
  } else {
    const url = config.url ?? "http://127.0.0.1:10103/json_rpc";
    if (!config.allowNonLoopback && !isLoopbackUrl(url)) {
      throw new Error(
        `Wallet RPC URL ${url} is not loopback. An autonomous payer must talk to a ` +
          `local wallet; pass allowNonLoopback: true only if you understand the risk.`
      );
    }
    client = new WalletRpcClient({ url });
  }

  const ringsize = config.ringsize ?? 16;

  return async (payment) => {
    const txid = await client.transfer(
      payment.integratedAddress,
      payment.amountAtomic,
      ringsize
    );
    return { txid };
  };
}
