/**
 * Autonomous x402 paying agent demo.
 *
 * Hits a paid resource, receives 402 Payment Required, pays through the
 * LOCAL wallet RPC (loopback-only), retries with X-PAYMENT, and prints
 * the evidence record for the payment it made — all under a deny-by-default
 * spending policy.
 *
 * Requirements:
 *   - DERO wallet RPC on 127.0.0.1:10103 (simulator or testnet wallet)
 *   - The x402-example app running with a facilitator behind it
 *
 * Env:
 *   RESOURCE_URL           — paid endpoint (default http://localhost:3002/api/data)
 *   WALLET_RPC_URL         — wallet RPC (default http://127.0.0.1:10103/json_rpc)
 *   MAX_ATOMIC_PER_REQUEST — per-payment cap in atomic units (default 100000 = 1 DERO)
 *   MAX_ATOMIC_PER_HOUR    — rolling-hour cap in atomic units (default 500000 = 5 DERO)
 */

import {
  createPayingFetch,
  createWalletRpcInvoke,
  SpendPolicy,
  SpendPolicyError,
  X402PaymentRejectedError,
  X402UnpayableError,
  type PaymentEvidence,
} from "dero-pay/x402";

const RESOURCE = process.env.RESOURCE_URL ?? "http://localhost:3002/api/data";
const WALLET_RPC_URL = process.env.WALLET_RPC_URL ?? "http://127.0.0.1:10103/json_rpc";
const MAX_PER_REQUEST = BigInt(process.env.MAX_ATOMIC_PER_REQUEST ?? "100000");
const MAX_PER_HOUR = BigInt(process.env.MAX_ATOMIC_PER_HOUR ?? "500000");

async function main() {
  const policy = new SpendPolicy({
    allowOrigins: [new URL(RESOURCE).origin],
    maxAtomicPerRequest: MAX_PER_REQUEST,
    maxAtomicPerWindow: { amountAtomic: MAX_PER_HOUR, windowSeconds: 3600 },
  });

  const evidence: PaymentEvidence[] = [];
  const payingFetch = createPayingFetch({
    walletInvoke: createWalletRpcInvoke({ url: WALLET_RPC_URL }),
    policy,
    onPayment: (e) => {
      evidence.push(e);
      console.log("[paid]", JSON.stringify(e));
    },
  });

  console.log(`[agent] GET ${RESOURCE} (will auto-pay up to ${MAX_PER_REQUEST} atomic)`);
  const res = await payingFetch(RESOURCE);

  console.log("[agent] status:", res.status);
  console.log("[agent] body:", await res.text());
  const settle = res.headers.get("X-PAYMENT-RESPONSE");
  if (settle) {
    console.log(
      "[agent] settle receipt:",
      Buffer.from(settle, "base64").toString("utf8")
    );
  }
  console.log(
    `[agent] payments made: ${evidence.length}, spent in window: ${policy.spentInWindow()} atomic`
  );
}

main().catch((error) => {
  if (error instanceof SpendPolicyError) {
    console.error(`[agent] payment DENIED by policy (${error.code}): ${error.message}`);
  } else if (error instanceof X402PaymentRejectedError) {
    console.error(
      `[agent] paid txid ${error.txid} but the server still returned 402 — NOT paying again. ` +
        `Investigate before retrying.`
    );
  } else if (error instanceof X402UnpayableError) {
    console.error(
      `[agent] resource requires payment on a rail this agent cannot pay: ${error.message}`
    );
  } else {
    console.error("[agent] error:", error);
  }
  process.exit(1);
});
