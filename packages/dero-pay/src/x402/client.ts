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

export interface WalletInvoke {
  (args: { scid: string; entrypoint: "Pay"; ringsize: 2; deroDeposit: bigint; args: Record<string, string> }): Promise<{ txid: string; payer: string }>;
}

export async function payDeroRail(
  accepts: PaymentRequirements,
  walletInvoke: WalletInvoke,
): Promise<{ paymentHeader: string; txid: string }> {
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
