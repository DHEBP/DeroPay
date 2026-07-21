import { paymentPayloadSchema, type PaymentPayload, type PaymentRequirements } from "./types";

export function selectAcceptsEntry(
  accepts: PaymentRequirements[],
  match: { scheme: string; network: string },
): PaymentRequirements | undefined {
  return accepts.find((a) => a.scheme === match.scheme && a.network === match.network);
}

export interface BuildHeaderInput {
  accepts: PaymentRequirements;
  txHash: string;
  payer: string;
  amount: string;
}

export function buildPaymentHeader(input: BuildHeaderInput): string {
  const payload: PaymentPayload = paymentPayloadSchema.parse({
    x402Version: 1,
    scheme: input.accepts.scheme,
    network: input.accepts.network,
    payload: {
      txHash: input.txHash,
      scid: input.accepts.payTo,
      merchantId: input.accepts.extra.merchantId,
      orderId: input.accepts.extra.orderId,
      payer: input.payer,
      amount: input.amount,
    },
  });
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

// ringsize is fixed at 2 (DERO's default is 16) on purpose: refund-on-reject
// and owner-only-withdraw need a real, identifiable signer — an anonymous
// ring>2 caller writes a zero address and cannot be refunded. The cost is that
// the payer is NOT sender-anonymous: the Pay call writes the payer's plaintext
// address to public contract state. See the x402 privacy note in README /
// SECURITY.md before metering anything payer-sensitive.
export interface WalletInvoke {
  (args: { scid: string; entrypoint: "Pay"; ringsize: 2; deroDeposit: bigint; args: Record<string, string> }): Promise<{ txid: string; payer: string }>;
}

let x402PrivacyWarned = false;
function warnX402NotAnonymous(): void {
  if (x402PrivacyWarned) return;
  x402PrivacyWarned = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[dero-pay] x402 rail (dero-exact): this Pay call is submitted at ring size 2 " +
      "(DERO's default is 16) and writes the payer's PLAINTEXT address to PUBLIC " +
      "contract state (paid_<merchant>_<order>), alongside amount and block height — " +
      "all readable by anyone via GetSC. Every x402 payment permanently links " +
      "payer<->merchant<->order<->amount<->height on-chain. This is NOT sender-anonymous " +
      "and is a regression from DERO's default anonymity; account balances stay " +
      "encrypted, payer identity does not. Do not use this rail for payments whose " +
      "payer must stay private.",
  );
}

// Submits the ring-2 Pay and builds the X-PAYMENT header. NOTE: this publishes
// the payer's address on public chain state — emits a one-time privacy warning.
export async function payDeroRail(
  accepts: PaymentRequirements,
  walletInvoke: WalletInvoke,
): Promise<{ paymentHeader: string; txid: string }> {
  warnX402NotAnonymous();
  const invocation = await walletInvoke({
    scid: accepts.payTo,
    entrypoint: "Pay",
    ringsize: 2,
    deroDeposit: BigInt(accepts.maxAmountRequired),
    args: { merchant_id: accepts.extra.merchantId, order_id: accepts.extra.orderId },
  });
  const header = buildPaymentHeader({
    accepts,
    txHash: invocation.txid,
    payer: invocation.payer,
    amount: accepts.maxAmountRequired,
  });
  return { paymentHeader: header, txid: invocation.txid };
}
