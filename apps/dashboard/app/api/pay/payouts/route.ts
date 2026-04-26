import { extensibleResponse } from "@/lib/extensible-response";

export async function GET() {
  return extensibleResponse(
    "payouts",
    "Add your own payout tracking implementation. Requires wallet RPC for sends.",
    [
      "GET /api/pay/payouts — list pending and completed payouts",
      "GET /api/pay/payouts/:id — payout detail + tx info",
      "Query params: ?status, ?limit, ?offset",
    ],
  );
}

export async function POST() {
  return extensibleResponse(
    "payouts",
    "Add your own payout scheduling implementation. Requires wallet RPC for sends.",
    [
      "POST /api/pay/payouts — schedule a payout",
      "POST /api/pay/payouts/:id/execute — trigger the send",
      "Body: { destinationAddress, amount, scheduledAt? }",
    ],
  );
}
