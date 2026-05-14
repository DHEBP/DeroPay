import { withX402, FacilitatorHttpClient } from "dero-pay/x402";
import type { NextRequest } from "next/server";

const RECEIPT_SCID = process.env.RECEIPT_SCID;
if (!RECEIPT_SCID) throw new Error("RECEIPT_SCID env var is required");

const facilitator = new FacilitatorHttpClient(process.env.FACILITATOR_URL ?? "http://localhost:4402");

const handler = withX402({
  facilitator,
  resource: process.env.RESOURCE_URL ?? "http://localhost:3002/api/data",
  accepts: [{
    scheme: "dero-exact",
    network: "dero-mainnet",
    asset: "DERO",
    payTo: RECEIPT_SCID,
    maxAmountRequired: "1000",
    resource: process.env.RESOURCE_URL ?? "http://localhost:3002/api/data",
    extra: { merchantId: "x402-example", orderId: crypto.randomUUID() },
  }],
}, async () => Response.json({ secret: "you paid; here's the goods", ts: Date.now() }));

export async function GET(req: NextRequest) {
  return handler(req as unknown as Request);
}
