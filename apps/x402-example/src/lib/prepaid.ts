import { createPrepaidHandlers } from "dero-pay/prepaid";
import { authenticatePrepaidRequest } from "@/lib/auth";
import { deroChainId, getPrepaidLedger, paymentHandlers } from "@/lib/deropay";

function positiveAtomic(name: string, fallback: string): bigint {
  const value = process.env[name] ?? fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  return BigInt(value);
}

function positiveInteger(name: string, fallback: string): number {
  const value = process.env[name] ?? fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is too large`);
  return parsed;
}

let handlers: ReturnType<typeof createPrepaidHandlers> | undefined;

function getHandlers() {
  return (handlers ??= createPrepaidHandlers({
    getEngine: paymentHandlers.getEngine,
    ledger: getPrepaidLedger(),
    authenticate: authenticatePrepaidRequest,
    receiptSecret: process.env.DEROPAY_RECEIPT_SECRET ?? "dev-only-change-me",
    network: deroChainId,
    requiredConfirmations: positiveInteger("PREPAID_REQUIRED_CONFIRMATIONS", "3"),
    minimumTopUpAtomic: positiveAtomic("PREPAID_MIN_TOP_UP_ATOMIC", "50000"),
    suggestedTopUpAtomic: positiveAtomic("PREPAID_SUGGESTED_TOP_UP_ATOMIC", "500000"),
    maximumTopUpAtomic: positiveAtomic("PREPAID_MAX_TOP_UP_ATOMIC", "100000000000"),
    minimumConsumeAtomic: positiveAtomic("PREPAID_MIN_CONSUME_ATOMIC", "1"),
  }));
}

export const topUpHandler = (request: Request) => getHandlers().topUpHandler(request);
export const balanceHandler = (request: Request) => getHandlers().balanceHandler(request);
export const transactionsHandler = (request: Request) =>
  getHandlers().transactionsHandler(request);
