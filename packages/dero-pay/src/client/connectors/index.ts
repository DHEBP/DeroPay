export {
  WalletConnectorError,
  isWalletConnectorError,
  mapRawWalletErrorCode,
  normalizeWalletConnectorError,
  type RawWalletError,
  type WalletErrorCode,
} from "./errors.js";

export {
  assertConnectorCapability,
  assertSpendOperationsAllowed,
  confirmSpendOperation,
  defaultWalletConnectorPolicy,
  mergeWalletConnectorPolicy,
} from "./policy.js";

export {
  createWalletConnector,
  isWasmWebwalletAvailable,
  type ConnectorFactoryOptions,
} from "./factory.js";

export {
  XSWDConnector,
  type XSWDAppData,
  type XSWDConnectorEvents,
  type XSWDConnectorOptions,
} from "./xswd/XSWDConnector.js";

export {
  WasmWebwalletConnector,
  type WasmWebwalletConnectorOptions,
} from "./wasm/WasmWebwalletConnector.js";

export {
  probeWasmWebwalletBridge,
  resolveWasmWebwalletBridge,
} from "./wasm/wasm-webwallet-mapper.js";
export type { WasmWebwalletBridge } from "./wasm/wasm-webwallet-mapper.js";

export type {
  IntegratedAddressResult,
  ScInvokeRequest,
  SpendConfirmationRequest,
  SpendConfirmationTransfer,
  SpendOperationKind,
  TransferRequest,
  TransferResult,
  WalletCapability,
  WalletConnector,
  WalletConnectorContext,
  WalletConnectorPolicy,
  WalletConnectorState,
  WalletConnectorType,
  WalletTransferFilter,
} from "./types.js";
