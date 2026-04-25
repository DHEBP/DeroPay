/**
 * Shared dashboard types.
 *
 * This file is the single source of truth for types that cross the
 * client/server boundary inside the dashboard app but aren't part of the
 * upstream `dero-pay/server` engine contract. Keep it thin — prefer
 * importing from `dero-pay` or `dero-pay/server` when a type is already
 * defined there.
 */

/**
 * A DERO-BTC atomic swap, as surfaced by the future
 * `atomic-swaps-project` coordinator. The dashboard renders these in a
 * horizontal lane on the home page.
 *
 * See `app/api/pay/atomic-swaps/route.ts` for the expected live contract.
 */
export type AtomicSwap = {
  id: string;
  direction: "dero-to-btc" | "btc-to-dero";
  /** Truncated counterparty address / label (already display-ready). */
  counterparty: string;
  state:
    | "proposed"
    | "funding"
    | "funded"
    | "claiming"
    | "completed"
    | "refunded"
    | "failed";
  /** picodero (atomic) DERO amount, as a decimal string. */
  deroAmount: string;
  /** satoshi BTC amount, as a decimal string. */
  btcAmount: string;
  /** Absolute refund deadline in epoch ms, or `null` if not applicable. */
  refundTimeoutMs: number | null;
  /** Swap creation time, epoch ms. */
  createdAt: number;
  /** Swap completion time, epoch ms, or `null` if not yet complete. */
  completedAt: number | null;
  /** Optional last-seen on-chain tx (DERO or BTC side). */
  lastTxHash?: string;
};
