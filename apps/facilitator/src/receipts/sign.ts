import * as ed from "@noble/ed25519";

export interface ReceiptPayload {
  transaction: string;
  network: string;
  payer: string;
  amount: string;
  paidAtHeight: number;
  /**
   * The purchased resource, bound INTO the signature. Without this a
   * receipt signed for resource A verifies for B/C/D on the same server
   * — the resource-binding hole formalized in arXiv:2605.11781 ("no
   * audited SDK binds a payment to the intended resource"). Present on
   * all receipts this facilitator issues.
   */
  resource: string;
  merchantId: string;
  orderId: string;
}

export interface SignedReceipt {
  payload: ReceiptPayload;
  signature: string; // hex
  algorithm: "ed25519";
}

function canonicalize(p: ReceiptPayload): string {
  // Fixed key order; every field is covered by the signature.
  return JSON.stringify({
    transaction: p.transaction,
    network: p.network,
    payer: p.payer,
    amount: p.amount,
    paidAtHeight: p.paidAtHeight,
    resource: p.resource,
    merchantId: p.merchantId,
    orderId: p.orderId,
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
