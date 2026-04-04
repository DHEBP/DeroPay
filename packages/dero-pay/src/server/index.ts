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
