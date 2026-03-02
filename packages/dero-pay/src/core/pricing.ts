/**
 * Amount conversion utilities for DERO.
 *
 * DERO uses 5 decimal places.
 * 1 DERO = 100,000 atomic units (1e5).
 */

/** Number of atomic units per DERO */
export const ATOMIC_UNITS_PER_DERO = 100_000n;

/** Number of decimal places */
export const DERO_DECIMALS = 5;

/**
 * Convert a human-readable DERO amount to atomic units.
 *
 * @param dero - Amount in DERO (e.g., "1.5" or 1.5)
 * @returns Amount in atomic units as BigInt
 *
 * @example
 * ```ts
 * deroToAtomic("1.0")   // 100_000n
 * deroToAtomic("0.001") // 100n
 * deroToAtomic(25)      // 2_500_000n
 * ```
 */
export function deroToAtomic(dero: string | number): bigint {
  const str = String(dero);
  const parts = str.split(".");

  const whole = BigInt(parts[0] || "0") * ATOMIC_UNITS_PER_DERO;

  if (parts.length === 1 || !parts[1]) {
    return whole;
  }

  // Pad or truncate fractional part to DERO_DECIMALS places
  const frac = parts[1].slice(0, DERO_DECIMALS).padEnd(DERO_DECIMALS, "0");
  const fracValue = BigInt(frac);

  return whole + fracValue;
}

/**
 * Convert atomic units to a human-readable DERO string.
 *
 * @param atomic - Amount in atomic units
 * @param maxDecimals - Maximum decimal places to show (default: 5)
 * @returns Formatted DERO amount string
 *
 * @example
 * ```ts
 * atomicToDero(100_000n)    // "1.00000"
 * atomicToDero(150_000n)    // "1.50000"
 * atomicToDero(2_500_000n)  // "25.00000"
 * atomicToDero(10n, 2)      // "0.00"
 * ```
 */
export function atomicToDero(atomic: bigint, maxDecimals: number = 5): string {
  const isNegative = atomic < 0n;
  const abs = isNegative ? -atomic : atomic;

  const whole = abs / ATOMIC_UNITS_PER_DERO;
  const frac = abs % ATOMIC_UNITS_PER_DERO;

  const fracStr = frac.toString().padStart(DERO_DECIMALS, "0").slice(0, maxDecimals);
  const sign = isNegative ? "-" : "";

  return `${sign}${whole}.${fracStr}`;
}

/**
 * Format atomic units as a display string with "DERO" suffix.
 *
 * @example
 * ```ts
 * formatDero(150_000n) // "1.50000 DERO"
 * ```
 */
export function formatDero(atomic: bigint, maxDecimals: number = 5): string {
  return `${atomicToDero(atomic, maxDecimals)} DERO`;
}

/**
 * Validate that an amount is a positive value suitable for an invoice.
 */
export function isValidAmount(atomic: bigint): boolean {
  return atomic > 0n;
}
