/**
 * @module dero-pay/agent
 *
 * The agent side of DeroPay's x402 receipt rail: an autonomous
 * auto-payer (createPayingFetch), spending policy and attenuable
 * spending credentials, wallet payers, and per-call payment gating for
 * MCP tools. Pays the invoices minted by createX402RouteGuard /
 * createPaymentHandlers — no extra contract, no facilitator.
 */

export {
  SpendPolicy,
  SpendPolicyError,
  type SpendPolicyConfig,
  type SpendDenialCode,
  type SpendReservation,
  type SpendContext,
  type SpendGuard,
} from "./policy.js";

export {
  mintSpendCredential,
  attenuate,
  verifyCredentialSignature,
  CredentialPolicy,
  CredentialError,
  type SpendCaveat,
  type SpendCredential,
  type CredentialDenialCode,
} from "./credentials.js";

export {
  parseX402Challenge,
  parseInvoiceStatusResponse,
  type X402Challenge,
  type InvoiceStatusSnapshot,
} from "./challenge.js";

export { type InvoicePayment, type InvoicePayer } from "./payer.js";

export {
  createWalletRpcPayer,
  isLoopbackUrl,
  type WalletRpcPayerConfig,
} from "./payers/wallet-rpc.js";

export { createXswdPayer } from "./payers/xswd.js";

export {
  createPayingFetch,
  X402PaymentRejectedError,
  X402UnpayableError,
  X402SettlementTimeoutError,
  type PayingFetchConfig,
  type PaymentEvidence,
} from "./paying-fetch.js";

export {
  createPaidToolGuard,
  createPayingToolCaller,
  parsePaidToolChallenge,
  X402ToolPaymentRejectedError,
  X402_PAYMENT_ARG,
  X402_MCP_ERROR,
  type McpToolResult,
  type ToolHandler,
  type PaidToolPricing,
  type PaidToolGuardConfig,
  type CallTool,
  type PayingToolCallerConfig,
} from "./mcp.js";
