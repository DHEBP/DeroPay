import * as ed from "@noble/ed25519";

export interface ReceiptPayload {
  network: string;
  payer: string;
  amount: string;
  paidAtHeight: number;
  /**
   * The purchased resource, bound INTO the signature. Without this a
   * receipt signed for resource A verifies for B/C/D on the same server
   * — the resource-binding gap described in arXiv:2605.11781 (the x402
   * SDKs it examined do not bind a payment to the intended resource).
   * Present on all receipts this facilitator issues.
   */
  resource: string;
  merchantId: string;
  orderId: string;
  /**
   * Unix seconds after which this receipt is no longer valid. Bound INTO the
   * signature. Because DVM state is fully public and permanent, the on-chain
   * facts a valid X-PAYMENT header needs (merchant/order/payer/amount) are
   * world-readable FOREVER — without an expiry any chain observer could
   * reconstruct the header and re-settle the same payment indefinitely.
   * Consumers MUST reject a receipt whose expiresAt is in the past.
   */
  expiresAt: number;
}

export interface SignedReceipt {
  payload: ReceiptPayload;
  signature: string; // hex
  algorithm: "ed25519";
}

function canonicalize(p: ReceiptPayload): string {
  // Fixed key order; every field is covered by the signature.
  //
  // NOTE: the payer's txHash is deliberately NOT signed here. The facilitator
  // proves payment purely from on-chain (scid, merchant, order) state via
  // DERO.GetSC and never looks up the tx — the contract does not even record a
  // txid (x402-pay.bas). Signing an attacker-chosen, unverified 64-hex string
  // as a "transaction" attestation would let a single real payment be settled
  // into a receipt whose tx id is a lie. The (payer, amount, paidAtHeight,
  // scid via merchant/order) tuple already identifies the settlement. txHash
  // survives only as UNSIGNED transport metadata (see settle.ts).
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

function parseKey(spec: string): Uint8Array {
  const match = spec.match(/^ed25519:([0-9a-f]{64})$/);
  if (!match) throw new Error("Invalid Ed25519 key spec");
  return Buffer.from(match[1], "hex");
}

export async function signReceipt(p: ReceiptPayload, signingKey: string): Promise<SignedReceipt> {
  const sk = parseKey(signingKey);
  const msg = new TextEncoder().encode(canonicalize(p));
  const sig = await ed.signAsync(msg, sk);
  return { payload: p, signature: Buffer.from(sig).toString("hex"), algorithm: "ed25519" };
}

export async function verifyReceipt(signed: SignedReceipt, publicKeyHex: string): Promise<boolean> {
  const pk = Buffer.from(publicKeyHex, "hex");
  const msg = new TextEncoder().encode(canonicalize(signed.payload));
  const sig = Buffer.from(signed.signature, "hex");
  try {
    return await ed.verifyAsync(sig, msg, pk);
  } catch {
    return false;
  }
}
