import * as ed from "@noble/ed25519";

export interface ReceiptPayload {
  transaction: string;
  network: string;
  payer: string;
  amount: string;
  paidAtHeight: number;
}

export interface SignedReceipt {
  payload: ReceiptPayload;
  signature: string; // hex
  algorithm: "ed25519";
}

function canonicalize(p: ReceiptPayload): string {
  return JSON.stringify({
    transaction: p.transaction,
    network: p.network,
    payer: p.payer,
    amount: p.amount,
    paidAtHeight: p.paidAtHeight,
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
