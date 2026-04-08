/**
 * Confirmation depth tracking for DERO payments.
 *
 * Confirmations are derived from daemon topological height (topoheight):
 * depth ≈ current_topoheight - tx_topoheight (see calculateConfirmations).
 * A payment is considered confirmed when it reaches the required depth.
 */

import type { Payment } from "../core/types.js";

/**
 * Calculate the confirmation count for a payment.
 *
 * @param paymentTopoHeight - The topo height where the payment was included
 * @param currentTopoHeight - The current blockchain topo height
 * @returns Number of confirmations (0 if pending/invalid)
 */
export function calculateConfirmations(
  paymentTopoHeight: number,
  currentTopoHeight: number
): number {
  if (paymentTopoHeight <= 0 || currentTopoHeight <= 0) return 0;
  if (currentTopoHeight < paymentTopoHeight) return 0;
  return currentTopoHeight - paymentTopoHeight + 1;
}

/**
 * Check if a payment has reached the required confirmation depth.
 */
export function isConfirmed(
  payment: Payment,
  requiredConfirmations: number
): boolean {
  return payment.confirmations >= requiredConfirmations;
}

/**
 * Update confirmation counts for a list of payments.
 *
 * @param payments - Payments to update
 * @param currentTopoHeight - Current blockchain topo height
 * @param requiredConfirmations - Required confirmations for "confirmed" status
 * @returns Updated payments with new confirmation counts and statuses
 */
export function updateConfirmations(
  payments: Payment[],
  currentTopoHeight: number,
  requiredConfirmations: number
): Payment[] {
  return payments.map((payment) => {
    const confirmations = calculateConfirmations(
      payment.topoHeight,
      currentTopoHeight
    );
    const status =
      confirmations >= requiredConfirmations ? "confirmed" as const : "confirming" as const;

    return {
      ...payment,
      confirmations,
      status,
    };
  });
}
