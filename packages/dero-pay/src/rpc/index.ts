/**
 * @module dero-pay/rpc
 *
 * DERO RPC clients for wallet and daemon communication.
 */

export {
  WalletRpcClient,
  type WalletRpcConfig,
} from "./wallet-rpc.js";

export {
  DaemonRpcClient,
  type DaemonRpcConfig,
} from "./daemon-rpc.js";

export type {
  JsonRpcRequest,
  JsonRpcResponse,
  GetBalanceParams,
  GetBalanceResult,
  GetAddressResult,
  GetHeightResult,
  GetTransfersParams,
  GetTransfersResult,
  TransferEntry,
  TransferParams,
  TransferResult,
  TransferDestination,
  PayloadRpcArg,
  MakeIntegratedAddressParams,
  MakeIntegratedAddressResult,
  SplitIntegratedAddressParams,
  SplitIntegratedAddressResult,
  GetTransferByTXIDParams,
  GetTransferByTXIDResult,
  GetInfoResult,
  GetTransactionParams,
  GetTransactionResult,
  TransactionInfo,
  // Smart Contract types
  ScRpcArg,
  InstallScParams,
  InvokeScParams,
  InvokeScResult,
  GetScParams,
  GetScResult,
  GasEstimateParams,
  GasEstimateResult,
} from "./types.js";
