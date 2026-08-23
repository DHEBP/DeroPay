import {
  createPayingFetch,
  createWalletRpcPayer,
  SpendPolicy,
} from "dero-pay/agent";
import { createPrepaidClient, createTopUpIdempotencyKey } from "dero-pay/prepaid";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveAtomic(name: string, fallback: string): bigint {
  const value = process.env[name] ?? fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  return BigInt(value);
}

const baseUrl = new URL(process.env.PREPAID_BASE_URL ?? "http://localhost:3002");
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(baseUrl.hostname)) {
  throw new Error("PREPAID_BASE_URL must be localhost or loopback in this simulator example");
}
const topUpAtomic = positiveAtomic("PREPAID_TOP_UP_ATOMIC", "500000");
const walletRpcUrl = process.env.AGENT_WALLET_RPC_URL ?? "http://127.0.0.1:30001/json_rpc";
const policy = new SpendPolicy({
  allowOrigins: [baseUrl.origin],
  maxAtomicPerRequest: topUpAtomic,
  maxAtomicPerWindow: { amountAtomic: topUpAtomic, windowSeconds: 3_600 },
});
const payingFetch = createPayingFetch({
  payer: createWalletRpcPayer({ url: walletRpcUrl }),
  policy,
  reuseReceipts: false,
});
const client = createPrepaidClient({
  baseUrl: baseUrl.toString(),
  walletAddress: required("DERO_WALLET_ADDRESS"),
  getAuthToken: () => required("DERO_AUTH_TOKEN"),
  payingFetch,
});

const before = (await client.getBalance()) as { balanceAtomic: string };
console.log(`[prepaid] opening balance=${before.balanceAtomic} atomic`);
if (BigInt(before.balanceAtomic) < topUpAtomic) {
  const toppedUp = (await client.topUp(topUpAtomic, createTopUpIdempotencyKey())) as {
    balanceAtomic: string;
    creditedAtomic: string;
  };
  console.log(
    `[prepaid] credited=${toppedUp.creditedAtomic} balance=${toppedUp.balanceAtomic} atomic`,
  );
}

const response = await client.request("/api/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: process.env.PREPAID_MODEL ?? "default",
    messages: [{ role: "user", content: "Reply with one sentence about DERO." }],
    stream: false,
  }),
});
if (!response.ok) throw new Error(`Inference returned HTTP ${response.status}`);
console.log(`[inference] ${await response.text()}`);
console.log(`[prepaid] remaining=${response.headers.get("X-Balance-Remaining") ?? "unknown"} atomic`);
