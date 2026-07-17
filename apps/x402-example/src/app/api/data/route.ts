import { withX402, FacilitatorHttpClient } from "dero-pay/x402";
import type { NextRequest } from "next/server";

const RECEIPT_SCID = process.env.RECEIPT_SCID;
if (!RECEIPT_SCID) throw new Error("RECEIPT_SCID env var is required");

const facilitator = new FacilitatorHttpClient(
  process.env.FACILITATOR_URL ?? "http://localhost:4402",
);
const RESOURCE = process.env.RESOURCE_URL ?? "http://localhost:3002/api/data";

function orderIdFor(req: Request): string {
  const xpayment = req.headers.get("X-PAYMENT");
  if (xpayment) {
    try {
      const decoded = JSON.parse(Buffer.from(xpayment, "base64").toString("utf8"));
      const claimed = decoded?.payload?.orderId;
      if (typeof claimed === "string" && claimed.length > 0) return claimed;
    } catch {
    }
  }
  return crypto.randomUUID();
}

export async function GET(req: NextRequest) {
  const orderId = orderIdFor(req as unknown as Request);
  const handler = withX402(
    {
      facilitator,
      resource: RESOURCE,
      accepts: [
        {
          scheme: "dero-exact",
          network: "dero-mainnet",
          asset: "DERO",
          payTo: RECEIPT_SCID!,
          maxAmountRequired: "1000",
          resource: RESOURCE,
          extra: { merchantId: "x402-example", orderId },
        },
      ],
    },
    async () =>
      Response.json({ secret: "you paid; here's the goods", ts: Date.now() }),
  );
  return handler(req as unknown as Request);
}
