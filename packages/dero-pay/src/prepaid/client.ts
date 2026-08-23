import { randomUUID } from "node:crypto";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type PrepaidClientConfig = {
  baseUrl: string;
  walletAddress: string;
  getAuthToken: () => string | Promise<string>;
  payingFetch?: FetchLike;
  fetch?: FetchLike;
  createIdempotencyKey?: () => string;
};

/**
 * Generates a fresh idempotency key for a single logical topUp() attempt.
 * Call this ONCE before a retry loop and pass the same key to every retry
 * of that attempt — never call it again for a retry of the same top-up.
 */
export function createTopUpIdempotencyKey(): string {
  return randomUUID();
}

export class PrepaidClientResponseError extends Error {
  constructor(readonly response: Response, message: string) {
    super(message);
    this.name = "PrepaidClientResponseError";
  }
}

export function createPrepaidClient(config: PrepaidClientConfig) {
  const baseUrl = new URL(config.baseUrl);
  const plainFetch = config.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const payingFetch = config.payingFetch ?? plainFetch;
  const createKey = config.createIdempotencyKey ?? randomUUID;

  function target(path: string): string {
    const url = new URL(path, baseUrl);
    if (url.origin !== baseUrl.origin) {
      throw new Error("Refusing to send DeroAuth credentials to another origin");
    }
    return url.toString();
  }

  async function authorizedInit(init: RequestInit = {}): Promise<RequestInit> {
    const token = (await config.getAuthToken()).trim();
    if (!token) throw new Error("DeroAuth session token is empty");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const method = (init.method ?? "GET").toUpperCase();
    if (!headers.has("Idempotency-Key") && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers.set("Idempotency-Key", createKey());
    }
    return { ...init, headers };
  }

  async function expectOk(response: Response): Promise<Response> {
    if (!response.ok) {
      throw new PrepaidClientResponseError(
        response,
        `DeroPay prepaid API returned HTTP ${response.status}`,
      );
    }
    return response;
  }

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    return plainFetch(target(path), await authorizedInit(init));
  }

  /**
   * Tops up the prepaid balance by amountAtomic.
   *
   * idempotencyKey is required: generate it ONCE per logical top-up attempt
   * (e.g. via createTopUpIdempotencyKey()) and reuse the SAME key across every
   * retry of that same attempt. Never generate a new key for a retry — doing
   * so defeats idempotency and can double-credit the wallet if an earlier
   * attempt actually landed server-side before the retry.
   */
  async function topUp(amountAtomic: bigint, idempotencyKey: string) {
    if (amountAtomic <= 0n) throw new Error("amountAtomic must be greater than zero");
    const init = await authorizedInit({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ amountAtomic: amountAtomic.toString() }),
    });
    const response = await expectOk(await payingFetch(target("/api/v1/x402/top-up"), init));
    return response.json();
  }

  async function getBalance() {
    const response = await expectOk(
      await request(`/api/v1/x402/balance/${encodeURIComponent(config.walletAddress)}`),
    );
    return response.json();
  }

  async function getTransactions(options: { limit?: number; offset?: number } = {}) {
    const query = new URLSearchParams({
      limit: String(options.limit ?? 50),
      offset: String(options.offset ?? 0),
    });
    const response = await expectOk(
      await request(
        `/api/v1/x402/transactions/${encodeURIComponent(config.walletAddress)}?${query}`,
      ),
    );
    return response.json();
  }

  return { request, topUp, getBalance, getTransactions };
}
