/**
 * HTTP client for external platforms to interact with a DeroPay gateway.
 *
 * This is the universal client that platform adapters (Medusa, Shopify, etc.)
 * use to create invoices, check status, and manage payments via HTTP.
 *
 * @example
 * ```ts
 * import { GatewayClient } from "dero-pay/gateway";
 *
 * const client = new GatewayClient({
 *   gatewayUrl: "https://pay.example.com",
 *   apiKey: "sk_live_...",
 * });
 *
 * const invoice = await client.createInvoice({
 *   amount: 5_000_000_000_000n, // 5 DERO
 *   name: "Order #123",
 * });
 *
 * console.log(invoice.integratedAddress);
 * ```
 */

import type {
  GatewayClientConfig,
  GatewayInvoice,
  GatewayInfo,
  GatewayError,
  CreateInvoiceInput,
} from "./types.js";

export class GatewayClientError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GatewayClientError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class GatewayClient {
  private readonly gatewayUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof globalThis.fetch;

  constructor(config: GatewayClientConfig) {
    this.gatewayUrl = config.gatewayUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Make an authenticated request to the gateway.
   */
  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetch(`${this.gatewayUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-DeroPay-ApiKey": this.apiKey,
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as GatewayError;
        throw new GatewayClientError(
          body.error || `HTTP ${response.status}`,
          body.code || "GATEWAY_ERROR",
          response.status,
          body.details
        );
      }

      return response.json() as Promise<T>;
    } catch (err) {
      if (err instanceof GatewayClientError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new GatewayClientError(
          `Request timed out after ${this.timeoutMs}ms`,
          "TIMEOUT",
          0
        );
      }
      throw new GatewayClientError(
        err instanceof Error ? err.message : "Unknown error",
        "NETWORK_ERROR",
        0
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Create a new invoice.
   *
   * @param input - Invoice creation parameters
   * @returns The created invoice
   */
  async createInvoice(input: CreateInvoiceInput): Promise<GatewayInvoice> {
    const body: Record<string, unknown> = {};

    if (input.amount !== undefined) {
      body.amount = typeof input.amount === "bigint"
        ? input.amount.toString()
        : input.amount;
    }
    if (input.fiatAmount !== undefined) body.fiatAmount = input.fiatAmount;
    if (input.currency !== undefined) body.currency = input.currency;
    if (input.name !== undefined) body.name = input.name;
    if (input.description !== undefined) body.description = input.description;
    if (input.ttlSeconds !== undefined) body.ttlSeconds = input.ttlSeconds;
    if (input.requiredConfirmations !== undefined) {
      body.requiredConfirmations = input.requiredConfirmations;
    }
    if (input.metadata !== undefined) body.metadata = input.metadata;
    if (input.callbackUrl !== undefined) body.callbackUrl = input.callbackUrl;
    if (input.escrow !== undefined) body.escrow = input.escrow;

    return this.request<GatewayInvoice>("/invoices", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Get the current status of an invoice.
   *
   * @param invoiceId - The invoice ID
   * @returns The invoice with current status
   */
  async getInvoice(invoiceId: string): Promise<GatewayInvoice> {
    return this.request<GatewayInvoice>(
      `/status?invoiceId=${encodeURIComponent(invoiceId)}`
    );
  }

  /**
   * Alias for getInvoice (backward compatibility).
   */
  async getStatus(invoiceId: string): Promise<GatewayInvoice> {
    return this.getInvoice(invoiceId);
  }

  /**
   * List invoices with optional filters.
   *
   * @param options - Filter options
   * @returns Array of invoices
   */
  async listInvoices(options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<GatewayInvoice[]> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.offset) params.set("offset", options.offset.toString());

    const query = params.toString();
    return this.request<GatewayInvoice[]>(
      `/invoices${query ? `?${query}` : ""}`
    );
  }

  /**
   * Get gateway health and info.
   *
   * @returns Gateway status information
   */
  async getInfo(): Promise<GatewayInfo> {
    return this.request<GatewayInfo>("/info");
  }

  /**
   * Check if the gateway is reachable and healthy.
   *
   * @returns true if healthy, false otherwise
   */
  async isHealthy(): Promise<boolean> {
    try {
      const info = await this.getInfo();
      return info.walletConnected && info.daemonConnected;
    } catch {
      return false;
    }
  }
}
