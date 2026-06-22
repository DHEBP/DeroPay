/**
 * @module dero-pay/bridge
 *
 * The DeroPay Bridge: a long-lived, outbound-only host-side daemon that pushes
 * durable, at-least-once payment webhooks to a merchant. Composes InvoiceEngine
 * + a durable webhook outbox + a delivery worker, with zero inbound listeners.
 */

export { PayoutBridge } from "./payout-bridge.js";
export {
  loadConfig,
  isLoopbackUrl,
  type BridgeConfig,
  type LoadConfigResult,
} from "./config.js";
export {
  writeHeartbeat,
  readHeartbeat,
  evaluateHealth,
  type Heartbeat,
} from "./health.js";
export {
  assertNoInboundListeners,
  type NoListenerGuard,
} from "./no-listener.js";

// Re-export the durability primitives so consumers embedding the bridge in a
// custom host can reuse them.
export { WebhookOutbox, storeSupportsOutbox } from "../webhook/outbox.js";
export {
  WebhookDeliveryWorker,
  type DeadLetter,
  type WebhookDeliveryWorkerConfig,
} from "../webhook/delivery-worker.js";
export { OutboxWebhookSink } from "../webhook/outbox-sink.js";
export { deriveDeliveryId, deriveDiscriminator } from "../webhook/delivery-id.js";
export type {
  OutboxRecord,
  OutboxStatus,
  OutboxEvent,
  WebhookSink,
} from "../webhook/outbox-types.js";
