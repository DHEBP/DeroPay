/**
 * createPayingFetch — the autonomous agent payer for DeroPay's invoice/
 * receipt rail.
 *
 * Wraps fetch: when a request comes back 402 with an x402-deropay-draft
 * challenge, it checks the spending policy, pays the invoice's
 * integrated address through the supplied InvoicePayer, polls the
 * merchant's payment API until the invoice completes, redeems it for a
 * DPAY-RECEIPT token, and retries the request with the receipt attached.
 * Every payment produces an evidence record; every denial is loud
 * (throws), because an autonomous agent silently proceeding unpaid — or
 * paying outside policy — is exactly what this layer exists to prevent.
 */

import type { DeroChainId } from "../core/types.js";
import type { PaymentReceiptClaims } from "../server/payment-receipts.js";
import {
  parseX402Challenge,
  parseInvoiceStatusResponse,
  type X402Challenge,
} from "./challenge.js";
import type { InvoicePayer } from "./payer.js";
import type { SpendGuard } from "./policy.js";

/** Record of one settled payment, for audit sinks. */
export type PaymentEvidence = {
  at: string;
  origin: string;
  resource: string;
  network: DeroChainId;
  invoiceId: string;
  integratedAddress: string;
  amountAtomic: string;
  txid: string;
  /** Unset for MCP payments until the guard mints the receipt server-side. */
  receiptJti?: string;
  receiptExpiresAt?: number;
};

/** The 402 (or a broken issue step) received AFTER the invoice was paid. */
export class X402PaymentRejectedError extends Error {
  readonly response: Response;
  readonly txid: string;
  readonly invoiceId: string;

  constructor(message: string, response: Response, txid: string, invoiceId: string) {
    super(message);
    this.name = "X402PaymentRejectedError";
    this.response = response;
    this.txid = txid;
    this.invoiceId = invoiceId;
  }
}

/** A 402 that cannot be paid on this rail (wrong shape, protocol, or network). */
export class X402UnpayableError extends Error {
  readonly response: Response;

  constructor(message: string, response: Response) {
    super(message);
    this.name = "X402UnpayableError";
    this.response = response;
  }
}

/**
 * The invoice was paid but did not complete inside the settlement
 * window. `reason: "deadline"` is recoverable — a later call through the
 * same payer resumes waiting on this invoice instead of paying again.
 * `reason: "invoice_expired"` is terminal: the transfer left the wallet
 * but the invoice lapsed; the carried fields identify what to reconcile.
 */
export class X402SettlementTimeoutError extends Error {
  readonly reason: "deadline" | "invoice_expired";
  readonly origin: string;
  readonly resource: string;
  readonly invoiceId: string;
  readonly txid: string;
  readonly integratedAddress: string;
  readonly paymentApi: string;

  constructor(
    message: string,
    reason: "deadline" | "invoice_expired",
    details: {
      origin: string;
      resource: string;
      invoiceId: string;
      txid: string;
      integratedAddress: string;
      paymentApi: string;
    }
  ) {
    super(message);
    this.name = "X402SettlementTimeoutError";
    this.reason = reason;
    this.origin = details.origin;
    this.resource = details.resource;
    this.invoiceId = details.invoiceId;
    this.txid = details.txid;
    this.integratedAddress = details.integratedAddress;
    this.paymentApi = details.paymentApi;
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type PayingFetchConfig = {
  payer: InvoicePayer;
  policy: SpendGuard;
  /** Underlying fetch (tests / custom transport). Default: globalThis.fetch */
  fetch?: FetchLike;
  /**
   * Where the merchant mounts createPaymentHandlers (status + receipt
   * issue endpoints). The challenge does not carry this, so it is a
   * convention: default `${origin}/api/pay` on the resource's origin.
   */
  paymentApi?: string | ((challenge: X402Challenge, resourceUrl: string) => string);
  /** Challenge protocol this payer honors. Default "x402-deropay-draft". */
  protocol?: string;
  /** Refuse challenges on any other network. Unset: pay whatever network the challenge names. */
  network?: DeroChainId;
  /** Called after each payment settles into a receipt, with its evidence record. */
  onPayment?: (evidence: PaymentEvidence) => void;
  /**
   * When a 402 cannot be paid on this rail: "passthrough" returns the 402
   * response untouched; "throw" raises X402UnpayableError. Default "throw"
   * so agent code cannot mistake an unpaid body for a paid one.
   */
  unpayable?: "throw" | "passthrough";
  /**
   * How long to wait for the paid invoice to complete (tx mined + the
   * server's confirmation depth). Default 180s — mainnet needs ~18s per
   * confirmation. The SAME invoice is polled; a second payment is never made.
   */
  settleTimeoutMs?: number;
  /** Delay between status polls. Default 2.5s. */
  settlePollIntervalMs?: number;
  /**
   * Cache issued receipts per (origin, path) and attach them to later
   * requests until they expire, so repeat calls don't re-pay. Default
   * true. Disable against servers that enforce single-use receipts to
   * skip a wasted round-trip per call.
   */
  reuseReceipts?: boolean;
  /** Header carrying the receipt. Default "X-DeroPay-Receipt" (the guard's default). */
  receiptHeaderName?: string;
  /** ttlSeconds forwarded to the receipt issue endpoint. Unset: server default. */
  receiptTtlSeconds?: number;
};

type IssuedReceipt = { token: string; claims: PaymentReceiptClaims };

type PendingPayment = {
  invoiceId: string;
  txid: string;
  integratedAddress: string;
  expiresAt: string;
};

function requestUrlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns a fetch-compatible function that transparently settles x402
 * challenges under the given policy. Concurrent calls that hit the same
 * (origin, resource, amount) challenge share one payment instead of
 * double-paying, and a call that times out while settling leaves a
 * pending record the next call resumes — the payer never pays the same
 * demand twice.
 */
export function createPayingFetch(config: PayingFetchConfig) {
  const baseFetch: FetchLike = config.fetch ?? ((input, init) => fetch(input, init));
  const protocol = config.protocol ?? "x402-deropay-draft";
  const unpayable = config.unpayable ?? "throw";
  const settleTimeoutMs = config.settleTimeoutMs ?? 180_000;
  const settlePollIntervalMs = config.settlePollIntervalMs ?? 2_500;
  const reuseReceipts = config.reuseReceipts ?? true;
  const receiptHeaderName = config.receiptHeaderName ?? "X-DeroPay-Receipt";

  /** origin|path → live receipt, reused until expiry. */
  const receiptCache = new Map<string, IssuedReceipt>();
  /** origin|resource|amount → in-flight challenge→pay→issue attempt. */
  const inFlight = new Map<string, Promise<IssuedReceipt>>();
  /** origin|resource|amount → paid-but-unredeemed invoice to resume. */
  const pendingPayments = new Map<string, PendingPayment>();

  function paymentApiFor(challenge: X402Challenge, resourceUrl: string): string {
    const configured = config.paymentApi;
    const base =
      typeof configured === "function"
        ? configured(challenge, resourceUrl)
        : configured ?? `${new URL(resourceUrl).origin}/api/pay`;
    return base.replace(/\/+$/, "");
  }

  function cachedReceiptFor(cacheKey: string): IssuedReceipt | null {
    const entry = receiptCache.get(cacheKey);
    if (!entry) return null;
    if (entry.claims.expiresAt <= Date.now()) {
      receiptCache.delete(cacheKey);
      return null;
    }
    return entry;
  }

  async function settleAndIssue(args: {
    origin: string;
    resource: string;
    paymentApi: string;
    pending: PendingPayment;
    pendingKey: string;
  }): Promise<IssuedReceipt> {
    const { origin, resource, paymentApi, pending, pendingKey } = args;
    const deadline = Date.now() + settleTimeoutMs;
    const details = {
      origin,
      resource,
      invoiceId: pending.invoiceId,
      txid: pending.txid,
      integratedAddress: pending.integratedAddress,
      paymentApi,
    };

    for (;;) {
      let snapshot: ReturnType<typeof parseInvoiceStatusResponse> = null;
      try {
        const statusResponse = await baseFetch(
          `${paymentApi}/status?invoiceId=${encodeURIComponent(pending.invoiceId)}`
        );
        if (statusResponse.ok) {
          snapshot = parseInvoiceStatusResponse(await statusResponse.json());
        }
      } catch {
        // Transient status failure — keep polling until the deadline.
      }
      if (snapshot?.status === "completed") break;
      if (snapshot?.status === "expired") {
        pendingPayments.delete(pendingKey);
        throw new X402SettlementTimeoutError(
          `Invoice ${pending.invoiceId} expired before payment txid ${pending.txid} settled — ` +
            `the transfer left the wallet and needs manual reconciliation with the merchant`,
          "invoice_expired",
          details
        );
      }
      if (Date.now() >= deadline) {
        // Keep the pending record: the next call to this resource resumes
        // waiting on this invoice instead of paying again.
        throw new X402SettlementTimeoutError(
          `Timed out after ${settleTimeoutMs}ms waiting for invoice ${pending.invoiceId} ` +
            `(txid ${pending.txid}) to complete; a later call through this payer resumes ` +
            `the wait without paying again`,
          "deadline",
          details
        );
      }
      await sleep(settlePollIntervalMs);
    }

    const issueResponse = await baseFetch(`${paymentApi}/receipts/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId: pending.invoiceId,
        resource,
        ...(config.receiptTtlSeconds !== undefined
          ? { ttlSeconds: config.receiptTtlSeconds }
          : {}),
      }),
    });
    // On failure the pending record is kept: the invoice is completed and
    // paid for, so a later call retries redemption rather than re-paying.
    if (!issueResponse.ok) {
      throw new X402PaymentRejectedError(
        `Receipt issuance failed with status ${issueResponse.status} for completed invoice ${pending.invoiceId}`,
        issueResponse,
        pending.txid,
        pending.invoiceId
      );
    }
    const issued = (await issueResponse.json()) as {
      receipt?: string;
      claims?: PaymentReceiptClaims;
    };
    if (typeof issued?.receipt !== "string" || !issued.claims) {
      throw new X402PaymentRejectedError(
        `Receipt issue endpoint returned a malformed body for invoice ${pending.invoiceId}`,
        issueResponse,
        pending.txid,
        pending.invoiceId
      );
    }
    pendingPayments.delete(pendingKey);
    return { token: issued.receipt, claims: issued.claims };
  }

  async function obtainReceipt(
    origin: string,
    challenge: X402Challenge,
    resourceUrl: string,
    cacheKey: string
  ): Promise<IssuedReceipt> {
    const payment = challenge.payment;
    const dedupKey = `${origin}|${payment.resource}|${payment.amountAtomic}`;
    const existing = inFlight.get(dedupKey);
    if (existing) return existing;

    const attempt = (async () => {
      const paymentApi = paymentApiFor(challenge, resourceUrl);

      let pending = pendingPayments.get(dedupKey);
      if (pending && new Date(pending.expiresAt).getTime() <= Date.now()) {
        pendingPayments.delete(dedupKey);
        pending = undefined;
      }

      if (!pending) {
        const amountAtomic = BigInt(payment.amountAtomic);
        const reservation = config.policy.reserve(origin, amountAtomic, {
          resource: payment.resource,
        });
        try {
          const paid = await config.payer({
            invoiceId: payment.invoiceId,
            integratedAddress: payment.integratedAddress,
            amountAtomic,
            network: payment.network,
            resource: payment.resource,
            expiresAt: payment.expiresAt,
          });
          // The DERO left the wallet the moment the transfer succeeded;
          // the reservation is spent no matter how settlement goes.
          reservation.commit();
          pending = {
            invoiceId: payment.invoiceId,
            txid: paid.txid,
            integratedAddress: payment.integratedAddress,
            expiresAt: payment.expiresAt,
          };
        } catch (error) {
          reservation.release();
          throw error;
        }
        pendingPayments.set(dedupKey, pending);
      }

      const issued = await settleAndIssue({
        origin,
        resource: payment.resource,
        paymentApi,
        pending,
        pendingKey: dedupKey,
      });
      if (reuseReceipts) receiptCache.set(cacheKey, issued);
      config.onPayment?.({
        at: new Date().toISOString(),
        origin,
        resource: payment.resource,
        network: payment.network,
        invoiceId: pending.invoiceId,
        integratedAddress: pending.integratedAddress,
        amountAtomic: payment.amountAtomic,
        txid: pending.txid,
        receiptJti: issued.claims.jti,
        receiptExpiresAt: issued.claims.expiresAt,
      });
      return issued;
    })();

    inFlight.set(dedupKey, attempt);
    try {
      return await attempt;
    } finally {
      inFlight.delete(dedupKey);
    }
  }

  return async function payingFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // A Request body is consumed by the first send; buffer a clone up
    // front so paid retries can replay it as many times as needed.
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

    const resourceUrl = requestUrlOf(input);
    const parsedUrl = new URL(resourceUrl);
    const origin = parsedUrl.origin;
    const cacheKey = `${origin}|${parsedUrl.pathname}`;

    function buildSend(receiptToken: string | null): [RequestInfo | URL, RequestInit | undefined] {
      if (template) {
        const headers = new Headers(template.headers);
        if (receiptToken) headers.set(receiptHeaderName, receiptToken);
        return [
          template.url,
          {
            method: template.method,
            headers,
            ...(bodyBuffer !== null ? { body: bodyBuffer } : {}),
          },
        ];
      }
      if (!receiptToken) return [input, init];
      const headers = new Headers(init?.headers);
      headers.set(receiptHeaderName, receiptToken);
      return [input, { ...init, headers }];
    }

    async function payChallenge(challengeResponse: Response): Promise<IssuedReceipt | null> {
      let body: unknown;
      try {
        body = await challengeResponse.clone().json();
      } catch {
        if (unpayable === "passthrough") return null;
        throw new X402UnpayableError("402 response body is not JSON", challengeResponse);
      }
      const challenge = parseX402Challenge(body);
      if (!challenge) {
        if (unpayable === "passthrough") return null;
        throw new X402UnpayableError(
          "402 body is not an x402-deropay-draft challenge",
          challengeResponse
        );
      }
      if (challenge.payment.protocol !== protocol) {
        if (unpayable === "passthrough") return null;
        throw new X402UnpayableError(
          `402 challenge uses protocol "${challenge.payment.protocol}", this payer honors "${protocol}"`,
          challengeResponse
        );
      }
      if (config.network && challenge.payment.network !== config.network) {
        if (unpayable === "passthrough") return null;
        throw new X402UnpayableError(
          `402 challenge is on ${challenge.payment.network}, this payer is pinned to ${config.network}`,
          challengeResponse
        );
      }
      return obtainReceipt(origin, challenge, resourceUrl, cacheKey);
    }

    const cached = reuseReceipts ? cachedReceiptFor(cacheKey) : null;
    let response = await baseFetch(...buildSend(cached?.token ?? null));

    if (cached && response.status === 409) {
      // A single-use server already burned this receipt: drop it and
      // re-request bare to obtain a fresh challenge.
      receiptCache.delete(cacheKey);
      response = await baseFetch(...buildSend(null));
    }
    if (response.status !== 402) return response;
    if (cached) receiptCache.delete(cacheKey);

    const issued = await payChallenge(response);
    if (issued === null) return response;

    let paidResponse = await baseFetch(...buildSend(issued.token));

    if (paidResponse.status === 409) {
      // Our receipt raced another caller on a single-use server (concurrent
      // calls share one payment). Pay once more via a fresh challenge.
      receiptCache.delete(cacheKey);
      const fresh = await baseFetch(...buildSend(null));
      if (fresh.status !== 402) return fresh;
      const reissued = await payChallenge(fresh);
      if (reissued === null) return fresh;
      paidResponse = await baseFetch(...buildSend(reissued.token));
    }

    if (paidResponse.status === 402) {
      // The receipt was minted by the merchant's own issue endpoint, so a
      // lingering 402 is a server-side mismatch, not settlement lag.
      receiptCache.delete(cacheKey);
      throw new X402PaymentRejectedError(
        `Server still returned 402 after invoice ${issued.claims.invoiceId} was paid and its receipt presented — refusing to pay again`,
        paidResponse,
        issued.claims.paymentTxid ?? "",
        issued.claims.invoiceId
      );
    }
    return paidResponse;
  };
}
