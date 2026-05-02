export type WalletErrorCode =
  | "WALLET_NOT_CONNECTED"
  | "METHOD_NOT_SUPPORTED"
  | "PERMISSION_DENIED"
  | "OFFLINE_MODE"
  | "INVALID_PAYLOAD"
  | "INSUFFICIENT_FUNDS"
  | "RPC_FAILURE"
  | "TRANSPORT_FAILURE"
  | "SECURITY_POLICY_BLOCKED";

export class WalletConnectorError extends Error {
  readonly code: WalletErrorCode;
  readonly meta?: Record<string, unknown>;

  constructor(
    code: WalletErrorCode,
    message: string,
    meta?: Record<string, unknown>
  ) {
    super(message);
    this.name = "WalletConnectorError";
    this.code = code;
    this.meta = meta;
  }
}

export type RawWalletError = {
  code?: number | string;
  message?: string;
};

export function isWalletConnectorError(
  error: unknown
): error is WalletConnectorError {
  return error instanceof WalletConnectorError;
}

export function normalizeWalletConnectorError(
  error: unknown,
  fallbackCode: WalletErrorCode = "RPC_FAILURE",
  meta?: Record<string, unknown>
): WalletConnectorError {
  if (isWalletConnectorError(error)) {
    return error;
  }

  const raw = toRawWalletError(error);
  const message = raw.message ?? "Wallet operation failed";
  const code = mapRawWalletErrorCode(raw, message, fallbackCode);

  return new WalletConnectorError(code, message, {
    ...meta,
    rawCode: raw.code,
  });
}

export function mapRawWalletErrorCode(
  raw: RawWalletError,
  message: string = "",
  fallbackCode: WalletErrorCode = "RPC_FAILURE"
): WalletErrorCode {
  const text = message.toLowerCase();

  if (raw.code === -32043 || raw.code === "-32043") {
    return "PERMISSION_DENIED";
  }
  if (raw.code === -32044 || raw.code === "-32044") {
    return "PERMISSION_DENIED";
  }
  if (raw.code === -32070 || raw.code === "-32070") {
    return "TRANSPORT_FAILURE";
  }
  if (text.includes("not connected")) {
    return "WALLET_NOT_CONNECTED";
  }
  if (text.includes("permission") || text.includes("denied")) {
    return "PERMISSION_DENIED";
  }
  if (text.includes("insufficient")) {
    return "INSUFFICIENT_FUNDS";
  }
  if (text.includes("timeout") || text.includes("offline")) {
    return "OFFLINE_MODE";
  }
  if (text.includes("websocket") || text.includes("transport")) {
    return "TRANSPORT_FAILURE";
  }
  return fallbackCode;
}

function toRawWalletError(error: unknown): RawWalletError {
  if (error instanceof Error) {
    return { message: error.message };
  }
  if (typeof error === "object" && error !== null) {
    const maybe = error as { code?: unknown; message?: unknown; error?: unknown };
    if (typeof maybe.error === "object" && maybe.error !== null) {
      const nested = maybe.error as { code?: unknown; message?: unknown };
      return {
        code: normalizeRawCode(nested.code),
        message:
          typeof nested.message === "string" ? nested.message : "Wallet operation failed",
      };
    }
    return {
      code: normalizeRawCode(maybe.code),
      message:
        typeof maybe.message === "string" ? maybe.message : "Wallet operation failed",
    };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  return { message: "Wallet operation failed" };
}

function normalizeRawCode(code: unknown): number | string | undefined {
  if (typeof code === "number" || typeof code === "string") {
    return code;
  }
  return undefined;
}
