import { createPublicKey, verify as cryptoVerify } from "node:crypto";

/**
 * The signed settlement receipt issued by the facilitator's POST /settle.
 * Mirrors apps/facilitator/src/receipts/sign.ts. Every field listed in
 * `canonicalize` is covered by the Ed25519 signature — including `resource`
 * and `expiresAt`, which is what makes resource-binding and the replay window
 * enforceable HERE, at the consuming server, rather than trusting the
 * facilitator's `success` flag.
 */
export interface X402ReceiptPayload {
  network: string;
  payer: string;
  amount: string;
  paidAtHeight: number;
  resource: string;
  merchantId: string;
  orderId: string;
  expiresAt: number;
}

export interface X402SignedReceipt {
  payload: X402ReceiptPayload;
  signature: string; // hex
  algorithm: "ed25519";
}

// Byte-for-byte identical to the facilitator's canonicalize(): fixed key
// order, every field covered. Any drift here silently breaks verification, so
// the two MUST stay in lockstep (guarded by a cross-package test).
function canonicalize(p: X402ReceiptPayload): string {
  // Byte-for-byte identical to the facilitator's canonicalize(). txHash is NOT
  // part of the signed message: the facilitator never verifies it on-chain, so
  // it must not appear in a signed attestation. Keep this in lockstep with
  // apps/facilitator/src/receipts/sign.ts.
  return JSON.stringify({
    network: p.network,
    payer: p.payer,
    amount: p.amount,
    paidAtHeight: p.paidAtHeight,
    resource: p.resource,
    merchantId: p.merchantId,
    orderId: p.orderId,
    expiresAt: p.expiresAt,
  });
}

// Wrap a 32-byte raw Ed25519 public key in the DER SubjectPublicKeyInfo
// prefix Node's KeyObject expects. Lets callers configure the facilitator key
// as a bare 64-hex string (matching how the signing key is configured) rather
// than shipping PEM around.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function publicKeyFromHex(hex: string) {
  const raw = Buffer.from(hex, "hex");
  if (raw.length !== 32) throw new Error("ed25519 public key must be 32 bytes");
  const der = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

export interface VerifyX402ReceiptOptions {
  /** Facilitator's Ed25519 public key, 64 lowercase hex chars. */
  publicKeyHex: string;
  /** The resource the server is actually about to serve. MUST match. */
  expectedResource: string;
  /** Optional: assert the receipt is for this merchant/order. */
  expectedMerchantId?: string;
  expectedOrderId?: string;
  /**
   * The minimum on-chain amount (atomic units, decimal string) this receipt
   * must attest to cover the price of what is being served. The receipt's
   * `amount` field is signed but was previously UNENFORCED at the consumer, so
   * a malicious/compromised facilitator could sign a receipt whose amount is
   * below the served tier's price and the consumer would accept it (O18). When
   * set, `signed.payload.amount` (BigInt) MUST be >= this value.
   */
  expectedMinAmount?: string;
  /** Override clock for tests (ms). */
  nowMs?: number;
}

export type VerifyX402ReceiptResult =
  | { ok: true; payload: X402ReceiptPayload }
  | { ok: false; reason: string };

/**
 * Verify a facilitator receipt at the consuming server. This is the check the
 * reference middleware previously SKIPPED — it trusted settle.success, so a
 * malicious/compromised facilitator, or a MITM on the plaintext
 * server<->facilitator hop, could return {success:true} with any/no receipt
 * and unlock the resource. Verifying the signature + resource binding here
 * makes the Ed25519 receipt load-bearing:
 *   1. signature valid under the configured facilitator key (forgery),
 *   2. receipt.resource === the resource being served (substitution),
 *   3. not expired (bounded replay window; pairs with the caller's
 *      one-time-use guard for full replay defense).
 */
export function verifyX402Receipt(
  signed: X402SignedReceipt | null | undefined,
  opts: VerifyX402ReceiptOptions,
): VerifyX402ReceiptResult {
  if (!signed || signed.algorithm !== "ed25519") return { ok: false, reason: "missing_receipt" };
  if (typeof signed.signature !== "string" || !/^[0-9a-f]{128}$/.test(signed.signature)) {
    return { ok: false, reason: "malformed_signature" };
  }

  let key;
  try {
    key = publicKeyFromHex(opts.publicKeyHex);
  } catch {
    return { ok: false, reason: "bad_public_key" };
  }

  const msg = Buffer.from(canonicalize(signed.payload), "utf8");
  const sig = Buffer.from(signed.signature, "hex");
  let sigOk = false;
  try {
    sigOk = cryptoVerify(null, msg, key, sig);
  } catch {
    sigOk = false;
  }
  if (!sigOk) return { ok: false, reason: "bad_signature" };

  if (signed.payload.resource !== opts.expectedResource) {
    return { ok: false, reason: "resource_mismatch" };
  }
  if (opts.expectedMerchantId !== undefined && signed.payload.merchantId !== opts.expectedMerchantId) {
    return { ok: false, reason: "merchant_mismatch" };
  }
  if (opts.expectedOrderId !== undefined && signed.payload.orderId !== opts.expectedOrderId) {
    return { ok: false, reason: "order_mismatch" };
  }

  // Enforce the signed amount covers the served tier's price. The facilitator
  // binds amount to the ACTUAL on-chain deposit; without this check the amount
  // is signed-but-decorative and a downgraded receipt (cheap tier's on-chain
  // payment) could unlock an expensive tier when the (scid,merchant,order)
  // tuple is reused across tiers (O18).
  if (opts.expectedMinAmount !== undefined) {
    let receiptAmount: bigint;
    let expectedMin: bigint;
    try {
      receiptAmount = BigInt(signed.payload.amount);
      expectedMin = BigInt(opts.expectedMinAmount);
    } catch {
      return { ok: false, reason: "malformed_amount" };
    }
    if (receiptAmount < expectedMin) return { ok: false, reason: "underpaid_receipt" };
  }

  const now = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  if (signed.payload.expiresAt <= now) return { ok: false, reason: "receipt_expired" };

  return { ok: true, payload: signed.payload };
}

/**
 * Pluggable durable backend for the one-time-use ledger. Implement this over
 * Redis/Postgres/Durable Objects/etc. so replay defense survives across
 * serverless instances and cold starts. `reserve` MUST be atomic: it records
 * the key with a TTL and returns true ONLY on the first caller to claim it
 * (compare-and-set / SET NX PX). Any store whose reserve is not atomic
 * re-opens cross-instance replay and MUST NOT be used.
 */
export interface ConsumedReceiptStore {
  /** Atomically claim `key` until `expiresAtMs`. True iff newly claimed. */
  reserve(key: string, expiresAtMs: number): Promise<boolean>;
}

/**
 * One-time-use ledger. A receipt's canonical identity is
 * (merchantId|orderId|payer|resource) — resource IS part of the identity so a
 * single order's receipt cannot be spent against a different served resource
 * even when the same static `resource` string is configured (see withX402's
 * per-request resource resolution).
 *
 * Default backend is in-memory, which is process-local: in a multi-instance or
 * cold-starting serverless deployment (the canonical Next.js target) an
 * in-memory ledger fails OPEN — a receipt consumed on instance A is unknown to
 * instance B, so the same payment unlocks again on every reachable instance
 * within its TTL. Pass a durable `ConsumedReceiptStore` (Redis SET NX PX, a
 * DB unique-insert, etc.) for any deployment that is not a single long-lived
 * process. The in-memory default exists only for local/single-process use and
 * logs a one-time warning so integrators cannot ship it unknowingly.
 */
export class ConsumedReceiptLedger {
  private readonly store: ConsumedReceiptStore;

  constructor(store?: ConsumedReceiptStore) {
    if (store) {
      this.store = store;
    } else {
      this.store = new InMemoryConsumedReceiptStore();
      warnInMemoryLedger();
    }
  }

  static key(p: X402ReceiptPayload): string {
    return `${p.merchantId}|${p.orderId}|${p.payer}|${p.resource}`;
  }

  /** Returns true if this receipt was newly consumed; false if already used. */
  async consume(p: X402ReceiptPayload): Promise<boolean> {
    // Keep the marker until the receipt would have expired anyway; after that
    // no valid receipt with this identity can exist, so the entry is dead.
    return this.store.reserve(ConsumedReceiptLedger.key(p), p.expiresAt * 1000);
  }
}

/**
 * Process-local store. NOT safe across instances/cold starts — see
 * ConsumedReceiptLedger. Exposed so tests and single-process deployments can
 * construct it explicitly (which suppresses the default-usage warning).
 */
export class InMemoryConsumedReceiptStore implements ConsumedReceiptStore {
  private consumed = new Map<string, number>();

  async reserve(key: string, expiresAtMs: number): Promise<boolean> {
    const now = Date.now();
    for (const [k, exp] of this.consumed) if (exp <= now) this.consumed.delete(k);
    if (this.consumed.has(key)) return false;
    this.consumed.set(key, expiresAtMs);
    return true;
  }
}

let inMemoryWarned = false;
function warnInMemoryLedger(): void {
  if (inMemoryWarned) return;
  inMemoryWarned = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[dero-pay] ConsumedReceiptLedger is using the in-memory store. This is " +
      "process-local and FAILS OPEN across serverless instances/cold starts " +
      "(a receipt consumed on one instance can replay on another within its " +
      "TTL). Pass a durable ConsumedReceiptStore for any multi-instance deploy.",
  );
}
