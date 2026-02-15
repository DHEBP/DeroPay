/**
 * Payment ID generation for DERO integrated addresses.
 *
 * DERO uses RPC_DESTINATION_PORT (uint64) as a payment identifier,
 * embedded into integrated addresses. Each invoice gets a unique
 * payment ID so incoming transactions can be matched.
 */

/**
 * Generate a random uint64 payment ID.
 * Uses crypto.getRandomValues for security, falling back to Math.random.
 *
 * @returns A BigInt in the uint64 range (0 to 2^64 - 1)
 */
export function generatePaymentId(): bigint {
  const bytes = new Uint8Array(8);

  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Convert 8 bytes to a BigInt (big-endian)
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }

  // Ensure non-zero (zero could cause issues with DERO RPC filtering)
  if (value === 0n) {
    value = 1n;
  }

  return value;
}

/**
 * Convert a payment ID to a hex string (16 chars, zero-padded).
 */
export function paymentIdToHex(paymentId: bigint): string {
  return paymentId.toString(16).padStart(16, "0");
}

/**
 * Parse a hex string back to a payment ID.
 */
export function hexToPaymentId(hex: string): bigint {
  return BigInt("0x" + hex);
}

/**
 * Validate that a value is a valid uint64 payment ID.
 */
export function isValidPaymentId(value: bigint): boolean {
  return value >= 0n && value <= 0xFFFFFFFFFFFFFFFFn;
}
