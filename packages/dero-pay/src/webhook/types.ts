/**
 * Webhook types for DeroPay payment notifications.
 */

export type { WebhookEventType, WebhookEvent } from "../core/types.js";

/** Webhook delivery attempt */
export type WebhookDelivery = {
  /** Event ID */
  eventId: string;
  /** Target URL */
  url: string;
  /** HTTP status code (0 if connection failed) */
  statusCode: number;
  /** Attempt number (1-based) */
  attempt: number;
  /** Whether delivery was successful (2xx response) */
  success: boolean;
  /** Error message if delivery failed */
  error?: string;
  /** When the attempt was made */
  timestamp: string;
};

/** Webhook configuration */
export type WebhookConfig = {
  /** Target URL for webhook POST requests */
  url: string;
  /** HMAC-SHA256 signing secret */
  secret: string;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Retry delay in ms (default: 5000, doubles each retry) */
  retryDelayMs?: number;
  /** Request timeout in ms (default: 10000) */
  timeoutMs?: number;
};
