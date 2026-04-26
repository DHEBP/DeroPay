import { extensibleResponse } from "@/lib/extensible-response";

export async function GET() {
  return extensibleResponse(
    "credits",
    "Add your own credit ledger implementation.",
    [
      "GET /api/pay/credits — list all credits",
      "GET /api/pay/credits/:customerId — get customer balance",
      "POST /api/pay/credits — issue credits",
      "POST /api/pay/credits/redeem — redeem against invoice",
    ],
  );
}

export async function POST() {
  return extensibleResponse(
    "credits",
    "Add your own credit issuance implementation.",
    [
      "POST /api/pay/credits — issue credits to a customer",
      "Body: { customerId, amount, reason?, expiresAt? }",
    ],
  );
}
