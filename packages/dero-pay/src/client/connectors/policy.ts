import { WalletConnectorError } from "./errors.js";
import type {
  SpendConfirmationRequest,
  WalletCapability,
  WalletConnector,
  WalletConnectorContext,
  WalletConnectorPolicy,
} from "./types.js";

export const defaultWalletConnectorPolicy: WalletConnectorPolicy = {
  allowSpendOperations: true,
  requireExplicitUserConfirm: true,
  allowWasmConnector: false,
  network: "mainnet",
};

export function mergeWalletConnectorPolicy(
  policy?: Partial<WalletConnectorPolicy>
): WalletConnectorPolicy {
  return {
    ...defaultWalletConnectorPolicy,
    ...policy,
  };
}

export function assertConnectorCapability(
  connector: WalletConnector,
  capability: WalletCapability
): void {
  if (!connector.supports(capability)) {
    throw new WalletConnectorError(
      "METHOD_NOT_SUPPORTED",
      `Wallet connector does not support ${capability}`,
      { connectorType: connector.type, capability }
    );
  }
}

export function assertSpendOperationsAllowed(
  policy: WalletConnectorPolicy,
  operation: "transfer" | "scInvoke",
  connectorType: string
): void {
  if (!policy.allowSpendOperations) {
    throw new WalletConnectorError(
      "SECURITY_POLICY_BLOCKED",
      `Wallet policy blocks ${operation} spend operations`,
      { connectorType, operation }
    );
  }
}

export async function confirmSpendOperation(
  ctx: WalletConnectorContext,
  request: SpendConfirmationRequest
): Promise<void> {
  if (!ctx.policy.requireExplicitUserConfirm) {
    return;
  }

  // XSWD and other native wallet connectors handle confirmation in the wallet UI
  if (ctx.nativeWalletConfirmation) {
    return;
  }

  // For non-native connectors, require an explicit confirmation callback
  if (ctx.confirmSpendOperation) {
    const accepted = await ctx.confirmSpendOperation(request);
    if (accepted) {
      return;
    }
    throw new WalletConnectorError(
      "PERMISSION_DENIED",
      "Wallet operation was not confirmed by the user",
      { connectorType: request.connectorType, operation: request.operation }
    );
  }

  // No confirmation mechanism available - fail securely
  throw new WalletConnectorError(
    "SECURITY_POLICY_BLOCKED",
    "Spend operations require a confirmSpendOperation callback when nativeWalletConfirmation is false",
    { connectorType: request.connectorType, operation: request.operation }
  );
}
