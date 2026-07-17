/**
 * Autonomous agent payer demo on DeroPay's invoice/receipt rail.
 *
 * Hits a paid resource, receives 402 Payment Required, pays the invoice's
 * integrated address through the LOCAL wallet RPC (loopback-only), waits
 * for the invoice to complete, redeems it for a DPAY-RECEIPT token,
 * retries with X-DeroPay-Receipt, and prints the payment evidence — all
 * under a deny-by-default spending policy. A second request demonstrates
 * receipt reuse: it returns 200 without paying again.
 *
 * Requirements:
 *   - The x402-example app running (bun run dev:x402-example)
 *   - The merchant wallet + daemon configured for the app (.env.example)
 *   - A SECOND wallet's RPC for the agent — paying the merchant wallet
 *     from itself won't register as an incoming transfer.
 *
 * Env:
 *   RESOURCE_URL           — paid endpoint (default http://localhost:3000/api/protected/report)
 *   AGENT_WALLET_RPC_URL   — the agent's wallet RPC (default http://127.0.0.1:10104/json_rpc)
 *   MAX_ATOMIC_PER_REQUEST — per-payment cap in atomic units (default 100000 = 1 DERO)
 *   MAX_ATOMIC_PER_HOUR    — rolling-hour cap in atomic units (default 500000 = 5 DERO)
 */

import {
  createPayingFetch,
  createWalletRpcPayer,
  SpendPolicy,
  SpendPolicyError,
  X402PaymentRejectedError,
  X402SettlementTimeoutError,
  X402UnpayableError,
  type PaymentEvidence,
} from "dero-pay/agent";

const RESOURCE = process.env.RESOURCE_URL ?? "http://localhost:3000/api/protected/report";
const AGENT_WALLET_RPC_URL =
  process.env.AGENT_WALLET_RPC_URL ?? "http://127.0.0.1:10104/json_rpc";
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
    payer: createWalletRpcPayer({ url: AGENT_WALLET_RPC_URL }),
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

  console.log("[agent] calling again — the live receipt should be reused, no new payment");
  const again = await payingFetch(RESOURCE);
  console.log("[agent] status:", again.status);

  console.log(
    `[agent] payments made: ${evidence.length}, spent in window: ${policy.spentInWindow()} atomic`
  );
}

main().catch((error) => {
  if (error instanceof SpendPolicyError) {
    console.error(`[agent] payment DENIED by policy (${error.code}): ${error.message}`);
  } else if (error instanceof X402SettlementTimeoutError) {
    console.error(
      `[agent] paid invoice ${error.invoiceId} (txid ${error.txid}) but it did not settle ` +
        `in time (${error.reason}). Re-running this script resumes the wait without paying again.`
    );
  } else if (error instanceof X402PaymentRejectedError) {
    console.error(
      `[agent] paid invoice ${error.invoiceId} (txid ${error.txid}) but the server still ` +
        `returned 402 — NOT paying again. Investigate before retrying.`
    );
  } else if (error instanceof X402UnpayableError) {
    console.error(
      `[agent] resource requires payment this agent cannot make: ${error.message}`
    );
  } else {
    console.error("[agent] error:", error);
  }
  process.exit(1);
});
