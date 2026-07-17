/**
 * Shared types for the dero-pay library.
 */

/** Supported chain identifiers */
export type DeroChainId = "dero-mainnet" | "dero-testnet";

/** Invoice status state machine:
 *  created → pending → confirming → completed
 *                   ↘ expired
 *                   ↘ partial (underpaid, still waiting)
 */
export type InvoiceStatus =
  | "created"
  | "pending"
  | "confirming"
  | "completed"
  | "expired"
  | "partial"
  /**
   * Escrow invoice received a payment on its integrated address instead of via
   * the escrow contract's Deposit(). Those funds bypassed escrow protection and
   * landed in the merchant base wallet. This is an alert/reconciliation state —
   * NOT a settlement — and must never be treated as paid or shipped against.
   */
  | "misrouted_to_base"
  /**
   * Escrow contract funded via Deposit(). The invoice's economic settlement now
   * proceeds through the escrow lifecycle (confirm/expiry/arbitrate); this is a
   * non-terminal "paid into escrow" state that must not expire.
   */
  | "escrow_funded"
  /**
   * O19 — the escrow was funded then a dispute was raised on-chain (buyer called
   * Dispute()). Non-terminal: settlement is now blocked pending Arbitrate().
   * Distinct from escrow_funded so a dispute-in-flight is visible at the invoice
   * layer, and distinct from any unpaid state (real DERO is locked in escrow).
   */
  | "disputed"
  /**
   * O19 — TERMINAL: the buyer got their money back (RefundBuyer, or an arbitrator
   * ruled for the buyer). Funds moved on-chain to the buyer. This is a
   * chargeback-equivalent and MUST NOT be conflated with 'expired' (a never-paid
   * TTL timeout): merchant accounting/automation needs to tell "paid then
   * refunded" apart from "nobody ever paid".
   */
  | "refunded";

/** Wallet connection status for XSWD client-side usage */
export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** Payment status for individual transactions */
export type PaymentStatus =
  | "detected"
  | "confirming"
  | "confirmed";

/** A single detected payment (transaction) */
export type Payment = {
  /** Transaction ID on the DERO blockchain */
  txid: string;
  /** Amount in atomic units (1 DERO = 1_000_000_000_000) */
  amount: bigint;
  /** Block height where the transaction was included */
  height: number;
  /** Topological height */
  topoHeight: number;
  /** Current confirmation count */
  confirmations: number;
  /** Payment status */
  status: PaymentStatus;
  /** When this payment was first detected (ISO 8601) */
  detectedAt: string;
  /** Destination port (payment ID) */
  destinationPort: bigint;
};

/** Escrow data attached to an invoice */
export type InvoiceEscrow = {
  /** Local escrow-manager record id — the handle used to claim (deploy) a
   *  quoted escrow before it has an SCID. */
  escrowId: string | null;
  /** Smart Contract ID of the escrow contract. Null until the buyer is claimed
   *  and the contract deploys (open escrow invoices start in "quoted"). */
  scid: string | null;
  /** Deployment TXID. Null until deploy (see scid). */
  deployTxid: string | null;
  /** Escrow status (mirrors on-chain state) */
  escrowStatus: EscrowInvoiceStatus;
  /**
   * O14/O3 — the quote-time escrow principal, frozen at createEscrowQuote as a
   * decimal atomic-unit STRING (bigint is not JSON-serializable and the escrow
   * blob round-trips through JSON in both stores). This is the price the buyer
   * agreed to; it is the authoritative cross-check for the on-chain bind on ANY
   * worker. The claim path compares invoice.amount against THIS frozen value,
   * NOT against a value it just re-derived from invoice.amount (which would make
   * the drift guard a tautology on a rebuilding worker). Optional/absent on
   * pre-migration rows — treated as "no anchor recorded" and the guard falls
   * back to invoice.amount for those, preserving prior behavior.
   */
  escrowAmount?: string;
  /** Seller address */
  sellerAddress: string;
  /** Arbitrator address */
  arbitratorAddress: string;
  /** Platform fee in basis points */
  feeBasisPoints: number;
  /** Block expiration window */
  blockExpiration: number;
  /** Buyer address (set after deposit) */
  buyerAddress: string | null;
  /** Block height of deposit */
  depositHeight: number | null;
  /** When dispute was raised (ISO 8601) */
  disputedAt: string | null;
  /** How the escrow was resolved */
  resolution: string | null;
  /**
   * O21 — auto-requote budget counters. These live on the engine-controlled
   * escrow object (NOT invoice.metadata, which is caller-supplied at
   * createInvoice and thus attacker-reachable) so a merchant/API cannot zero the
   * counters to re-open the O9/O13 unbounded auto-requote gas amplifier. Reset to
   * 0 on a successful escrow funding and on a fresh legitimate buyer binding, so
   * a transient early grief no longer permanently exhausts a later honest buyer's
   * requote budget. Optional/absent on pre-migration rows (treated as 0).
   */
  requoteCount?: number;
  /** O21 — epoch-ms of the last auto-requote, for the cooldown gate. */
  lastRequoteAt?: number;
};

/** Escrow status within an invoice context */
export type EscrowInvoiceStatus =
  | "quoted"
  | "deploying"
  | "awaiting_deposit"
  | "funded"
  | "released"
  | "refunded"
  | "expired_claimed"
  | "disputed"
  | "arbitrated"
  | "cancelled"
  | "deploy_failed";

/** An invoice representing a payment request */
export type Invoice = {
  /** Unique invoice ID */
  id: string;
  /** Human-readable name/title */
  name: string;
  /** Description of what this invoice is for */
  description: string;
  /** Amount requested in atomic units */
  amount: bigint;
  /** Current invoice status */
  status: InvoiceStatus;
  /** Payment ID (uint64) embedded in the integrated address */
  paymentId: bigint;
  /** The integrated address for this invoice */
  integratedAddress: string;
  /** The base wallet address */
  baseAddress: string;
  /** Time-to-live in seconds */
  ttlSeconds: number;
  /** Required confirmation depth */
  requiredConfirmations: number;
  /** When the invoice was created (ISO 8601) */
  createdAt: string;
  /**
   * The daemon BLOCK height at creation time. Used as the wallet-scan floor
   * (GetTransfers min_height, which filters block height) so a restart can
   * re-anchor a not-yet-paid invoice at/below where it was created instead of
   * the live current height — no payment can predate creation, and on restart
   * the in-memory scan cursor is gone, so this persisted anchor is the only way
   * to avoid skipping a payment that landed during downtime. Optional: absent on
   * pre-migration rows and on invoices created off the bridge path.
   */
  createdBlockHeight?: number;
  /** When the invoice expires (ISO 8601) */
  expiresAt: string;
  /** When the invoice was paid/completed (ISO 8601, null if not yet) */
  completedAt: string | null;
  /** Total amount received so far in atomic units */
  amountReceived: bigint;
  /** Transactions associated with this invoice */
  payments: Payment[];
  /** Arbitrary metadata attached by the merchant */
  metadata: Record<string, unknown>;
  /** Escrow data (present only for escrow-backed invoices) */
  escrow: InvoiceEscrow | null;
};

/** Configuration for creating a new invoice */
export type CreateInvoiceParams = {
  /** Human-readable name/title */
  name: string;
  /** Description */
  description?: string;
  /** Amount in atomic units */
  amount: bigint;
  /** Time-to-live in seconds (default: 900 = 15 minutes) */
  ttlSeconds?: number;
  /** Required confirmations (default: 3) */
  requiredConfirmations?: number;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
  /** Escrow parameters (if provided, creates an escrow-backed invoice) */
  escrow?: CreateInvoiceEscrowParams;
};

/** Parameters for creating an escrow-backed invoice */
export type CreateInvoiceEscrowParams = {
  /** Seller address (required) */
  sellerAddress: string;
  /** Arbitrator address. Must be set explicitly. Self-arbitration
   *  (arbitrator == the platform owner/fee-recipient) is rejected unless
   *  allowSelfArbitration is true, to avoid the platform refereeing disputes
   *  it also profits from. */
  arbitratorAddress?: string;
  /** Opt in to arbitrator == platform owner (logged). Default false. */
  allowSelfArbitration?: boolean;
  /** Fee in basis points (default: from config or 250) */
  feeBasisPoints?: number;
  /** Block expiration in blocks (default: from config or 600 ~= 3h at ~18s/block).
   *  Must be within [200, 10000000]; enforced on-chain. */
  blockExpiration?: number;
};

/** Configuration for the DeroPay server */
export type DeroPayConfig = {
  /** Wallet RPC endpoint (default: http://127.0.0.1:10103/json_rpc) */
  walletRpcUrl?: string;
  /** Daemon RPC endpoint (default: http://127.0.0.1:10102/json_rpc) */
  daemonRpcUrl?: string;
  /** RPC authentication (username:password) */
  rpcAuth?: { username: string; password: string };
  /** Chain to operate on */
  chainId?: DeroChainId;
  /** Default TTL for invoices in seconds (default: 900) */
  defaultTtlSeconds?: number;
  /** Default required confirmations (default: 3) */
  defaultRequiredConfirmations?: number;
  /** Payment polling interval in ms (default: 5000) */
  pollIntervalMs?: number;
  /** Webhook URL for payment notifications */
  webhookUrl?: string;
  /** Webhook signing secret for HMAC */
  webhookSecret?: string;
  /** Maximum retry attempts for webhook delivery */
  webhookMaxRetries?: number;
};

/** Webhook event types */
export type WebhookEventType =
  | "invoice.created"
  | "invoice.pending"
  | "invoice.confirming"
  | "invoice.completed"
  | "invoice.expired"
  | "invoice.partial"
  | "invoice.misrouted_to_base"
  | "invoice.escrow_funded"
  | "invoice.disputed"
  | "invoice.refunded"
  | "payment.detected"
  | "payment.confirmed"
  | "escrow.deployed"
  | "escrow.funded"
  | "escrow.released"
  | "escrow.refunded"
  | "escrow.disputed"
  | "escrow.arbitrated"
  | "escrow.requoted"
  | "escrow.cancel_griefed"
  | "escrow.funding_mismatch";

/** Webhook event payload */
export type WebhookEvent = {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: WebhookEventType;
  /** When the event occurred (ISO 8601) */
  timestamp: string;
  /** The invoice associated with this event */
  invoice: Invoice;
  /** The payment that triggered the event (if applicable) */
  payment?: Payment;
};

/** DeroPay error codes */
export type DeroPayErrorCode =
  | "WALLET_UNREACHABLE"
  | "DAEMON_UNREACHABLE"
  | "INVALID_ADDRESS"
  | "INVALID_AMOUNT"
  | "INVOICE_NOT_FOUND"
  | "INVOICE_EXPIRED"
  | "INSUFFICIENT_PAYMENT"
  | "RPC_ERROR"
  | "WEBHOOK_DELIVERY_FAILED"
  | "STORE_ERROR"
  | "UNKNOWN";

/** DeroPay error */
export type DeroPayError = {
  code: DeroPayErrorCode;
  message: string;
};
