import { WalletConnectorError } from "../errors.js";

export type WasmWebwalletBridge = {
  getAddress?: () => string | Promise<string>;
  getBalance?: (scid?: string) =>
    | {
        balance?: number | string | bigint;
        unlocked_balance?: number | string | bigint;
        unlockedBalance?: number | string | bigint;
      }
    | Promise<{
        balance?: number | string | bigint;
        unlocked_balance?: number | string | bigint;
        unlockedBalance?: number | string | bigint;
      }>;
  makeIntegratedAddress?: (args: {
    address?: string;
    payloadRpc?: unknown[];
  }) =>
    | { integratedAddress: string; payloadRpc?: unknown[] }
    | Promise<{ integratedAddress: string; payloadRpc?: unknown[] }>;
  splitIntegratedAddress?: (integratedAddress: string) =>
    | { address: string; payloadRpc?: unknown[] }
    | Promise<{ address: string; payloadRpc?: unknown[] }>;
  signData?: (data: string | Uint8Array) => string | Promise<string>;
  checkSignature?: (
    signature: string
  ) => { signer: string; message: string } | Promise<{ signer: string; message: string }>;
};

type WasmMethodKey = keyof WasmWebwalletBridge;
type WasmBridgeSource =
  | "explicit"
  | "DERO_JS_WEBWALLET"
  | "DERO_JS_WALLET"
  | "DERO_JS"
  | "DERO_JS_GLOBALS";

type WasmBridgeProbe = {
  bridge: WasmWebwalletBridge;
  source: WasmBridgeSource;
  availableMethods: WasmMethodKey[];
};

const METHOD_ALIASES: Record<WasmMethodKey, string[]> = {
  getAddress: ["getAddress", "GetAddress"],
  getBalance: ["getBalance", "GetBalance"],
  makeIntegratedAddress: ["makeIntegratedAddress", "MakeIntegratedAddress"],
  splitIntegratedAddress: ["splitIntegratedAddress", "SplitIntegratedAddress"],
  signData: ["signData", "SignData"],
  checkSignature: ["checkSignature", "CheckSignature"],
};

const GLOBAL_SYMBOLS = {
  getAddress: "DERO_JS_GetAddress",
  getBalance: "DERO_JS_GetBalance",
  makeIntegratedAddress: "DERO_JS_MakeIntegratedAddress",
  splitIntegratedAddress: "DERO_JS_SplitIntegratedAddress",
  signData: "DERO_JS_SignData",
  checkSignature: "DERO_JS_CheckSignature",
} as const satisfies Record<WasmMethodKey, string>;

const REQUIRED_METHODS: WasmMethodKey[] = ["getAddress"];

export function resolveWasmWebwalletBridge(
  explicitBridge?: WasmWebwalletBridge
): WasmWebwalletBridge | null {
  const probe = probeWasmWebwalletBridge(explicitBridge);
  return probe?.bridge ?? null;
}

export function probeWasmWebwalletBridge(
  explicitBridge?: WasmWebwalletBridge
): WasmBridgeProbe | null {
  if (explicitBridge) {
    return normalizeObjectBridge(explicitBridge, "explicit");
  }

  const maybeWindow = globalThis as typeof globalThis & {
    DERO_JS?: unknown;
    DERO_JS_WEBWALLET?: unknown;
    DERO_JS_WALLET?: unknown;
    [key: string]: unknown;
  };

  const objectCandidates: Array<{ value: unknown; source: WasmBridgeSource }> = [
    { value: maybeWindow.DERO_JS_WEBWALLET, source: "DERO_JS_WEBWALLET" },
    { value: maybeWindow.DERO_JS_WALLET, source: "DERO_JS_WALLET" },
    { value: maybeWindow.DERO_JS, source: "DERO_JS" },
  ];

  for (const candidate of objectCandidates) {
    if (candidate.value !== undefined) {
      return normalizeObjectBridge(candidate.value, candidate.source);
    }
  }

  const globalsProbe = normalizeGlobalSymbolsBridge(maybeWindow);
  if (globalsProbe) {
    return globalsProbe;
  }

  return null;
}

export function requireWasmMethod<K extends keyof WasmWebwalletBridge>(
  bridge: WasmWebwalletBridge,
  method: K
): NonNullable<WasmWebwalletBridge[K]> {
  const fn = bridge[method];
  if (typeof fn !== "function") {
    throw new WalletConnectorError(
      "METHOD_NOT_SUPPORTED",
      `WASM webwallet bridge does not support ${method}`,
      { method }
    );
  }
  return fn as NonNullable<WasmWebwalletBridge[K]>;
}

export function parseWasmBalance(value: number | string | bigint | undefined): bigint {
  if (value === undefined) {
    return 0n;
  }
  return BigInt(value);
}

function normalizeObjectBridge(
  candidate: unknown,
  source: WasmBridgeSource
): WasmBridgeProbe {
  if (!candidate || typeof candidate !== "object") {
    throw new WalletConnectorError(
      "TRANSPORT_FAILURE",
      "WASM webwallet bridge candidate must be an object",
      { source }
    );
  }

  const raw = candidate as Record<string, unknown>;
  const normalized: WasmWebwalletBridge = {};
  const availableMethods: WasmMethodKey[] = [];

  for (const method of Object.keys(METHOD_ALIASES) as WasmMethodKey[]) {
    const aliases = METHOD_ALIASES[method];
    const alias = aliases.find((name) => name in raw);
    if (!alias) {
      continue;
    }

    const value = raw[alias];
    if (typeof value !== "function") {
      throw new WalletConnectorError(
        "TRANSPORT_FAILURE",
        `WASM bridge method ${alias} is not callable`,
        { source, method, alias, receivedType: typeof value }
      );
    }

    (normalized as Record<WasmMethodKey, unknown>)[method] = value;
    availableMethods.push(method);
  }

  for (const requiredMethod of REQUIRED_METHODS) {
    if (typeof normalized[requiredMethod] !== "function") {
      throw new WalletConnectorError(
        "TRANSPORT_FAILURE",
        `WASM bridge is missing required method ${requiredMethod}`,
        { source, requiredMethod }
      );
    }
  }

  return { bridge: normalized, source, availableMethods };
}

function normalizeGlobalSymbolsBridge(
  scope: Record<string, unknown>
): WasmBridgeProbe | null {
  const normalized: WasmWebwalletBridge = {};
  const availableMethods: WasmMethodKey[] = [];

  const hasAnyKnownSymbol = (Object.values(GLOBAL_SYMBOLS) as string[]).some(
    (symbol) => symbol in scope
  );
  if (!hasAnyKnownSymbol) {
    return null;
  }

  for (const method of Object.keys(GLOBAL_SYMBOLS) as WasmMethodKey[]) {
    const symbol = GLOBAL_SYMBOLS[method];
    if (!(symbol in scope)) {
      continue;
    }

    const value = scope[symbol];
    if (typeof value !== "function") {
      throw new WalletConnectorError(
        "TRANSPORT_FAILURE",
        `WASM global symbol ${symbol} is not callable`,
        { source: "DERO_JS_GLOBALS", method, symbol, receivedType: typeof value }
      );
    }

    (normalized as Record<WasmMethodKey, unknown>)[method] = value;
    availableMethods.push(method);
  }

  for (const requiredMethod of REQUIRED_METHODS) {
    if (typeof normalized[requiredMethod] !== "function") {
      throw new WalletConnectorError(
        "TRANSPORT_FAILURE",
        `WASM bridge globals are missing required symbol ${GLOBAL_SYMBOLS[requiredMethod]}`,
        { source: "DERO_JS_GLOBALS", requiredMethod }
      );
    }
  }

  return {
    bridge: normalized,
    source: "DERO_JS_GLOBALS",
    availableMethods,
  };
}
