import { WalletConnectorError } from "../errors.js";
import type { ScInvokeRequest, TransferRequest } from "../types.js";

export type XSWDRpcAmount = number | string;

export type XSWDTransferParams = {
  transfers: Array<{
    destination: string;
    amount: XSWDRpcAmount;
    scid?: string;
    burn?: XSWDRpcAmount;
    payload_rpc?: unknown[];
  }>;
  ringsize: number;
  fees?: XSWDRpcAmount;
};

export type XSWDScInvokeParams = {
  scid: string;
  sc_rpc: unknown[];
  ringsize: number;
  sc_dero_deposit?: XSWDRpcAmount;
  sc_token_deposit?: XSWDRpcAmount;
};

export function mapTransferRequest(
  transfers: TransferRequest[],
  ringsize: number,
  feesAtomic?: bigint
): XSWDTransferParams {
  if (transfers.length === 0) {
    throw new WalletConnectorError(
      "INVALID_PAYLOAD",
      "Transfer requires at least one destination"
    );
  }

  return {
    transfers: transfers.map((transfer) => ({
      destination: transfer.destination,
      amount: toRpcUint64(transfer.amountAtomic),
      ...(transfer.scid ? { scid: transfer.scid } : {}),
      ...(transfer.burnAtomic !== undefined
        ? { burn: toRpcUint64(transfer.burnAtomic) }
        : {}),
      ...(transfer.payloadRpc ? { payload_rpc: transfer.payloadRpc } : {}),
    })),
    ringsize,
    ...(feesAtomic !== undefined ? { fees: toRpcUint64(feesAtomic) } : {}),
  };
}

export function mapScInvokeRequest(request: ScInvokeRequest): XSWDScInvokeParams {
  if (!request.scid) {
    throw new WalletConnectorError("INVALID_PAYLOAD", "SC invoke requires scid");
  }
  if (!Array.isArray(request.scRpc) || request.scRpc.length === 0) {
    throw new WalletConnectorError(
      "INVALID_PAYLOAD",
      "SC invoke requires sc_rpc arguments"
    );
  }

  return {
    scid: request.scid,
    sc_rpc: request.scRpc,
    ringsize: request.ringsize ?? 2,
    ...(request.deroDepositAtomic !== undefined && request.deroDepositAtomic > 0n
      ? { sc_dero_deposit: toRpcUint64(request.deroDepositAtomic) }
      : {}),
    ...(request.tokenDepositAtomic !== undefined && request.tokenDepositAtomic > 0n
      ? { sc_token_deposit: toRpcUint64(request.tokenDepositAtomic) }
      : {}),
  };
}

export function toRpcUint64(value: bigint): XSWDRpcAmount {
  if (value < 0n) {
    throw new WalletConnectorError(
      "INVALID_PAYLOAD",
      "Wallet amount cannot be negative"
    );
  }

  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}

export function parseRpcBigInt(value: number | string | bigint | undefined): bigint {
  if (value === undefined) {
    return 0n;
  }
  return BigInt(value);
}
