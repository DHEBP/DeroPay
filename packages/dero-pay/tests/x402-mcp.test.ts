import { test, expect } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import type { VerifySettleClient } from "../src/x402/server";
import type { WalletInvoke } from "../src/x402/client";
import { SpendPolicy, SpendPolicyError } from "../src/x402/policy";
import type { X402ReceiptPayload, X402SignedReceipt } from "../src/x402/receipt";
import {
  createPaidToolGuard,
  createPayingToolCaller,
  parsePaidToolChallenge,
  X402ToolPaymentRejectedError,
  X402_PAYMENT_ARG,
  type McpToolResult,
} from "../src/x402/mcp";

const SCID = "4".repeat(64);
const TXID = "c".repeat(64);
const PAYER = "deto1" + "w".repeat(60);
const SERVER_ORIGIN = "http://mcp.localhost:8787";

// Throwaway facilitator keypair; sign receipts exactly as the real facilitator
// does so the guard's cryptographic enforcement is exercised, not bypassed.
const { publicKey: FAC_PUB, privateKey: FAC_PRIV } = generateKeyPairSync("ed25519");
const FACILITATOR_PUBLIC_KEY = Buffer.from(
  FAC_PUB.export({ format: "der", type: "spki" }),
).subarray(-32).toString("hex");

function canonicalize(p: X402ReceiptPayload): string {
  return JSON.stringify({
    network: p.network, payer: p.payer,
    amount: p.amount, paidAtHeight: p.paidAtHeight, resource: p.resource,
    merchantId: p.merchantId, orderId: p.orderId, expiresAt: p.expiresAt,
  });
}

// Receipt bound to the tool resource `mcp:tool/<name>` the guard will assert.
function signReceiptFor(resource: string): X402SignedReceipt {
  const payload: X402ReceiptPayload = {
    network: "dero-mainnet", payer: PAYER, amount: "1000",
    paidAtHeight: 1, resource, merchantId: "hive-mcp", orderId: "tool-call-1",
    expiresAt: Math.floor(Date.now() / 1000) + 900,
  };
  const sig = cryptoSign(null, Buffer.from(canonicalize(payload), "utf8"), FAC_PRIV);
  return { payload, signature: sig.toString("hex"), algorithm: "ed25519" };
}

const ACCEPTS_ENTRY = {
  scheme: "dero-exact" as const,
  network: "dero-mainnet" as const,
  asset: "DERO" as const,
  payTo: SCID,
  maxAmountRequired: "1000",
  extra: { merchantId: "hive-mcp", orderId: "tool-call-1" },
};

function okFacilitator(resource = "mcp:tool/echo"): VerifySettleClient & { verifies: number; settles: number } {
  const state = {
    verifies: 0,
    settles: 0,
    verify: async () => {
      state.verifies++;
      return { isValid: true, payer: PAYER };
    },
    settle: async () => {
      state.settles++;
      return { success: true, transaction: TXID, network: "dero-mainnet", receipt: signReceiptFor(resource) };
    },
  };
  return state;
}

function makeWalletInvoke() {
  const calls: unknown[] = [];
  const invoke: WalletInvoke = async (args) => {
    calls.push(args);
    return { txid: TXID, payer: PAYER };
  };
  return { invoke, calls };
}

function policyAllowing() {
  return new SpendPolicy({ allowOrigins: [SERVER_ORIGIN], maxAtomicPerRequest: 10_000n });
}

const echoTool = async (args: Record<string, unknown>): Promise<McpToolResult> => ({
  content: [{ type: "text", text: `echo:${JSON.stringify(args)}` }],
});

test("unpaid call gets a payment_required challenge with mcp:tool resource", async () => {
  const { guard } = createPaidToolGuard({
    facilitator: okFacilitator(),
    accepts: [ACCEPTS_ENTRY],
    facilitatorPublicKey: FACILITATOR_PUBLIC_KEY,
  });
  const paidEcho = guard("echo", echoTool);

  const result = await paidEcho({ q: "hi" });
  expect(result.isError).toBe(true);

  const challenge = parsePaidToolChallenge(result);
  expect(challenge).not.toBeNull();
  expect(challenge!.resource).toBe("mcp:tool/echo");
  expect(challenge!.accepts[0]).toMatchObject({
    scheme: "dero-exact",
    payTo: SCID,
    resource: "mcp:tool/echo",
  });
});

test("guard verifies AND settles before running the handler, stamps settle meta", async () => {
  const facilitator = okFacilitator();
  const { guard } = createPaidToolGuard({ facilitator, accepts: [ACCEPTS_ENTRY], facilitatorPublicKey: FACILITATOR_PUBLIC_KEY });
  const paidEcho = guard("echo", echoTool);
  const { invoke } = makeWalletInvoke();

  const caller = createPayingToolCaller({
    callTool: async (_name, args) => paidEcho(args as never),
    walletInvoke: invoke,
    policy: policyAllowing(),
    serverOrigin: SERVER_ORIGIN,
  });

  const result = await caller("echo", { q: "hi" });
  expect(result.isError).toBeUndefined();
  expect(result.content[0].text).toBe(`echo:${JSON.stringify({ q: "hi" })}`);
  expect(facilitator.verifies).toBe(1);
  expect(facilitator.settles).toBe(1);
  const meta = result._meta?.["deropay/x402"] as Record<string, unknown>;
  expect(meta.settled).toBe(true);
  expect(meta.transaction).toBe(TXID);
});

test("handler never sees the payment argument", async () => {
  const facilitator = okFacilitator("mcp:tool/inspect");
  let seenArgs: Record<string, unknown> | null = null;
  const { guard } = createPaidToolGuard({ facilitator, accepts: [ACCEPTS_ENTRY], facilitatorPublicKey: FACILITATOR_PUBLIC_KEY });
  const paidTool = guard("inspect", async (args: Record<string, unknown>) => {
    seenArgs = args;
    return { content: [{ type: "text", text: "ok" }] };
  });
  const { invoke } = makeWalletInvoke();
  const caller = createPayingToolCaller({
    callTool: async (_name, args) => paidTool(args as never),
    walletInvoke: invoke,
    policy: policyAllowing(),
    serverOrigin: SERVER_ORIGIN,
  });

  await caller("inspect", { q: "check" });
  expect(seenArgs).toEqual({ q: "check" });
  expect(seenArgs).not.toHaveProperty(X402_PAYMENT_ARG);
});

test("policy denial blocks the tool payment before any wallet call", async () => {
  const { guard } = createPaidToolGuard({
    facilitator: okFacilitator(),
    accepts: [ACCEPTS_ENTRY],
    facilitatorPublicKey: FACILITATOR_PUBLIC_KEY,
  });
  const paidEcho = guard("echo", echoTool);
  const { invoke, calls } = makeWalletInvoke();

  const caller = createPayingToolCaller({
    callTool: async (_name, args) => paidEcho(args as never),
    walletInvoke: invoke,
    policy: new SpendPolicy({ allowOrigins: [], maxAtomicPerRequest: 10_000n }),
    serverOrigin: SERVER_ORIGIN,
  });

  await expect(caller("echo", {})).rejects.toThrowError(SpendPolicyError);
  expect(calls.length).toBe(0);
});

test("invalid payment yields a challenge with invalidReason; caller refuses to double-pay", async () => {
  const rejecting: VerifySettleClient = {
    verify: async () => ({ isValid: false, invalidReason: "tx not on chain" }),
    settle: async () => ({ success: false, error: "unreachable" }),
  };
  const { guard } = createPaidToolGuard({ facilitator: rejecting, accepts: [ACCEPTS_ENTRY], facilitatorPublicKey: FACILITATOR_PUBLIC_KEY });
  const paidEcho = guard("echo", echoTool);
  const { invoke, calls } = makeWalletInvoke();

  const caller = createPayingToolCaller({
    callTool: async (_name, args) => paidEcho(args as never),
    walletInvoke: invoke,
    policy: policyAllowing(),
    serverOrigin: SERVER_ORIGIN,
    settleTimeoutMs: 0,
  });

  await expect(caller("echo", {})).rejects.toThrowError(X402ToolPaymentRejectedError);
  expect(calls.length).toBe(1); // paid once, refused the second demand
});

test("settlement lag: replays the same tool payment until verify passes", async () => {
  let verifies = 0;
  const lagging: VerifySettleClient = {
    verify: async () => {
      verifies++;
      return verifies < 3
        ? { isValid: false, invalidReason: "not_finalized" }
        : { isValid: true, payer: PAYER };
    },
    settle: async () => ({ success: true, transaction: TXID, network: "dero-mainnet", receipt: signReceiptFor("mcp:tool/echo") }),
  };
  const { guard } = createPaidToolGuard({ facilitator: lagging, accepts: [ACCEPTS_ENTRY], facilitatorPublicKey: FACILITATOR_PUBLIC_KEY });
  const paidEcho = guard("echo", echoTool);
  const { invoke, calls } = makeWalletInvoke();

  const caller = createPayingToolCaller({
    callTool: async (_name, args) => paidEcho(args as never),
    walletInvoke: invoke,
    policy: policyAllowing(),
    serverOrigin: SERVER_ORIGIN,
    settleTimeoutMs: 5_000,
    settlePollIntervalMs: 1,
  });

  const result = await caller("echo", { q: "lag" });
  expect(result.isError).toBeUndefined();
  expect(calls.length).toBe(1);
  expect(verifies).toBe(3);
});

test("free tools and non-challenge errors pass through the paying caller untouched", async () => {
  const { invoke, calls } = makeWalletInvoke();
  const caller = createPayingToolCaller({
    callTool: async () => ({
      isError: true,
      content: [{ type: "text", text: "plain failure, not a 402" }],
    }),
    walletInvoke: invoke,
    policy: policyAllowing(),
    serverOrigin: SERVER_ORIGIN,
  });

  const result = await caller("whatever", {});
  expect(result.isError).toBe(true);
  expect(calls.length).toBe(0);
});

test("payment evidence is emitted for paid tool calls", async () => {
  const facilitator = okFacilitator();
  const { guard } = createPaidToolGuard({ facilitator, accepts: [ACCEPTS_ENTRY], facilitatorPublicKey: FACILITATOR_PUBLIC_KEY });
  const paidEcho = guard("echo", echoTool);
  const { invoke } = makeWalletInvoke();
  const evidence: unknown[] = [];

  const caller = createPayingToolCaller({
    callTool: async (_name, args) => paidEcho(args as never),
    walletInvoke: invoke,
    policy: policyAllowing(),
    serverOrigin: SERVER_ORIGIN,
    onPayment: (e) => evidence.push(e),
  });

  await caller("echo", {});
  expect(evidence.length).toBe(1);
  expect(evidence[0]).toMatchObject({
    origin: SERVER_ORIGIN,
    resource: "mcp:tool/echo",
    scid: SCID,
    amountAtomic: "1000",
    txid: TXID,
    payer: PAYER,
  });
});

test("O17: resourceFor sees call args so a parameterized tool binds per-argument", async () => {
  const { guard } = createPaidToolGuard({
    facilitator: okFacilitator(),
    accepts: [ACCEPTS_ENTRY],
    facilitatorPublicKey: FACILITATOR_PUBLIC_KEY,
    resourceFor: (name, args) => `mcp:tool/${name}?symbol=${String(args.symbol)}`,
  });
  const paidQuote = guard("getQuote", echoTool);

  const btc = parsePaidToolChallenge(await paidQuote({ symbol: "BTC" }));
  const eth = parsePaidToolChallenge(await paidQuote({ symbol: "ETH" }));
  expect(btc!.resource).toBe("mcp:tool/getQuote?symbol=BTC");
  expect(eth!.resource).toBe("mcp:tool/getQuote?symbol=ETH");
  // Distinct resources => a receipt/ledger entry for one cannot unlock the other
  // (no pay-per-handler collapse).
  expect(btc!.resource).not.toBe(eth!.resource);
});

test("O17/O19: orderIdMinter binds a fresh server-authoritative orderId per challenge", async () => {
  const { createOrderIdMinter } = await import("../src/x402/order-id");
  const minter = createOrderIdMinter("s".repeat(32));
  const { guard } = createPaidToolGuard({
    facilitator: okFacilitator(),
    accepts: [ACCEPTS_ENTRY],
    facilitatorPublicKey: FACILITATOR_PUBLIC_KEY,
    orderIdMinter: minter,
  });
  const paidEcho = guard("echo", echoTool);

  const a = parsePaidToolChallenge(await paidEcho({ q: "1" }));
  const b = parsePaidToolChallenge(await paidEcho({ q: "2" }));
  const idA = a!.accepts[0].extra.orderId;
  const idB = b!.accepts[0].extra.orderId;
  // Not the permanent static config orderId, and fresh per request.
  expect(idA).not.toBe("tool-call-1");
  expect(idA).not.toBe(idB);
  // Each is a valid server-issued id for its merchant|resource context.
  expect(minter.isServerIssued(idA, `hive-mcp|mcp:tool/echo`)).toBe(true);
});
