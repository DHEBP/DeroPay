/**
 * MCP paidTools on the invoice/receipt rail: createPaidToolGuard runs
 * against a mock InvoiceEngine over a mutable invoice map (with a real
 * MemoryInvoiceStore for replay protection), and createPayingToolCaller
 * pays by flipping the invoice to completed.
 */

import { test, expect } from "vitest";
import type { InvoiceEngine } from "../src/server/invoice-engine.js";
import type { CreateInvoiceParams, Invoice } from "../src/core/types.js";
import { MemoryInvoiceStore } from "../src/store/memory.js";
import { makeInvoice } from "./helpers.js";
import { SpendPolicy, SpendPolicyError } from "../src/agent/policy.js";
import type { InvoicePayer, InvoicePayment } from "../src/agent/payer.js";
import type { PaymentEvidence } from "../src/agent/paying-fetch.js";
import {
  createPaidToolGuard,
  createPayingToolCaller,
  parsePaidToolChallenge,
  X402ToolPaymentRejectedError,
  X402_PAYMENT_ARG,
  type CallTool,
  type PaidToolGuardConfig,
} from "../src/agent/mcp.js";

const SERVER_ORIGIN = "http://mcp.test";
const SECRET = "mcp-receipt-secret";
const TXID = "b".repeat(64);

type McpServer = {
  callTool: CallTool;
  completeInvoice: (id: string) => void;
  invoices: Map<string, Invoice>;
};

function makeMcpServer(
  options: Partial<Pick<PaidToolGuardConfig, "pricing" | "singleUse" | "resourceFor">> = {}
): McpServer {
  const invoices = new Map<string, Invoice>();
  const store = new MemoryInvoiceStore();
  let seq = 0;

  const engine = {
    createInvoice: async (params: CreateInvoiceParams) => {
      seq += 1;
      const invoice = makeInvoice({
        id: `inv-${seq}`,
        amount: params.amount,
        status: "pending",
        integratedAddress: `deti1qmcp${seq}`,
        metadata: params.metadata ?? {},
      });
      invoices.set(invoice.id, invoice);
      return invoice;
    },
    getInvoice: async (id: string) => invoices.get(id) ?? null,
    getStore: () => store,
    emitX402AuditEvent: () => {},
  } as unknown as InvoiceEngine;

  const { guard } = createPaidToolGuard({
    getEngine: async () => engine,
    receiptSecret: SECRET,
    pricing: options.pricing ?? { amountAtomic: 500n },
    singleUse: options.singleUse,
    resourceFor: options.resourceFor,
  });

  const echo = guard("echo", async (args) => ({
    content: [{ type: "text", text: JSON.stringify(args) }],
  }));

  const callTool: CallTool = async (toolName, args) => {
    if (toolName === "echo") return echo(args as Record<string, unknown>);
    return { content: [{ type: "text", text: "free" }] };
  };

  const completeInvoice = (id: string): void => {
    const invoice = invoices.get(id);
    if (!invoice || invoice.status === "completed") return;
    invoices.set(id, {
      ...invoice,
      status: "completed",
      amountReceived: invoice.amount,
      completedAt: new Date().toISOString(),
    });
  };

  return { callTool, completeInvoice, invoices };
}

function makeToolPayer(server: McpServer, opts: { settle?: "instant" | "never" } = {}) {
  const calls: InvoicePayment[] = [];
  const payer: InvoicePayer = async (payment) => {
    calls.push(payment);
    if (opts.settle !== "never") server.completeInvoice(payment.invoiceId);
    return { txid: TXID };
  };
  return { payer, calls };
}

function makeCaller(
  server: McpServer,
  payer: InvoicePayer,
  extra: Partial<Parameters<typeof createPayingToolCaller>[0]> = {}
) {
  return createPayingToolCaller({
    callTool: server.callTool,
    payer,
    policy: new SpendPolicy({ allowOrigins: [SERVER_ORIGIN], maxAtomicPerRequest: 10_000n }),
    serverOrigin: SERVER_ORIGIN,
    settlePollIntervalMs: 1,
    ...extra,
  });
}

test("an unpaid call gets a payment_required challenge naming a fresh invoice", async () => {
  const server = makeMcpServer();
  const result = await server.callTool("echo", { q: 1 });

  expect(result.isError).toBe(true);
  const challenge = parsePaidToolChallenge(result);
  expect(challenge).not.toBeNull();
  expect(challenge!.payment.resource).toBe("mcp:tool/echo");
  expect(challenge!.payment.invoiceId).toBe("inv-1");
  expect(challenge!.payment.amountAtomic).toBe("500");
  expect(challenge!.payment.integratedAddress).toBe("deti1qmcp1");
  expect(server.invoices.get("inv-1")?.metadata).toEqual({ x402Resource: "mcp:tool/echo" });
});

test("free tools pass through untouched, nothing is paid", async () => {
  const server = makeMcpServer();
  const { payer, calls } = makeToolPayer(server);
  const caller = makeCaller(server, payer);

  const result = await caller("weather", { city: "Berlin" });
  expect(result.content[0].text).toBe("free");
  expect(calls.length).toBe(0);
});

test("pays a challenge, replays with the invoice id, and returns the paid result", async () => {
  const server = makeMcpServer();
  const { payer, calls } = makeToolPayer(server);
  const evidence: PaymentEvidence[] = [];
  const caller = makeCaller(server, payer, { onPayment: (e) => evidence.push(e) });

  const result = await caller("echo", { q: "hello" });

  expect(result.isError).toBeUndefined();
  // The handler saw the original args without the payment argument.
  expect(JSON.parse(result.content[0].text!)).toEqual({ q: "hello" });
  const meta = result._meta?.["deropay/x402"] as Record<string, unknown>;
  expect(meta.settled).toBe(true);
  expect(meta.invoiceId).toBe("inv-1");

  expect(calls.length).toBe(1);
  expect(calls[0]).toMatchObject({
    invoiceId: "inv-1",
    integratedAddress: "deti1qmcp1",
    amountAtomic: 500n,
    resource: "mcp:tool/echo",
  });
  expect(evidence.length).toBe(1);
  expect(evidence[0]).toMatchObject({
    origin: SERVER_ORIGIN,
    resource: "mcp:tool/echo",
    invoiceId: "inv-1",
    amountAtomic: "500",
    txid: TXID,
  });
});

test("policy denial throws before any wallet call", async () => {
  const server = makeMcpServer();
  const { payer, calls } = makeToolPayer(server);
  const caller = makeCaller(server, payer, {
    policy: new SpendPolicy({ allowOrigins: ["http://other.test"], maxAtomicPerRequest: 10_000n }),
  });

  await expect(caller("echo", { q: 1 })).rejects.toThrowError(SpendPolicyError);
  expect(calls.length).toBe(0);
});

test("settling: the guard re-issues the SAME invoice until it completes, one payment total", async () => {
  const server = makeMcpServer();
  const { payer, calls } = makeToolPayer(server, { settle: "never" });

  // Chain settles only after the second paid replay.
  let paidReplays = 0;
  const settlingChallenges: string[] = [];
  const countingCallTool: CallTool = async (toolName, args) => {
    if (typeof args[X402_PAYMENT_ARG] === "string") {
      paidReplays += 1;
      if (paidReplays === 2) server.completeInvoice(args[X402_PAYMENT_ARG] as string);
    }
    const result = await server.callTool(toolName, args);
    const challenge = parsePaidToolChallenge(result);
    if (challenge?.settling) settlingChallenges.push(challenge.payment.invoiceId);
    return result;
  };

  const caller = createPayingToolCaller({
    callTool: countingCallTool,
    payer,
    policy: new SpendPolicy({ allowOrigins: [SERVER_ORIGIN], maxAtomicPerRequest: 10_000n }),
    serverOrigin: SERVER_ORIGIN,
    settlePollIntervalMs: 1,
  });

  const result = await caller("echo", { q: "wait" });
  expect(result.isError).toBeUndefined();
  expect(calls.length).toBe(1);
  // Every interim challenge referenced the invoice we already paid.
  expect(settlingChallenges.length).toBeGreaterThanOrEqual(1);
  expect(new Set(settlingChallenges)).toEqual(new Set(["inv-1"]));
});

test("a challenge for a DIFFERENT invoice after paying throws instead of paying again", async () => {
  const server = makeMcpServer();
  const { payer, calls } = makeToolPayer(server, { settle: "never" });

  // A hostile/broken server that always mints a fresh invoice.
  const alwaysFresh: CallTool = async (toolName, args) => {
    const { [X402_PAYMENT_ARG]: _omit, ...rest } = args;
    return server.callTool(toolName, rest);
  };

  const caller = createPayingToolCaller({
    callTool: alwaysFresh,
    payer,
    policy: new SpendPolicy({ allowOrigins: [SERVER_ORIGIN], maxAtomicPerRequest: 10_000n }),
    serverOrigin: SERVER_ORIGIN,
    settlePollIntervalMs: 1,
  });

  await expect(caller("echo", { q: 1 })).rejects.toThrowError(X402ToolPaymentRejectedError);
  expect(calls.length).toBe(1);
});

test("settlement timeout throws X402ToolPaymentRejectedError without a second payment", async () => {
  const server = makeMcpServer();
  const { payer, calls } = makeToolPayer(server, { settle: "never" });
  const caller = makeCaller(server, payer, { settleTimeoutMs: 5 });

  await expect(caller("echo", { q: 1 })).rejects.toThrowError(X402ToolPaymentRejectedError);
  expect(calls.length).toBe(1);
});

test("single-use (default): a redeemed invoice cannot unlock a second call", async () => {
  const server = makeMcpServer();
  const { payer } = makeToolPayer(server);
  const caller = makeCaller(server, payer);

  const first = await caller("echo", { q: 1 });
  expect(first.isError).toBeUndefined();

  // Replaying the same paid invoice id directly gets a fresh challenge.
  const replay = await server.callTool("echo", { q: 2, [X402_PAYMENT_ARG]: "inv-1" });
  const challenge = parsePaidToolChallenge(replay);
  expect(challenge).not.toBeNull();
  expect(challenge!.payment.invoiceId).not.toBe("inv-1");
});

test("singleUse: false returns a reusable receipt that unlocks later calls", async () => {
  const server = makeMcpServer({ singleUse: false });
  const { payer, calls } = makeToolPayer(server);
  const caller = makeCaller(server, payer);

  const first = await caller("echo", { q: 1 });
  const meta = first._meta?.["deropay/x402"] as Record<string, unknown>;
  const receipt = meta.receipt as string;
  expect(receipt.split(".").length).toBe(3);

  const invoiceCount = server.invoices.size;
  const second = await server.callTool("echo", { q: 2, [X402_PAYMENT_ARG]: receipt });
  expect(second.isError).toBeUndefined();
  expect(JSON.parse(second.content[0].text!)).toEqual({ q: 2 });
  expect(server.invoices.size).toBe(invoiceCount);
  expect(calls.length).toBe(1);
});

test("an invalid receipt token gets a fresh challenge, not an execution", async () => {
  const server = makeMcpServer();
  const result = await server.callTool("echo", { q: 1, [X402_PAYMENT_ARG]: "not.a.receipt" });
  const challenge = parsePaidToolChallenge(result);
  expect(challenge).not.toBeNull();
});

test("an unknown invoice id gets a fresh challenge", async () => {
  const server = makeMcpServer();
  const result = await server.callTool("echo", { q: 1, [X402_PAYMENT_ARG]: "inv-nope" });
  const challenge = parsePaidToolChallenge(result);
  expect(challenge).not.toBeNull();
});

test("an invoice paid for one tool cannot unlock another", async () => {
  const server = makeMcpServer();

  // Pay echo's invoice, then model a cross-tool redemption attempt by
  // rebinding the invoice to a different resource.
  const unpaid = await server.callTool("echo", { q: 1 });
  const challenge = parsePaidToolChallenge(unpaid)!;
  server.completeInvoice(challenge.payment.invoiceId);

  const invoice = server.invoices.get(challenge.payment.invoiceId)!;
  server.invoices.set(invoice.id, {
    ...invoice,
    metadata: { x402Resource: "mcp:tool/other" },
  });

  const result = await server.callTool("echo", {
    q: 2,
    [X402_PAYMENT_ARG]: challenge.payment.invoiceId,
  });
  expect(parsePaidToolChallenge(result)).not.toBeNull();
});
