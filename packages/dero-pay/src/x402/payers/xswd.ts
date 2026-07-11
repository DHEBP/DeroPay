/**
 * XSWD payer: a WalletInvoke that routes each x402 payment through an
 * XSWD session, so the wallet owner approves every contract invocation
 * in their wallet UI. This is the interactive counterpart to the
 * autonomous wallet-RPC payer.
 */

import type { XSWDPayClient } from "../../client/xswd-pay.js";
import type { WalletInvoke } from "../client";

function toScArgs(args: Record<string, string>) {
  return Object.entries(args).map(([name, value]) => ({
    name,
    datatype: "S",
    value,
  }));
}

/**
 * Wrap a connected XSWDPayClient as a WalletInvoke. Throws if the session
 * has not completed its handshake (no address yet) — connect first.
 */
export function createXswdInvoke(client: XSWDPayClient): WalletInvoke {
  return async ({ scid, entrypoint, ringsize, deroDeposit, args }) => {
    const payer = client.getAddress();
    if (!payer) {
      throw new Error(
        "XSWD session has no wallet address — call connect() and complete the handshake before paying."
      );
    }
    const txid = await client.scinvoke(
      scid,
      entrypoint,
      toScArgs(args),
      deroDeposit,
      ringsize
    );
    return { txid, payer };
  };
}
