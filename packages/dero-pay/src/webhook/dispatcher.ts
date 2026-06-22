/**
 * Webhook dispatcher for DeroPay payment notifications.
 *
 * Sends HMAC-signed HTTP POST requests to merchant webhook endpoints
 * with automatic retry and exponential backoff.
 *
 * Signature format (same pattern as Stripe/GitHub):
 *   X-DeroPay-Signature: sha256=<hex-hmac>
 *   X-DeroPay-Event: <event-type>
 *   X-DeroPay-Delivery: <event-id>
 */

import { createHmac, randomUUID } from "node:crypto";
import type { Invoice, Payment, WebhookEvent, WebhookEventType } from "../core/types.js";
import type { WebhookConfig, WebhookDelivery } from "./types.js";

/**
 * Create a webhook event payload.
 */
export function createWebhookEvent(
  type: WebhookEventType,
  invoice: Invoice,
  payment?: Payment
): WebhookEvent {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    invoice,
    payment,
  };
}

/**
 * Sign a webhook payload with HMAC-SHA256.
 *
 * @param payload - JSON string of the webhook event
 * @param secret - The webhook signing secret
 * @returns Hex-encoded HMAC signature
 */
export function signWebhookPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify a webhook signature.
 * Use this on the receiving end to validate webhook authenticity.
 *
 * @param payload - The raw request body string
 * @param signature - The X-DeroPay-Signature header value
 * @param secret - Your webhook signing secret
 * @returns Whether the signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = `sha256=${signWebhookPayload(payload, secret)}`;
  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expected.length) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Constant-time buffer comparison */
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * The single HTTP attempt of a webhook delivery, with NO retry/backoff/logging
 * state of its own. It works purely from strings — the already-serialized
 * payload and the already-computed signature — so the durable delivery worker
 * can replay a stored frozen payload and re-send byte-identical bytes (same
 * signature) across restarts. The `WebhookDispatcher` retry loop and the
 * outbox worker both compose this one function (invariant: HMAC/timeout logic
 * is defined once, not reinvented).
 */
export async function deliverOnce(args: {
  url: string;
  payload: string;
  signature: string;
  eventType: string;
  deliveryId: string;
  timeoutMs?: number;
}): Promise<{ statusCode: number; success: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 10_000);

  try {
    const response = await fetch(args.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DeroPay-Signature": args.signature,
        "X-DeroPay-Event": args.eventType,
        "X-DeroPay-Delivery": args.deliveryId,
        "User-Agent": "DeroPay-Webhook/1.0",
      },
      body: args.payload,
      signal: controller.signal,
    });

    const success = response.status >= 200 && response.status < 300;
    return {
      statusCode: response.status,
      success,
      error: success ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      statusCode: 0,
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Webhook dispatcher that delivers events to merchant endpoints.
 *
 * Usage:
 * ```ts
 * const dispatcher = new WebhookDispatcher({
 *   url: "https://mystore.com/webhooks/dero",
 *   secret: process.env.WEBHOOK_SECRET!,
 * });
 *
 * await dispatcher.dispatch(event);
 * ```
 */
export class WebhookDispatcher {
  private config: Required<WebhookConfig>;
  private deliveryLog: WebhookDelivery[] = [];

  constructor(config: WebhookConfig) {
    this.config = {
      url: config.url,
      secret: config.secret,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 5_000,
      timeoutMs: config.timeoutMs ?? 10_000,
    };
  }

  /**
   * Dispatch a webhook event with automatic retry.
   *
   * @returns Whether the delivery was ultimately successful
   */
  async dispatch(event: WebhookEvent): Promise<boolean> {
    const payload = JSON.stringify(event, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    );
    const signature = `sha256=${signWebhookPayload(payload, this.config.secret)}`;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const delivery = await this.attemptDelivery(
        event,
        payload,
        signature,
        attempt
      );
      this.deliveryLog.push(delivery);

      if (delivery.success) {
        return true;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < this.config.maxRetries) {
        const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return false;
  }

  /**
   * Create and dispatch a webhook event in one call.
   */
  async send(
    type: WebhookEventType,
    invoice: Invoice,
    payment?: Payment
  ): Promise<boolean> {
    const event = createWebhookEvent(type, invoice, payment);
    return this.dispatch(event);
  }

  /**
   * Get the delivery log.
   */
  getDeliveryLog(): WebhookDelivery[] {
    return [...this.deliveryLog];
  }

  /**
   * Clear the delivery log.
   */
  clearDeliveryLog(): void {
    this.deliveryLog = [];
  }

  private async attemptDelivery(
    event: WebhookEvent,
    payload: string,
    signature: string,
    attempt: number
  ): Promise<WebhookDelivery> {
    const result = await deliverOnce({
      url: this.config.url,
      payload,
      signature,
      eventType: event.type,
      deliveryId: event.id,
      timeoutMs: this.config.timeoutMs,
    });

    return {
      eventId: event.id,
      url: this.config.url,
      statusCode: result.statusCode,
      attempt,
      success: result.success,
      error: result.error,
      timestamp: new Date().toISOString(),
    };
  }
}
