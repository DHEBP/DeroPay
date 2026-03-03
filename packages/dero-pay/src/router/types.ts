/**
 * Payment router types for DeroPay smart contract-based instant payments.
 *
 * The payment router is a reusable per-merchant contract that splits
 * payments instantly on-chain. Unlike the escrow contract (one per
 * transaction, multi-step), the router handles unlimited payments
 * through a single deployed contract.
 */

// ---------------------------------------------------------------------------
// On-chain state
// ---------------------------------------------------------------------------

/** The payment router contract state as read from the blockchain */
export type RouterOnChainState = {
  /** Smart Contract ID */
  scid: string;
  /** Merchant address (deployer, receives payouts) */
  merchant: string;
  /** Fee recipient address */
  feeRecipient: string;
  /** Fee rate in basis points (100 = 1%) */
  feeBasisPoints: number;
  /** Total DERO processed in atomic units */
  totalProcessed: bigint;
  /** Total fees collected in atomic units */
  totalFees: bigint;
  /** Number of payments processed */
  paymentCount: number;
  /** Whether the router is paused (merchant can pause/resume) */
  paused: boolean;
  /** DERO balance held by the SC (should always be 0 for a healthy router) */
  scBalance: number;
};

// ---------------------------------------------------------------------------
// Deployment params
// ---------------------------------------------------------------------------

/** Parameters to deploy a new payment router contract */
export type DeployRouterParams = {
  /** Address that receives the fee split. Ignored if feeBasisPoints is 0. */
  feeRecipientAddress?: string;
  /** Fee in basis points (100 = 1%, 250 = 2.5%, 0 = no fee). Default: 0 */
  feeBasisPoints?: number;
};

// ---------------------------------------------------------------------------
// Local record (SDK-level)
// ---------------------------------------------------------------------------

/** Local payment router record with both on-chain and off-chain data */
export type RouterRecord = {
  /** Unique local ID */
  id: string;
  /** Smart Contract ID (set after successful deployment) */
  scid: string | null;
  /** Deployment transaction ID */
  deployTxid: string | null;
  /** Current status */
  status: RouterStatus;
  /** Fee recipient address */
  feeRecipientAddress: string;
  /** Fee in basis points */
  feeBasisPoints: number;
  /** When the router was created locally (ISO 8601) */
  createdAt: string;
  /** Arbitrary metadata */
  metadata: Record<string, unknown>;
};

/** Router lifecycle status */
export type RouterStatus = "deploying" | "active" | "deploy_failed";

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Events emitted by the RouterManager */
export type RouterManagerEvents = {
  /** Router deployed successfully */
  routerDeployed: (router: RouterRecord) => void;
  /** Router deployment failed */
  routerDeployFailed: (router: RouterRecord, error: Error) => void;
  /** Payment processed through a router */
  paymentProcessed: (scid: string, invoiceId: string, txid: string) => void;
  /** Error */
  error: (error: Error) => void;
};

// ---------------------------------------------------------------------------
// Manager configuration
// ---------------------------------------------------------------------------

/** RouterManager configuration */
export type RouterManagerConfig = {
  /** Wallet RPC URL */
  walletRpcUrl?: string;
  /** Daemon RPC URL */
  daemonRpcUrl?: string;
  /** RPC auth */
  rpcAuth?: { username: string; password: string };
};
