import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Stateless, server-authoritative order-id minting for x402.
 *
 * WHY THIS EXISTS (O8/O17/O19): the facilitator's order_mismatch guard only
 * has teeth if `pr.extra.orderId` is chosen by the SERVER, not by the caller.
 * When an integrator hard-codes a single static orderId (the obvious "static
 * accepts" shape), `pp.payload.orderId` and `pr.extra.orderId` become the same
 * fixed string for every request, the on-chain `paid_<mkey>` slot for that
 * order is paid exactly ONCE (the contract PANICs on a second Pay), and from
 * then on the world-readable payment tuple replays for anyone within the
 * receipt TTL. Binding the orderId to a fresh per-request nonce closes that.
 *
 * This helper is STATELESS so it survives the multi-instance / serverless
 * target: the id is `<nonce>.<HMAC(secret, context|nonce)>`, so any instance
 * can validate an id another instance minted using only the shared secret —
 * no cross-instance map, no liveness break on the paid retry. A client cannot
 * fabricate a "server-issued" id without the secret. Single-use is still
 * enforced downstream by the ConsumedReceiptLedger.
 *
 * `context` should bind the id to the merchant + resource it was issued for so
 * an id minted for one (merchant,resource) cannot be replayed as a valid
 * server-issued id for another.
 */
export interface OrderIdMinter {
  /** Mint a fresh server-issued order id for the given binding context. */
  mint(context: string): string;
  /** True iff `id` is a well-formed order id this deployment could have issued for `context`. */
  isServerIssued(id: string, context: string): boolean;
  /**
   * Resolve the order id to use for a request: honor the caller's claimed id
   * ONLY when it validates as server-issued for this context; otherwise mint a
   * fresh one (which forces a 402 since no on-chain payment can exist for a
   * brand-new nonce).
   */
  resolve(claimedOrderId: string | undefined, context: string): string;
}

export function createOrderIdMinter(hmacSecret: string): OrderIdMinter {
  if (typeof hmacSecret !== "string" || hmacSecret.length < 16) {
    throw new Error("order-id HMAC secret must be at least 16 chars");
  }

  // Compact id: 16-hex nonce (64-bit random) + "." + 40-hex truncated HMAC
  // (160-bit tag) = 57 chars, which stays within the schema's 64-char orderId
  // bound (paymentRequirementsSchema.extra.orderId .max(64)). Truncating an
  // HMAC-SHA256 tag to 160 bits is standard and leaves a forgery margin far
  // beyond what a public-chain attacker can brute force.
  const MAC_HEX_LEN = 40;

  function macFor(context: string, nonce: string): string {
    return createHmac("sha256", hmacSecret)
      .update(`${context}|${nonce}`)
      .digest("hex")
      .slice(0, MAC_HEX_LEN);
  }

  function mint(context: string): string {
    const nonce = randomBytes(8).toString("hex"); // 16 hex chars
    return `${nonce}.${macFor(context, nonce)}`;
  }

  function isServerIssued(id: string, context: string): boolean {
    if (typeof id !== "string") return false;
    const dot = id.lastIndexOf(".");
    if (dot <= 0) return false;
    const nonce = id.slice(0, dot);
    const mac = id.slice(dot + 1);
    const expected = macFor(context, nonce);
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  function resolve(claimedOrderId: string | undefined, context: string): string {
    if (typeof claimedOrderId === "string" && isServerIssued(claimedOrderId, context)) {
      return claimedOrderId;
    }
    return mint(context);
  }

  return { mint, isServerIssued, resolve };
}
