/**
 * DERO JSON-RPC request/response types.
 *
 * These match the DERO daemon and wallet RPC interfaces
 * for the current DERO HE/Stargate release.
 */

// ---------------------------------------------------------------------------
// JSON-RPC base types
// ---------------------------------------------------------------------------

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse<T = unknown> = {
  jsonrpc: "2.0";
  id: string;
  result?: T;
  error?: { code: number; message: string };
};

// ---------------------------------------------------------------------------
// Wallet RPC types
// ---------------------------------------------------------------------------

/** GetBalance request params */
export type GetBalanceParams = {
  /** SCID (Smart Contract ID). Empty/zero hash = native DERO */
  scid?: string;
};

/** GetBalance response */
export type GetBalanceResult = {
  balance: number;
  unlocked_balance: number;
};

/** GetAddress response */
export type GetAddressResult = {
  address: string;
};

/** GetHeight response */
export type GetHeightResult = {
  height: number;
};

/** Transfer destination */
export type TransferDestination = {
  /** Destination address (can be integrated address) */
  destination: string;
  /** Amount in atomic units */
  amount: number;
  /** Optional: burn amount */
  burn?: number;
};

/** Payload RPC argument (for integrated addresses) */
export type PayloadRpcArg = {
  /** Parameter name: "D" for destination port, "S" for source port, "C" for comment */
  name: string;
  /** Data type: "U" for uint64, "S" for string, "H" for hash */
  datatype: string;
  /** The value */
  value: unknown;
};

/** MakeIntegratedAddress request params */
export type MakeIntegratedAddressParams = {
  /** Base wallet address (optional, uses own address if empty) */
  address?: string;
  /** Payload RPC arguments to embed */
  payload_rpc?: PayloadRpcArg[];
};

/** MakeIntegratedAddress response */
export type MakeIntegratedAddressResult = {
  integrated_address: string;
  payload_rpc: PayloadRpcArg[];
};

/** SplitIntegratedAddress request params */
export type SplitIntegratedAddressParams = {
  integrated_address: string;
};

/** SplitIntegratedAddress response */
export type SplitIntegratedAddressResult = {
  address: string;
  payload_rpc: PayloadRpcArg[];
};

/** GetTransfers request params */
export type GetTransfersParams = {
  /** Include incoming transfers */
  in?: boolean;
  /** Include outgoing transfers */
  out?: boolean;
  /** Include coinbase/mining rewards */
  coinbase?: boolean;
  /** Filter by minimum height */
  min_height?: number;
  /** Filter by maximum height */
  max_height?: number;
  /** Filter by sender address */
  sender?: string;
  /** Filter by receiver address */
  receiver?: string;
  /** Filter by destination port (payment ID) */
  dstport?: number;
  /** Filter by source port */
  srcport?: number;
  /** Filter by SCID */
  scid?: string;
};

/** A single transfer entry from the wallet */
export type TransferEntry = {
  /** Block height */
  height: number;
  /** Topological height */
  topoheight: number;
  /** Block hash */
  blockhash: string;
  /** Transaction ID */
  txid: string;
  /** Amount in atomic units */
  amount: number;
  /** Burn amount */
  burn?: number;
  /** Fees paid */
  fees: number;
  /** Destination address */
  destination: string;
  /** Whether this is an incoming transaction */
  incoming: boolean;
  /** Whether this is a coinbase transaction */
  coinbase: boolean;
  /** Decoded payload */
  payload_rpc: PayloadRpcArg[];
  /** Destination port (payment ID) */
  destination_port: number;
  /** Source port */
  source_port: number;
  /** Sender address */
  sender: string;
  /** Transaction time */
  time: string;
  /** EWData (encrypted data) */
  ewdata?: string;
};

/** GetTransfers response */
export type GetTransfersResult = {
  entries?: TransferEntry[];
};

/** Transfer request params */
export type TransferParams = {
  /** Transfer destinations */
  transfers?: TransferDestination[];
  /** Smart contract RPC arguments */
  sc_rpc?: PayloadRpcArg[];
  /** SCID for token transfers */
  scid?: string;
  /** Ring size (2, 4, 8, 16, 32, 64, 128, 512) */
  ringsize?: number;
  /** Fees (0 = automatic) */
  fees?: number;
};

/** Transfer response */
export type TransferResult = {
  txid: string;
};

/** GetTransferByTXID request params */
export type GetTransferByTXIDParams = {
  txid: string;
};

/** GetTransferByTXID response */
export type GetTransferByTXIDResult = {
  entry: TransferEntry;
};

// ---------------------------------------------------------------------------
// Daemon RPC types
// ---------------------------------------------------------------------------

/** GetInfo response */
export type GetInfoResult = {
  alt_blocks_count: number;
  difficulty: number;
  grey_peerlist_size: number;
  height: number;
  stableheight: number;
  topoheight: number;
  averageblocktime50: number;
  incoming_connections_count: number;
  outgoing_connections_count: number;
  target: number;
  target_height: number;
  testnet: boolean;
  top_block_hash: string;
  tx_count: number;
  tx_pool_size: number;
  dynamic_fee_per_kb: number;
  total_supply: number;
  median_block_size: number;
  white_peerlist_size: number;
  version: string;
  status: string;
};

/** GetBlock request params */
export type GetBlockParams = {
  hash?: string;
  height?: number;
};

/** GetTransaction request params */
export type GetTransactionParams = {
  txs_hashes: string[];
};

/** Transaction info from daemon */
export type TransactionInfo = {
  as_hex: string;
  block_height: number;
  reward: number;
  ignored: boolean;
  in_pool: boolean;
  output_indices: number[];
  tx_hash: string;
  valid_block: string;
  invalid_block: string[];
};

/** GetTransaction response */
export type GetTransactionResult = {
  txs_as_hex: string[];
  txs: TransactionInfo[];
  status: string;
};

/** GetEncryptedBalance request params */
export type GetEncryptedBalanceParams = {
  address: string;
  scid?: string;
  topoheight?: number;
};

/** GetEncryptedBalance response */
export type GetEncryptedBalanceResult = {
  scid: string;
  data: string;
  registration: number;
  bits: number;
  height: number;
  topoheight: number;
  blockhash: string;
  treehash: string;
  dheight: number;
  dtopoheight: number;
  status: string;
};

// ---------------------------------------------------------------------------
// Smart Contract RPC types
// ---------------------------------------------------------------------------

/** SC RPC argument used in SC_RPC arrays */
export type ScRpcArg = {
  /** Parameter name (e.g. "entrypoint", "SC_ACTION", "SC_CODE", or user-defined) */
  name: string;
  /** Data type: "S" = string, "U" = uint64, "H" = hash */
  datatype: "S" | "U" | "H";
  /** The value */
  value: unknown;
};

/** Wallet: install SC via the `transfer` method */
export type InstallScParams = {
  /** Smart contract code (can be base64 encoded) */
  sc: string;
  /** SC RPC arguments for Initialize() parameters */
  sc_rpc?: ScRpcArg[];
  /** Ring size (default: 2) */
  ringsize?: number;
  /** Fees (0 = automatic) */
  fees?: number;
};

/** Wallet: invoke SC via the `scinvoke` method */
export type InvokeScParams = {
  /** Smart Contract ID (TXID of deployment) */
  scid: string;
  /** SC RPC arguments — must include {name:"entrypoint", datatype:"S", value:"FunctionName"} */
  sc_rpc: ScRpcArg[];
  /** DERO deposit amount in atomic units (sent to the SC) */
  sc_dero_deposit?: number;
  /** Token deposit amount in atomic units */
  sc_token_deposit?: number;
  /** Ring size (default: 2) */
  ringsize?: number;
};

/** Wallet: scinvoke response */
export type InvokeScResult = {
  txid: string;
};

/** Daemon: getsc request params */
export type GetScParams = {
  /** Smart Contract ID */
  scid: string;
  /** Return SC source code */
  code?: boolean;
  /** Return all SC storage variables */
  variables?: boolean;
  /** Query at a specific topological height (-1 or omit = latest) */
  topoheight?: number;
  /** Specific uint64 keys to query */
  keysuint64?: number[];
  /** Specific string keys to query */
  keysstring?: string[];
  /** Specific byte keys to query */
  keysbytes?: Uint8Array[];
};

/** Daemon: getsc response */
export type GetScResult = {
  /** Values for requested uint64 keys */
  valuesuint64?: string[];
  /** Values for requested string keys */
  valuesstring?: string[];
  /** Values for requested byte keys */
  valuesbytes?: string[];
  /** All string-keyed SC variables (when variables=true) */
  stringkeys?: Record<string, unknown>;
  /** All uint64-keyed SC variables (when variables=true) */
  uint64keys?: Record<number, unknown>;
  /** Token balances held by the SC */
  balances?: Record<string, number>;
  /** SC DERO balance */
  balance: number;
  /** SC source code (when code=true) */
  code: string;
  /** Status */
  status: string;
};

/** Daemon: gas estimate request params (same structure as transfer) */
export type GasEstimateParams = {
  /** SC code for install estimation */
  sc?: string;
  /** SCID for invoke estimation */
  scid?: string;
  /** SC RPC arguments */
  sc_rpc?: ScRpcArg[];
  /** Transfers for the TX */
  transfers?: TransferDestination[];
  /** Ring size */
  ringsize?: number;
  /** Signer address (required for estimation) */
  signer?: string;
};

/** Daemon: gas estimate response */
export type GasEstimateResult = {
  /** Compute gas units consumed */
  gascompute: number;
  /** Storage gas units consumed */
  gasstorage: number;
  /** Status */
  status: string;
};
