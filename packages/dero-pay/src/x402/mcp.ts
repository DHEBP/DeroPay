/**
 * x402 for MCP tools — the "paidTool" pattern (per-call payment gating,
 * free and paid tools mixed in one server), transport-agnostic so it works
 * over stdio and Streamable HTTP alike.
 *
 * No dependency on any MCP SDK: the payment travels as an `x402Payment`
 * tool ARGUMENT carrying the same base64 payload as the HTTP X-PAYMENT
 * header, and the payment challenge comes back as a structured
 * `payment_required` tool result. Servers wrap their handlers with
 * createPaidToolGuard; clients wrap their callTool with
 * createPayingToolCaller.
 */

import { payDeroRail, selectAcceptsEntry, type WalletInvoke } from "./client";
import {
  parsePaymentHeader,
  type VerifySettleClient,
} from "./server";
import { paymentRequirementsSchema, type PaymentRequirements } from "./types";
import { SpendPolicy } from "./policy";
import { decodePayerFromHeader, type PaymentEvidence } from "./paying-fetch";

/** Name of the reserved tool argument that carries the payment payload. */
export const X402_PAYMENT_ARG = "x402Payment";

/** Marker embedded in payment_required tool results. */
export const X402_MCP_ERROR = "payment_required";

export type PaidToolChallenge = {
  x402Version: 1;
  error: typeof X402_MCP_ERROR;
  resource: string;
  accepts: PaymentRequirements[];
  invalidReason?: string;
};

/** Minimal MCP-shaped tool result the guard emits and inspects. */
export type McpToolResult = {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
};

export type PaidToolGuardConfig = {
  facilitator: VerifySettleClient;
  /** Rails offered for every guarded tool. payTo/merchant come from here. */
  accepts: Omit<PaymentRequirements, "resource">[];
  /**
   * Resource URI builder for a tool. Default: `mcp:tool/<name>`.
   * The resource is embedded in the challenge and bound at verify time.
   */
  resourceFor?: (toolName: string) => string;
  /** Called after each successful settle with the receipt payload. */
  onSettled?: (info: {
    toolName: string;
    resource: string;
    transaction?: string;
    receipt?: unknown;
  }) => void;
};

export type ToolHandler<TArgs> = (
  args: TArgs,
  extra?: unknown
) => Promise<McpToolResult> | McpToolResult;

function challengeResult(challenge: PaidToolChallenge): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(challenge) }],
    _meta: { "deropay/x402": { status: 402 } },
  };
}

/**
 * Wrap tool handlers so each call requires a settled x402 payment.
 * A call without a valid `x402Payment` argument gets a payment_required
 * result carrying `accepts`; a call with one is verified AND settled
 * against the facilitator before the handler runs.
 */
export function createPaidToolGuard(config: PaidToolGuardConfig) {
  const resourceFor = config.resourceFor ?? ((name: string) => `mcp:tool/${name}`);

  function acceptsFor(toolName: string): PaymentRequirements[] {
    const resource = resourceFor(toolName);
    return config.accepts.map((entry) =>
      paymentRequirementsSchema.parse({ ...entry, resource })
    );
  }

  function guard<TArgs extends Record<string, unknown>>(
    toolName: string,
    handler: ToolHandler<TArgs>
  ): ToolHandler<TArgs & { [X402_PAYMENT_ARG]?: string }> {
    return async (args, extra) => {
      const accepts = acceptsFor(toolName);
      const resource = resourceFor(toolName);
      const paymentArg = args?.[X402_PAYMENT_ARG];

      const payload = typeof paymentArg === "string" ? parsePaymentHeader(paymentArg) : null;
      if (!payload) {
        return challengeResult({ x402Version: 1, error: X402_MCP_ERROR, resource, accepts });
      }

      const matching = accepts.find(
        (a) => a.scheme === payload.scheme && a.network === payload.network
      );
      if (!matching) {
        return challengeResult({ x402Version: 1, error: X402_MCP_ERROR, resource, accepts });
      }

      const verify = await config.facilitator.verify({
        paymentPayload: payload,
        paymentRequirements: matching,
      });
      if (!verify.isValid) {
        return challengeResult({
          x402Version: 1,
          error: X402_MCP_ERROR,
          resource,
          accepts,
          invalidReason: verify.invalidReason,
        });
      }

      const settle = await config.facilitator.settle({
        paymentPayload: payload,
        paymentRequirements: matching,
      });
      if (!settle.success) {
        return challengeResult({
          x402Version: 1,
          error: X402_MCP_ERROR,
          resource,
          accepts,
          invalidReason: settle.error,
        });
      }

      config.onSettled?.({
        toolName,
        resource,
        transaction: settle.transaction,
        receipt: settle.receipt,
      });

      const { [X402_PAYMENT_ARG]: _omit, ...handlerArgs } = args as Record<string, unknown>;
      const result = await handler(handlerArgs as TArgs, extra);
      return {
        ...result,
        _meta: {
          ...(result._meta ?? {}),
          "deropay/x402": {
            settled: true,
            transaction: settle.transaction,
            network: settle.network,
            receipt: settle.receipt,
          },
        },
      };
    };
  }

  return { guard, acceptsFor };
}

/** Parse a tool result as a payment challenge, if it is one. */
export function parsePaidToolChallenge(result: McpToolResult): PaidToolChallenge | null {
  if (!result?.isError || !Array.isArray(result.content)) return null;
  for (const item of result.content) {
    if (item.type !== "text" || typeof item.text !== "string") continue;
    try {
      const parsed = JSON.parse(item.text);
      if (parsed?.error === X402_MCP_ERROR && Array.isArray(parsed.accepts)) {
        const accepts = parsed.accepts.flatMap((entry: unknown) => {
          const r = paymentRequirementsSchema.safeParse(entry);
          return r.success ? [r.data] : [];
        });
        return {
          x402Version: 1,
          error: X402_MCP_ERROR,
          resource: String(parsed.resource ?? ""),
          accepts,
          invalidReason: parsed.invalidReason,
        };
      }
    } catch {
      // not JSON — not a challenge
    }
  }
  return null;
}

export type CallTool = (
  toolName: string,
  args: Record<string, unknown>
) => Promise<McpToolResult>;

export type PayingToolCallerConfig = {
  callTool: CallTool;
  walletInvoke: WalletInvoke;
  policy: SpendPolicy;
  /**
   * Policy origin under which MCP payments are accounted, e.g. the MCP
   * server's URL. Required because tool calls have no natural web origin.
   */
  serverOrigin: string;
  match?: { scheme: string; network: string };
  onPayment?: (evidence: PaymentEvidence) => void;
  /**
   * How long to keep retrying the paid tool call while the chain settles.
   * The SAME payment payload is replayed — never a second payment.
   * Default 90s.
   */
  settleTimeoutMs?: number;
  /** Delay between settlement retries. Default 2s. */
  settlePollIntervalMs?: number;
};

export class X402ToolPaymentRejectedError extends Error {
  readonly result: McpToolResult;
  readonly txid: string;

  constructor(message: string, result: McpToolResult, txid: string) {
    super(message);
    this.name = "X402ToolPaymentRejectedError";
    this.result = result;
    this.txid = txid;
  }
}

/**
 * Wrap an MCP callTool so payment_required results are settled under the
 * spending policy and the call retried once with the payment attached.
 */
export function createPayingToolCaller(config: PayingToolCallerConfig): CallTool {
  const match = config.match ?? { scheme: "dero-exact", network: "dero-mainnet" };
  const settleTimeoutMs = config.settleTimeoutMs ?? 90_000;
  const settlePollIntervalMs = config.settlePollIntervalMs ?? 2_000;

  return async (toolName, args) => {
    const first = await config.callTool(toolName, args);
    const challenge = parsePaidToolChallenge(first);
    if (!challenge) return first;

    const accepts = selectAcceptsEntry(challenge.accepts, match);
    if (!accepts) return first;

    const amountAtomic = BigInt(accepts.maxAmountRequired);
    const reservation = config.policy.reserve(config.serverOrigin, amountAtomic);

    let paid: { paymentHeader: string; txid: string };
    try {
      paid = await payDeroRail(accepts, config.walletInvoke);
      reservation.commit();
    } catch (error) {
      reservation.release();
      throw error;
    }

    config.onPayment?.({
      at: new Date().toISOString(),
      origin: config.serverOrigin,
      resource: accepts.resource,
      scheme: accepts.scheme,
      network: accepts.network,
      scid: accepts.payTo,
      merchantId: accepts.extra.merchantId,
      orderId: accepts.extra.orderId,
      amountAtomic: accepts.maxAmountRequired,
      txid: paid.txid,
      payer: decodePayerFromHeader(paid.paymentHeader),
    });

    // On-chain settlement takes blocks; replay the SAME payment until the
    // server's confirmation depth is reached or the deadline passes.
    const paidArgs = { ...args, [X402_PAYMENT_ARG]: paid.paymentHeader };
    const deadline = Date.now() + settleTimeoutMs;
    let second = await config.callTool(toolName, paidArgs);
    while (parsePaidToolChallenge(second) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, settlePollIntervalMs));
      second = await config.callTool(toolName, paidArgs);
    }
    if (parsePaidToolChallenge(second)) {
      throw new X402ToolPaymentRejectedError(
        `Tool ${toolName} still demands payment after settling txid ${paid.txid} and ${settleTimeoutMs}ms of retries — refusing to pay again`,
        second,
        paid.txid
      );
    }
    return second;
  };
}
