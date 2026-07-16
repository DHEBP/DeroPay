/**
 * Escrow types for DeroPay smart contract-based payments.
 *
 * These types model the lifecycle of a DERO escrow transaction
 * from deployment through resolution.
 */

// ---------------------------------------------------------------------------
// Escrow status — mirrors the smart contract's status codes
// ---------------------------------------------------------------------------

/** Status codes stored on-chain in the escrow smart contract */
export const EscrowStatusCode = {
  AWAITING_DEPOSIT: 0,
  FUNDED: 1,
  RELEASED: 2,
  REFUNDED: 3,
  EXPIRED_CLAIMED: 4,
  DISPUTED: 5,
  ARBITRATED: 6,
  CANCELLED: 7,
} as const;

export type EscrowStatusCodeValue =
  (typeof EscrowStatusCode)[keyof typeof EscrowStatusCode];

/** Human-readable escrow status */
export type EscrowStatus =
  | "quoted"
  | "awaiting_deposit"
  | "funded"
  | "released"
  | "refunded"
  | "expired_claimed"
  | "disputed"
  | "arbitrated"
  | "cancelled"
  | "deploying"
  | "deploy_failed";

/** Map on-chain status code to SDK status string */
export const statusCodeToString: Record<EscrowStatusCodeValue, EscrowStatus> = {
  [EscrowStatusCode.AWAITING_DEPOSIT]: "awaiting_deposit",
  [EscrowStatusCode.FUNDED]: "funded",
  [EscrowStatusCode.RELEASED]: "released",
  [EscrowStatusCode.REFUNDED]: "refunded",
  [EscrowStatusCode.EXPIRED_CLAIMED]: "expired_claimed",
  [EscrowStatusCode.DISPUTED]: "disputed",
  [EscrowStatusCode.ARBITRATED]: "arbitrated",
  [EscrowStatusCode.CANCELLED]: "cancelled",
};

// ---------------------------------------------------------------------------
// Escrow configuration
// ---------------------------------------------------------------------------

/** Parameters to QUOTE an escrow (phase 1 — no buyer, no on-chain deploy). */
export type CreateEscrowQuoteParams = {
  /** Seller's DERO address */
  sellerAddress: string;
  /** Arbitrator's DERO address. Must be set explicitly; self-arbitration
   *  (arbitrator == owner/fee-recipient) is rejected by the invoice engine
   *  unless the caller opts in via allowSelfArbitration. */
  arbitratorAddress: string;
  /** Platform fee in basis points (100 = 1%, 250 = 2.5%). Defaults if omitted. */
  feeBasisPoints?: number;
  /** Blocks after deposit before the seller can claim without buyer confirmation.
   *  Must be within [4000, 10000000] (~20 hours to ~5.7 years at ~18s/block);
   *  enforced on-chain and by the deploy() call. The 4000-block floor guarantees
   *  a human buyer a realistic dispute window before ClaimAfterExpiry unlocks.
   *  Defaults if omitted. */
  blockExpiration?: number;
  /** Required: the exact price (atomic units). On-chain Deposit() rejects any
   *  deposit below this — blocks dust locks and underpayment. */
  expectedAmount: bigint;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
};

/** Parameters to create + deploy an escrow in one call (merchant-known-buyer
 *  fast path). Adds the buyer address bound at deploy. */
export type CreateEscrowParams = CreateEscrowQuoteParams & {
  /** Buyer's DERO address — bound at deploy; only this address may Deposit().
   *  MUST be a wallet-connect / authenticated address, never unverified input. */
  buyerAddress: string;
};

/** The full escrow contract state as read from the blockchain */
export type EscrowOnChainState = {
  /** Smart Contract ID */
  scid: string;
  /** On-chain status code */
  statusCode: EscrowStatusCodeValue;
  /** Human-readable status */
  status: EscrowStatus;
  /** Owner (deployer) address */
  owner: string;
  /** Seller address */
  seller: string;
  /** Buyer address (set after deposit) */
  buyer: string | null;
  /** Arbitrator address */
  arbitrator: string;
  /** Platform fee in basis points */
  feeBasisPoints: number;
  /** Block expiration window */
  blockExpiration: number;
  /** Current escrow balance in atomic units */
  escrowBalance: number;
  /** Block height of the deposit (set after deposit) */
  depositHeight: number | null;
  /** Arbitration direction, written on-chain by Arbitrate() (1 = released to
   *  seller, 0 = refunded to buyer). Null until the dispute is arbitrated.
   *  Both arbitrate branches zero escrowBalance, so this flag — not the
   *  balance — is the authoritative source of the resolution direction. */
  arbitrateResult: number | null;
  /** DERO balance held by the SC */
  scBalance: number;
};

// ---------------------------------------------------------------------------
// Escrow record (SDK-level, stored locally)
// ---------------------------------------------------------------------------

/** Local escrow record with both on-chain and off-chain data */
export type EscrowRecord = {
  /** Unique local ID */
  id: string;
  /** Smart Contract ID (set after successful deployment) */
  scid: string | null;
  /** Deployment transaction ID */
  deployTxid: string | null;
  /** Current status (includes SDK-only states like deploying) */
  status: EscrowStatus;
  /** Seller address */
  sellerAddress: string;
  /** Arbitrator address */
  arbitratorAddress: string;
  /** Fee in basis points */
  feeBasisPoints: number;
  /** Block expiration window */
  blockExpiration: number;
  /** Expected deposit amount (atomic units) */
  expectedAmount: bigint | null;
  /** Actual deposit amount (atomic units) */
  depositAmount: bigint | null;
  /**
   * Proven buyer address (deto1/dero1 bech32) bound at claim time. This is the
   * authenticated, actionable address; it is NEVER overwritten from on-chain
   * state (the contract stores the RAW point, which GetSC returns as hex).
   */
  buyerAddress: string | null;
  /**
   * The RAW (ADDRESS_RAW hex) form of the buyer as stored on-chain, surfaced by
   * reconcile() on the funded transition for verification only. Compare against
   * ADDRESS_RAW(buyerAddress) to confirm the depositor matches the bound buyer;
   * do NOT use it as an actionable address. Null until funded.
   */
  onChainBuyerRaw?: string | null;
  /** When the escrow was created locally (ISO 8601) */
  createdAt: string;
  /** When the deposit was made (ISO 8601) */
  depositedAt: string | null;
  /** When the escrow was resolved (ISO 8601) */
  resolvedAt: string | null;
  /** Resolution type */
  resolution: EscrowResolution | null;
  /** Linked invoice ID (if created through the invoice engine) */
  invoiceId: string | null;
  /** Arbitrary metadata */
  metadata: Record<string, unknown>;
};

/** How the escrow was resolved */
export type EscrowResolution =
  | "buyer_confirmed"
  | "seller_refunded"
  | "owner_refunded"
  | "seller_claimed_expiry"
  | "arbitrator_released_seller"
  | "arbitrator_refunded_buyer";

// ---------------------------------------------------------------------------
// Escrow events
// ---------------------------------------------------------------------------

/** Events emitted by the EscrowManager */
export type EscrowManagerEvents = {
  /** Escrow deployed successfully */
  escrowDeployed: (escrow: EscrowRecord) => void;
  /** Escrow deployment failed */
  escrowDeployFailed: (escrow: EscrowRecord, error: Error) => void;
  /** Buyer deposited into escrow */
  escrowFunded: (escrow: EscrowRecord) => void;
  /**
   * O18 — an awaiting_deposit escrow flipped to on-chain status "funded" but the
   * funded amount FAILED independent verification: either escrowBalance !=
   * expectedAmount (amount_mismatch) or the contract's real DERO holdings do not
   * cover escrowBalance (custody_shortfall). The escrow is deliberately NOT
   * settled and stays in awaiting_deposit; the invoice must never be driven to
   * escrow_funded/shippable off this. Requires human/out-of-band handling.
   */
  escrowFundingMismatch: (
    escrow: EscrowRecord,
    detail: {
      expectedAmount: bigint | null;
      onChainBalance: bigint;
      scBalance: bigint;
      reason: "amount_mismatch" | "custody_shortfall";
    }
  ) => void;
  /** Escrow released to seller */
  escrowReleased: (escrow: EscrowRecord) => void;
  /** Escrow refunded to buyer */
  escrowRefunded: (escrow: EscrowRecord) => void;
  /** Dispute raised */
  escrowDisputed: (escrow: EscrowRecord) => void;
  /** Escrow was cancelled while never funded (status 0 -> 7). Lets the app
   *  re-quote a fresh contract onto a still-open invoice so a griefing
   *  CancelUnfunded that races a buyer's deposit does not strand the buyer. */
  escrowCancelled: (escrow: EscrowRecord) => void;
  /** Arbitrator resolved dispute */
  escrowArbitrated: (escrow: EscrowRecord) => void;
  /** Status changed (generic) */
  escrowStatusChanged: (escrow: EscrowRecord, previousStatus: EscrowStatus) => void;
  /** Error */
  error: (error: Error) => void;
};

// ---------------------------------------------------------------------------
// Escrow manager configuration
// ---------------------------------------------------------------------------

/** EscrowManager configuration */
export type EscrowManagerConfig = {
  /** Wallet RPC URL */
  walletRpcUrl?: string;
  /** Daemon RPC URL */
  daemonRpcUrl?: string;
  /** RPC auth */
  rpcAuth?: { username: string; password: string };
  /** Polling interval for escrow status checks (ms, default: 10000) */
  pollIntervalMs?: number;
  /** Default fee in basis points (default: 250 = 2.5%) */
  defaultFeeBasisPoints?: number;
  /** Default block expiration (default: 9600 blocks ~= 2 days at ~18s/block).
   *  Must be >= 4000 (the on-chain minimum dispute window). */
  defaultBlockExpiration?: number;
};
