import { WalletConnectorError } from "./errors.js";
import { mergeWalletConnectorPolicy } from "./policy.js";
import type {
  WalletConnector,
  WalletConnectorPolicy,
  WalletConnectorType,
} from "./types.js";
import {
  XSWDConnector,
  type XSWDConnectorOptions,
} from "./xswd/XSWDConnector.js";
import {
  WasmWebwalletConnector,
  type WasmWebwalletConnectorOptions,
} from "./wasm/WasmWebwalletConnector.js";
import {
  probeWasmWebwalletBridge,
  type WasmWebwalletBridge,
} from "./wasm/wasm-webwallet-mapper.js";

export type ConnectorFactoryOptions = {
  preferred?: WalletConnectorType[];
  policy?: Partial<WalletConnectorPolicy>;
  xswd?: XSWDConnectorOptions;
  wasm?: WasmWebwalletConnectorOptions;
  custom?: WalletConnector;
};

export async function createWalletConnector(
  opts: ConnectorFactoryOptions = {}
): Promise<WalletConnector> {
  const policy = mergeWalletConnectorPolicy(opts.policy);
  const preferred = opts.preferred ?? (opts.custom ? ["custom"] : ["xswd"]);

  for (const connectorType of preferred) {
    if (connectorType === "custom") {
      if (opts.custom) {
        return opts.custom;
      }
      continue;
    }

    if (connectorType === "xswd") {
      return new XSWDConnector(opts.xswd);
    }

    if (connectorType === "wasm-webwallet") {
      if (!policy.allowWasmConnector) {
        throw new WalletConnectorError(
          "SECURITY_POLICY_BLOCKED",
          "WASM webwallet connector is disabled by policy",
          { connectorType }
        );
      }
      let probe;
      try {
        probe = probeWasmWebwalletBridge(opts.wasm?.bridge);
      } catch (error) {
        throw error instanceof WalletConnectorError
          ? error
          : new WalletConnectorError(
              "TRANSPORT_FAILURE",
              "WASM webwallet bridge probe failed",
              { connectorType }
            );
      }
      if (!probe) {
        throw new WalletConnectorError(
          "TRANSPORT_FAILURE",
          "WASM webwallet bridge is not available",
          { connectorType }
        );
      }
      return new WasmWebwalletConnector(opts.wasm);
    }
  }

  throw new WalletConnectorError(
    "TRANSPORT_FAILURE",
    "No wallet connector is available",
    { preferred }
  );
}

export function isWasmWebwalletAvailable(bridge?: WasmWebwalletBridge): boolean {
  try {
    return Boolean(probeWasmWebwalletBridge(bridge));
  } catch {
    return false;
  }
}
