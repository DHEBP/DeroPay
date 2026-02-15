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
} as const;

export type EscrowStatusCodeValue =
  (typeof EscrowStatusCode)[keyof typeof EscrowStatusCode];

/** Human-readable escrow status */
export type EscrowStatus =
  | "awaiting_deposit"
  | "funded"
  | "released"
  | "refunded"
  | "expired_claimed"
  | "disputed"
  | "arbitrated"
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
};

// ---------------------------------------------------------------------------
// Escrow configuration
// ---------------------------------------------------------------------------

/** Parameters to deploy a new escrow contract */
export type CreateEscrowParams = {
  /** Seller's DERO address */
  sellerAddress: string;
  /** Arbitrator's DERO address (can be same as owner for self-arbitration) */
  arbitratorAddress: string;
  /** Platform fee in basis points (100 = 1%, 250 = 2.5%) */
  feeBasisPoints: number;
  /** Blocks after deposit before seller can claim without buyer confirmation */
  blockExpiration: number;
  /** Optional: expected deposit amount for tracking purposes */
  expectedAmount?: bigint;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
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
  /** Buyer address (set after deposit) */
  buyerAddress: string | null;
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
  /** Escrow released to seller */
  escrowReleased: (escrow: EscrowRecord) => void;
  /** Escrow refunded to buyer */
  escrowRefunded: (escrow: EscrowRecord) => void;
  /** Dispute raised */
  escrowDisputed: (escrow: EscrowRecord) => void;
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
  /** Default block expiration (default: 60 blocks ~= 3 hours at ~3min/block) */
  defaultBlockExpiration?: number;
};
