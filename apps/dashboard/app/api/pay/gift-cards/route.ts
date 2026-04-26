import { extensibleResponse } from "@/lib/extensible-response";

export async function GET() {
  return extensibleResponse(
    "gift-cards",
    "Add your own gift card store implementation.",
    [
      "GET /api/pay/gift-cards — list all gift cards",
      "GET /api/pay/gift-cards/:code — get card details",
      "GET /api/pay/gift-cards/:code/balance — check remaining balance",
    ],
  );
}

export async function POST() {
  return extensibleResponse(
    "gift-cards",
    "Add your own gift card issuance implementation.",
    [
      "POST /api/pay/gift-cards — issue a new gift card",
      "Body: { amount, expiresAt?, recipientEmail? }",
    ],
  );
}
