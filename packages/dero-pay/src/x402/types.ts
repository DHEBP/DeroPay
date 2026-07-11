import { z } from "zod";

const SCID = z.string().regex(/^[0-9a-f]{64}$/);
const TX_HASH = z.string().regex(/^[0-9a-f]{64}$/);
// Accept both HRPs: wallets report "dero1" on mainnet and "deto1" on
// testnet/simulator, and the DVM's ADDRESS_STRING() emits the mainnet
// form regardless of chain — comparisons must ignore HRP + checksum.
const DERO_ADDR = z.string().regex(/^(?:dero|deto)1[0-9a-z]{60,}$/);

export const paymentPayloadSchema = z.object({
  x402Version: z.literal(1),
  scheme: z.literal("dero-exact"),
  network: z.literal("dero-mainnet"),
  payload: z.object({
    txHash: TX_HASH,
    scid: SCID,
    merchantId: z.string().min(1).max(64),
    orderId: z.string().min(1).max(64),
    payer: DERO_ADDR,
    amount: z.string().regex(/^\d+$/),
  }),
});
export type PaymentPayload = z.infer<typeof paymentPayloadSchema>;

export const paymentRequirementsSchema = z.object({
  scheme: z.literal("dero-exact"),
  network: z.literal("dero-mainnet"),
  asset: z.literal("DERO"),
  payTo: SCID,
  maxAmountRequired: z.string().regex(/^\d+$/),
  resource: z.string().url(),
  extra: z.object({
    merchantId: z.string().min(1),
    orderId: z.string().min(1),
  }),
});
export type PaymentRequirements = z.infer<typeof paymentRequirementsSchema>;

export const verifyRequestSchema = z.object({
  paymentPayload: paymentPayloadSchema,
  paymentRequirements: paymentRequirementsSchema,
});
