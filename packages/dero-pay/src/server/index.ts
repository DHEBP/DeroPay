/**
 * @module dero-pay/server
 *
 * Server-side DeroPay engine, storage, monitoring, and webhooks.
 */

// Invoice Engine (main orchestrator)
export {
  InvoiceEngine,
  type InvoiceEngineEvents,
  type X402AuditEvent,
  type X402AuditEventType,
} from "./invoice-engine.js";

// RPC clients
export {
  WalletRpcClient,
  type WalletRpcConfig,
} from "../rpc/wallet-rpc.js";

export {
  DaemonRpcClient,
  type DaemonRpcConfig,
} from "../rpc/daemon-rpc.js";

// Payment Monitor
export {
  PaymentMonitor,
  type PaymentMonitorEvents,
} from "../monitor/payment-monitor.js";

// Storage
export type {
  InvoiceStore,
  InvoiceFilter,
  InvoiceStats,
  PaymentLink,
  PaymentLinkStats,
  CreatePaymentLinkArgs,
} from "../store/types.js";

export { MemoryInvoiceStore } from "../store/memory.js";
export { SqliteInvoiceStore, type SqliteStoreConfig } from "../store/sqlite.js";

// Webhooks
export {
  WebhookDispatcher,
  createWebhookEvent,
  signWebhookPayload,
  verifyWebhookSignature,
} from "../webhook/dispatcher.js";

export type {
  WebhookConfig,
  WebhookDelivery,
} from "../webhook/types.js";

// Durable webhook outbox primitives (the DeroPay Bridge spine). The full
// daemon lives at the "dero-pay/bridge" subpath; these are re-exported for
// consumers embedding the durability layer in a custom host.
export { deliverOnce } from "../webhook/dispatcher.js";
export { WebhookOutbox, storeSupportsOutbox } from "../webhook/outbox.js";
export { WebhookDeliveryWorker } from "../webhook/delivery-worker.js";
export { OutboxWebhookSink } from "../webhook/outbox-sink.js";
export { deriveDeliveryId, deriveDiscriminator } from "../webhook/delivery-id.js";
export type {
  OutboxRecord,
  OutboxStatus,
  OutboxEvent,
  WebhookSink,
} from "../webhook/outbox-types.js";

// Payment receipts
export {
  createPaymentReceipt,
  verifyPaymentReceipt,
  issueReceiptFromInvoice,
  type ReceiptSecrets,
  type CreateReceiptOptions,
  type PaymentReceiptClaims,
  type VerifyReceiptOptions,
  type IssueReceiptOptions,
} from "./payment-receipts.js";

// Escrow (re-exported for convenience)
export {
  EscrowManager,
} from "../escrow/manager.js";

export {
  EscrowContract,
} from "../escrow/contract.js";

export type {
  EscrowRecord,
  EscrowStatus,
  EscrowOnChainState,
  CreateEscrowParams,
  EscrowManagerConfig,
  EscrowManagerEvents,
} from "../escrow/types.js";
