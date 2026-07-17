/**
 * Wallet-RPC payer: a real WalletInvoke backed by the local DERO wallet's
 * JSON-RPC interface (`scinvoke`). This is the autonomous path — no human
 * approval per payment — so it is loopback-only by default, mirroring the
 * Bridge's outbound-only posture: the wallet you can drain must be yours.
 */

import { WalletRpcClient } from "../../rpc/wallet-rpc.js";
import type { ScRpcArg } from "../../rpc/types.js";
import type { WalletInvoke } from "../client";

export type WalletRpcInvokeConfig = {
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

function toScArgs(args: Record<string, string>): ScRpcArg[] {
  return Object.entries(args).map(([name, value]) => ({
    name,
    datatype: "S" as const,
    value,
  }));
}

/**
 * Build a WalletInvoke that pays x402 challenges through the local wallet.
 * The payer address is fetched once and cached for the payment payload.
 */
export function createWalletRpcInvoke(config: WalletRpcInvokeConfig = {}): WalletInvoke {
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

  let cachedPayer: string | null = null;

  return async ({ scid, entrypoint, ringsize, deroDeposit, args }) => {
    if (cachedPayer === null) {
      cachedPayer = await client.getAddress();
    }
    const txid = await client.invokeSc(
      scid,
      entrypoint,
      toScArgs(args),
      deroDeposit,
      ringsize
    );
    return { txid, payer: cachedPayer };
  };
}
