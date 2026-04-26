/**
 * @module dero-pay/gateway
 *
 * HTTP client for external platforms to interact with a DeroPay gateway.
 *
 * Use this module when building integrations with e-commerce platforms
 * (Medusa, Shopify, WooCommerce, etc.) or any external system that needs
 * to create invoices and check payment status via HTTP.
 *
 * @example
 * ```ts
 * import { GatewayClient } from "dero-pay/gateway";
 *
 * const client = new GatewayClient({
 *   gatewayUrl: process.env.DEROPAY_GATEWAY_URL!,
 *   apiKey: process.env.DEROPAY_API_KEY!,
 * });
 *
 * // Create an invoice
 * const invoice = await client.createInvoice({
 *   fiatAmount: 2999, // $29.99 in cents
 *   currency: "USD",
 *   name: "Pro Subscription",
 *   metadata: { customerId: "cust_123" },
 * });
 *
 * // Check status
 * const status = await client.getInvoice(invoice.id);
 * if (status.status === "completed") {
 *   // Payment confirmed!
 * }
 * ```
 */

export { GatewayClient, GatewayClientError } from "./client.js";

export type {
  GatewayClientConfig,
  GatewayInvoice,
  GatewayPayment,
  GatewayEscrow,
  GatewayInfo,
  GatewayError,
  CreateInvoiceInput,
} from "./types.js";
