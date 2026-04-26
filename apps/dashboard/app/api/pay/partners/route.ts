import { extensibleResponse } from "@/lib/extensible-response";

export async function GET() {
  return extensibleResponse(
    "partners",
    "Add your own affiliate/partner store implementation.",
    [
      "GET /api/pay/partners — list all partners",
      "GET /api/pay/partners/:id — partner detail + referrals",
      "GET /api/pay/partners/:id/commissions — commission history",
    ],
  );
}

export async function POST() {
  return extensibleResponse(
    "partners",
    "Add your own partner registration implementation.",
    [
      "POST /api/pay/partners — register a new partner",
      "Body: { name, email?, payoutAddress, commissionRate? }",
    ],
  );
}
