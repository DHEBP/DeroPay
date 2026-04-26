/**
 * Types for the DeroPay Gateway HTTP client.
 *
 * These types represent the JSON API surface of a running DeroPay gateway.
 * Platform adapters (Medusa, Shopify, etc.) and external integrations use
 * this client to create invoices, check status, and manage payments.
 */

/** Invoice as returned by the gateway API (JSON-serialized) */
export type GatewayInvoice = {
  id: string;
  name: string;
  description: string;
  status: "created" | "pending" | "confirming" | "completed" | "expired" | "partial";
  /** Amount in atomic units (string for JSON serialization) */
  amount: string;
  /** Amount received so far (string for JSON serialization) */
  amountReceived: string;
  /** The integrated address for payment */
  integratedAddress: string;
  /** Base wallet address */
  baseAddress: string;
  /** When the invoice was created (ISO 8601) */
  createdAt: string;
  /** When the invoice expires (ISO 8601) */
  expiresAt: string;
  /** When the invoice was completed (ISO 8601, null if pending) */
  completedAt: string | null;
  /** TTL in seconds */
  ttlSeconds: number;
  /** Required confirmations */
  requiredConfirmations: number;
  /** Payment transactions */
  payments: GatewayPayment[];
  /** Arbitrary merchant metadata */
  metadata: Record<string, unknown>;
  /** Escrow data if present */
  escrow: GatewayEscrow | null;
};

/** A payment transaction */
export type GatewayPayment = {
  txid: string;
  amount: string;
  height: number;
  topoHeight: number;
  confirmations: number;
  status: "detected" | "confirming" | "confirmed";
  detectedAt: string;
};

/** Escrow data */
export type GatewayEscrow = {
  scid: string;
  deployTxid: string;
  escrowStatus: string;
  sellerAddress: string;
  arbitratorAddress: string;
  feeBasisPoints: number;
  blockExpiration: number;
  buyerAddress: string | null;
  depositHeight: number | null;
  disputedAt: string | null;
  resolution: string | null;
};

/** Input for creating an invoice */
export type CreateInvoiceInput = {
  /** Amount in atomic units (for DERO-denominated invoices) */
  amount?: number | bigint;
  /** Fiat amount in smallest currency unit (e.g., cents for USD) */
  fiatAmount?: number;
  /** Currency code (e.g., "USD", "EUR"). If provided with fiatAmount, gateway converts to DERO */
  currency?: string;
  /** Human-readable invoice name */
  name?: string;
  /** Description */
  description?: string;
  /** TTL in seconds (default: 900) */
  ttlSeconds?: number;
  /** Required confirmations (default: 3) */
  requiredConfirmations?: number;
  /** Arbitrary metadata to attach */
  metadata?: Record<string, unknown>;
  /** Webhook URL for this specific invoice (overrides gateway default) */
  callbackUrl?: string;
  /** Escrow parameters */
  escrow?: {
    sellerAddress: string;
    arbitratorAddress?: string;
    feeBasisPoints?: number;
    blockExpiration?: number;
  };
};

/** Gateway client configuration */
export type GatewayClientConfig = {
  /** Base URL of the DeroPay gateway (e.g., "https://pay.example.com") */
  gatewayUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Custom fetch implementation (for testing or custom environments) */
  fetch?: typeof globalThis.fetch;
};

/** Gateway error response */
export type GatewayError = {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
};

/** Gateway health/info response */
export type GatewayInfo = {
  version: string;
  chainId: "dero-mainnet" | "dero-testnet";
  walletConnected: boolean;
  daemonConnected: boolean;
  blockHeight: number;
};
