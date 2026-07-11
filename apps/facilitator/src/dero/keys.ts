/**
 * Contract state-key derivation — the single source of truth shared by
 * verify and settle. MUST stay byte-for-byte identical to the key format
 * in `packages/dero-pay/contracts/x402-pay.bas`:
 *
 *   mkey = strlen(merchant_id) + "_" + merchant_id + "_" + order_id
 *   paid_<mkey> / amt_<mkey> / h_<mkey>
 *
 * The length prefix on merchant_id makes the key parse unambiguous, so no
 * two distinct (merchant, order) pairs can collide onto one key. We use
 * `Buffer.byteLength(..., "utf8")` because the DVM's strlen counts BYTES,
 * not UTF-16 code units — they match for ASCII ids and stay correct for
 * multi-byte ones.
 */

function mkey(merchantId: string, orderId: string): string {
  const len = Buffer.byteLength(merchantId, "utf8");
  return `${len}_${merchantId}_${orderId}`;
}

export function paidKey(merchantId: string, orderId: string): string {
  return `paid_${mkey(merchantId, orderId)}`;
}

export function amtKey(merchantId: string, orderId: string): string {
  return `amt_${mkey(merchantId, orderId)}`;
}

export function hKey(merchantId: string, orderId: string): string {
  return `h_${mkey(merchantId, orderId)}`;
}
