import { extensibleResponse } from "@/lib/extensible-response";

export async function GET() {
  return extensibleResponse(
    "customers",
    "Add your own customer store implementation.",
    [
      "GET /api/pay/customers — list customers",
      "GET /api/pay/customers/:id — customer detail + history",
      "POST /api/pay/customers — create/link customer",
      "Query params: ?limit, ?offset, ?search",
    ],
  );
}

export async function POST() {
  return extensibleResponse(
    "customers",
    "Add your own customer creation implementation.",
    [
      "POST /api/pay/customers — create or link a customer profile",
      "Body: { address?, email?, name?, metadata? }",
    ],
  );
}
