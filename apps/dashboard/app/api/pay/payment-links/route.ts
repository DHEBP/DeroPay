import { extensibleResponse } from "@/lib/extensible-response";

export async function GET() {
  return extensibleResponse(
    "payment-links",
    "Add your own payment link store implementation.",
    [
      "GET /api/pay/payment-links — list active payment links",
      "GET /api/pay/payment-links/:id — link detail + conversion stats",
    ],
  );
}

export async function POST() {
  return extensibleResponse(
    "payment-links",
    "Add your own payment link creation implementation.",
    [
      "POST /api/pay/payment-links — create a shareable payment link",
      "Body: { name?, amount?, productId?, expiresAt?, metadata? }",
      "Returns: { id, url, qrCode }",
    ],
  );
}
