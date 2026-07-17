/**
 * createPayingFetch — the x402 agent auto-payer.
 *
 * Wraps fetch: when a request comes back 402 with a DERO rail in
 * `accepts`, it checks the spending policy, pays through the supplied
 * WalletInvoke, and retries once with the X-PAYMENT header. Every
 * payment produces an evidence record; every denial is loud (throws),
 * because an autonomous agent silently proceeding unpaid — or paying
 * outside policy — is exactly what this layer exists to prevent.
 */

import { payDeroRail, selectAcceptsEntry, type WalletInvoke } from "./client";
import { paymentRequirementsSchema, type PaymentRequirements } from "./types";
import type { SpendGuard } from "./policy";

export type PaymentEvidence = {
  at: string;
  origin: string;
  resource: string;
  scheme: string;
  network: string;
  scid: string;
  merchantId: string;
  orderId: string;
  amountAtomic: string;
  txid: string;
  payer: string;
};

export class X402PaymentRejectedError extends Error {
  /** The 402 response received AFTER paying. */
  readonly response: Response;
  readonly txid: string;

  constructor(message: string, response: Response, txid: string) {
    super(message);
    this.name = "X402PaymentRejectedError";
    this.response = response;
    this.txid = txid;
  }
}

export class X402UnpayableError extends Error {
  readonly response: Response;

  constructor(message: string, response: Response) {
    super(message);
    this.name = "X402UnpayableError";
    this.response = response;
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type PayingFetchConfig = {
  walletInvoke: WalletInvoke;
  policy: SpendGuard;
  /** Underlying fetch (tests / custom transport). Default: globalThis.fetch */
  fetch?: FetchLike;
  /** Which rail to pay. Default: dero-exact on dero-mainnet. */
  match?: { scheme: string; network: string };
  /** Called after each successful payment with its evidence record. */
  onPayment?: (evidence: PaymentEvidence) => void;
  /**
   * When a 402 offers no matching rail: "passthrough" returns the 402
   * response untouched; "throw" raises X402UnpayableError. Default "throw"
   * so agent code cannot mistake an unpaid body for a paid one.
   */
  unpayable?: "throw" | "passthrough";
  /**
   * How long to keep retrying the paid request while the chain settles
   * (tx mined + server's confirmation depth). Default 90s. The SAME
   * payment header is replayed — a second payment is never made.
   */
  settleTimeoutMs?: number;
  /** Delay between settlement retries. Default 2s. */
  settlePollIntervalMs?: number;
};

function requestUrlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function decodePayerFromHeader(paymentHeader: string): string {
  try {
    const json = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
    return typeof json?.payload?.payer === "string" ? json.payload.payer : "";
  } catch {
    return "";
  }
}

/**
 * Returns a fetch-compatible function that transparently settles x402
 * challenges under the given policy. Concurrent calls that hit the same
 * (origin, orderId) challenge share one payment instead of double-paying.
 */
export function createPayingFetch(config: PayingFetchConfig) {
  const baseFetch: FetchLike = config.fetch ?? ((input, init) => fetch(input, init));
  const match = config.match ?? { scheme: "dero-exact", network: "dero-mainnet" };
  const unpayable = config.unpayable ?? "throw";
  const settleTimeoutMs = config.settleTimeoutMs ?? 90_000;
  const settlePollIntervalMs = config.settlePollIntervalMs ?? 2_000;
  const inFlight = new Map<string, Promise<{ paymentHeader: string; txid: string }>>();

  async function payOnce(
    origin: string,
    accepts: PaymentRequirements
  ): Promise<{ paymentHeader: string; txid: string }> {
    const key = `${origin}|${accepts.extra.merchantId}|${accepts.extra.orderId}`;
    const existing = inFlight.get(key);
    if (existing) return existing;

    const attempt = (async () => {
      const amountAtomic = BigInt(accepts.maxAmountRequired);
      const reservation = config.policy.reserve(origin, amountAtomic, {
        resource: accepts.resource,
      });
      try {
        const paid = await payDeroRail(accepts, config.walletInvoke);
        reservation.commit();
        config.onPayment?.({
          at: new Date().toISOString(),
          origin,
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
        return paid;
      } catch (error) {
        reservation.release();
        throw error;
      }
    })();

    inFlight.set(key, attempt);
    try {
      return await attempt;
    } finally {
      inFlight.delete(key);
    }
  }

  return async function payingFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // A Request body is consumed by the first send; buffer a clone up
    // front so the paid retries (plural — settlement takes blocks, not
    // milliseconds) can replay it as many times as needed.
    let template: { url: string; method: string; headers: Headers } | null = null;
    let bodyBuffer: ArrayBuffer | null = null;
    if (typeof Request !== "undefined" && input instanceof Request) {
      template = {
        url: input.url,
        method: input.method,
        headers: new Headers(input.headers),
      };
      if (input.body !== null) {
        bodyBuffer = await input.clone().arrayBuffer();
      }
    }

    const response = await baseFetch(input, init);
    if (response.status !== 402) return response;

    let body: unknown;
    try {
      body = await response.clone().json();
    } catch {
      if (unpayable === "passthrough") return response;
      throw new X402UnpayableError("402 response body is not JSON", response);
    }

    const acceptsRaw = (body as { accepts?: unknown[] })?.accepts;
    const parsedAccepts: PaymentRequirements[] = Array.isArray(acceptsRaw)
      ? acceptsRaw.flatMap((entry) => {
          const result = paymentRequirementsSchema.safeParse(entry);
          return result.success ? [result.data] : [];
        })
      : [];

    const accepts = selectAcceptsEntry(parsedAccepts, match);
    if (!accepts) {
      if (unpayable === "passthrough") return response;
      throw new X402UnpayableError(
        `402 offered no ${match.scheme}/${match.network} rail`,
        response
      );
    }

    const origin = new URL(requestUrlOf(input)).origin;
    const { paymentHeader, txid } = await payOnce(origin, accepts);

    // On-chain settlement is not instant: the payment tx must be mined
    // and reach the server's confirmation depth. Retry the SAME payment
    // header with backoff until the deadline — never pay a second time.
    function buildRetry(): [RequestInfo | URL, RequestInit | undefined] {
      if (template) {
        const headers = new Headers(template.headers);
        headers.set("X-PAYMENT", paymentHeader);
        return [
          template.url,
          {
            method: template.method,
            headers,
            ...(bodyBuffer !== null ? { body: bodyBuffer } : {}),
          },
        ];
      }
      const headers = new Headers(init?.headers);
      headers.set("X-PAYMENT", paymentHeader);
      return [input, { ...init, headers }];
    }

    const deadline = Date.now() + settleTimeoutMs;
    let paidResponse = await baseFetch(...buildRetry());
    while (paidResponse.status === 402 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, settlePollIntervalMs));
      paidResponse = await baseFetch(...buildRetry());
    }
    if (paidResponse.status === 402) {
      throw new X402PaymentRejectedError(
        `Server still returned 402 after payment (txid ${txid}) and ${settleTimeoutMs}ms of settlement retries — refusing to pay again`,
        paidResponse,
        txid
      );
    }
    return paidResponse;
  };
}
