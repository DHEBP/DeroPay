export type WalletConnectorType = "xswd" | "wasm-webwallet" | "custom";

export type WalletCapability =
  | "connect"
  | "disconnect"
  | "getAddress"
  | "getBalance"
  | "makeIntegratedAddress"
  | "splitIntegratedAddress"
  | "transfer"
  | "scInvoke"
  | "signData"
  | "checkSignature"
  | "getTransfers"
  | "queryKey";

export type WalletConnectorPolicy = {
  allowSpendOperations: boolean;
  requireExplicitUserConfirm: boolean;
  allowWasmConnector: boolean;
  network: "mainnet" | "testnet" | "simulator";
};

export type SpendOperationKind = "transfer" | "scInvoke";

export type SpendConfirmationTransfer = {
  destination: string;
  amountAtomic: bigint;
};

export type SpendConfirmationRequest = {
  operation: SpendOperationKind;
  connectorType: WalletConnectorType;
  /** For single transfers or scInvoke with deposit */
  amountAtomic?: bigint;
  /** For single transfers */
  destination?: string;
  /** For scInvoke */
  scid?: string;
  /** For multi-transfer batches - takes precedence over destination/amountAtomic */
  transfers?: SpendConfirmationTransfer[];
};

export type WalletConnectorContext = {
  appName: string;
  appVersion?: string;
  runId?: string;
  policy: WalletConnectorPolicy;
  nativeWalletConfirmation?: boolean;
  confirmSpendOperation?: (
    request: SpendConfirmationRequest
  ) => boolean | Promise<boolean>;
};

export type WalletConnectorState = {
  connected: boolean;
  connectorType: WalletConnectorType;
  address?: string;
  network?: string;
  capabilities: WalletCapability[];
};

export type TransferRequest = {
  destination: string;
  amountAtomic: bigint;
  payloadRpc?: unknown[];
  scid?: string;
  burnAtomic?: bigint;
};

export type TransferResult = {
  txid: string;
};

export type ScInvokeRequest = {
  scid: string;
  scRpc: unknown[];
  ringsize?: number;
  deroDepositAtomic?: bigint;
  tokenDepositAtomic?: bigint;
};

export type IntegratedAddressResult = {
  integratedAddress: string;
  payloadRpc?: unknown[];
};

export type WalletTransferFilter = {
  in?: boolean;
  out?: boolean;
  minHeight?: number;
  maxHeight?: number;
  destinationPort?: bigint;
  sourcePort?: bigint;
  sender?: string;
  receiver?: string;
};

export interface WalletConnector {
  readonly type: WalletConnectorType;
  readonly version: string;

  getState(): WalletConnectorState;
  supports(capability: WalletCapability): boolean;

  connect(ctx: WalletConnectorContext): Promise<WalletConnectorState>;
  disconnect(): Promise<void>;

  getAddress(): Promise<string>;
  getBalance?(scid?: string): Promise<{
    unlockedAtomic: bigint;
    totalAtomic: bigint;
  }>;

  makeIntegratedAddress?(args: {
    address?: string;
    payloadRpc?: unknown[];
  }): Promise<IntegratedAddressResult>;
  splitIntegratedAddress?(
    integratedAddress: string
  ): Promise<{ address: string; payloadRpc?: unknown[] }>;

  transfer?(request: {
    transfers: TransferRequest[];
    ringsize?: number;
    feesAtomic?: bigint;
  }): Promise<TransferResult>;
  scInvoke?(request: ScInvokeRequest): Promise<TransferResult>;

  getTransfers?(filter: WalletTransferFilter): Promise<unknown[]>;

  signData?(data: string | Uint8Array): Promise<string>;
  checkSignature?(signature: string): Promise<{ signer: string; message: string }>;
  queryKey?(keyType: "mnemonic" | "view_key" | "spend_key"): Promise<string>;
}
