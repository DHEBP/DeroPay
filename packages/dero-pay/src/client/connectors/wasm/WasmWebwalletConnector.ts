import {
  normalizeWalletConnectorError,
  WalletConnectorError,
} from "../errors.js";
import { mergeWalletConnectorPolicy } from "../policy.js";
import type {
  IntegratedAddressResult,
  WalletCapability,
  WalletConnector,
  WalletConnectorContext,
  WalletConnectorState,
} from "../types.js";
import {
  parseWasmBalance,
  probeWasmWebwalletBridge,
  requireWasmMethod,
  type WasmWebwalletBridge,
} from "./wasm-webwallet-mapper.js";

export type WasmWebwalletConnectorOptions = {
  bridge?: WasmWebwalletBridge;
};

const WASM_CAPABILITIES: WalletCapability[] = [
  "connect",
  "disconnect",
  "getAddress",
  "getBalance",
  "makeIntegratedAddress",
  "splitIntegratedAddress",
  "signData",
  "checkSignature",
];

export class WasmWebwalletConnector implements WalletConnector {
  readonly type = "wasm-webwallet";
  readonly version = "0-experimental";

  private bridge: WasmWebwalletBridge | null;
  private bridgeSource: string | undefined;
  private connected = false;
  private address: string | undefined;
  private context: WalletConnectorContext = {
    appName: "DeroPay",
    policy: mergeWalletConnectorPolicy(),
  };

  constructor(options?: WasmWebwalletConnectorOptions) {
    const probe = probeWasmWebwalletBridge(options?.bridge);
    this.bridge = probe?.bridge ?? null;
    this.bridgeSource = probe?.source;
  }

  static isAvailable(bridge?: WasmWebwalletBridge): boolean {
    try {
      return Boolean(probeWasmWebwalletBridge(bridge)?.bridge.getAddress);
    } catch {
      return false;
    }
  }

  getState(): WalletConnectorState {
    return {
      connected: this.connected,
      connectorType: this.type,
      address: this.address,
      network: this.context.policy.network,
      capabilities: this.bridge ? [...WASM_CAPABILITIES] : ["connect", "disconnect"],
    };
  }

  supports(capability: WalletCapability): boolean {
    if (capability === "transfer" || capability === "scInvoke") {
      return false;
    }
    return Boolean(this.bridge) && WASM_CAPABILITIES.includes(capability);
  }

  async connect(ctx: WalletConnectorContext): Promise<WalletConnectorState> {
    this.context = {
      ...ctx,
      policy: mergeWalletConnectorPolicy(ctx.policy),
    };

    if (!this.context.policy.allowWasmConnector) {
      throw new WalletConnectorError(
        "SECURITY_POLICY_BLOCKED",
        "WASM webwallet connector is disabled by policy",
        { connectorType: this.type }
      );
    }

    const probe = probeWasmWebwalletBridge(this.bridge ?? undefined);
    this.bridge = probe?.bridge ?? null;
    this.bridgeSource = probe?.source;
    if (!this.bridge) {
      throw new WalletConnectorError(
        "TRANSPORT_FAILURE",
        "WASM webwallet bridge is not available",
        { connectorType: this.type }
      );
    }

    try {
      this.address = await this.getAddress();
      this.connected = true;
      return this.getState();
    } catch (error) {
      throw normalizeWalletConnectorError(error, "TRANSPORT_FAILURE", {
        connectorType: this.type,
        bridgeSource: this.bridgeSource,
      });
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.address = undefined;
  }

  async getAddress(): Promise<string> {
    const bridge = this.requireBridge();
    const getAddress = requireWasmMethod(bridge, "getAddress");
    const address = await getAddress();
    this.address = address;
    return address;
  }

  async getBalance(scid?: string): Promise<{
    unlockedAtomic: bigint;
    totalAtomic: bigint;
  }> {
    const bridge = this.requireBridge();
    const getBalance = requireWasmMethod(bridge, "getBalance");
    const balance = await getBalance(scid);
    return {
      totalAtomic: parseWasmBalance(balance.balance),
      unlockedAtomic: parseWasmBalance(
        balance.unlocked_balance ?? balance.unlockedBalance
      ),
    };
  }

  async makeIntegratedAddress(args: {
    address?: string;
    payloadRpc?: unknown[];
  }): Promise<IntegratedAddressResult> {
    const bridge = this.requireBridge();
    const makeIntegratedAddress = requireWasmMethod(
      bridge,
      "makeIntegratedAddress"
    );
    return makeIntegratedAddress(args);
  }

  async splitIntegratedAddress(
    integratedAddress: string
  ): Promise<{ address: string; payloadRpc?: unknown[] }> {
    const bridge = this.requireBridge();
    const splitIntegratedAddress = requireWasmMethod(
      bridge,
      "splitIntegratedAddress"
    );
    return splitIntegratedAddress(integratedAddress);
  }

  async signData(data: string | Uint8Array): Promise<string> {
    const bridge = this.requireBridge();
    const signData = requireWasmMethod(bridge, "signData");
    return signData(data);
  }

  async checkSignature(
    signature: string
  ): Promise<{ signer: string; message: string }> {
    const bridge = this.requireBridge();
    const checkSignature = requireWasmMethod(bridge, "checkSignature");
    return checkSignature(signature);
  }

  private requireBridge(): WasmWebwalletBridge {
    if (!this.bridge) {
      throw new WalletConnectorError(
        "WALLET_NOT_CONNECTED",
        "WASM webwallet bridge is not connected",
        { connectorType: this.type }
      );
    }
    return this.bridge;
  }
}
