import { claimEscrowInvoiceHandler } from "@/lib/engine";

// Gate 2 — buyer-facing CLAIM endpoint for two-phase escrow.
// Body: { invoiceId, buyerAddress } → binds the proven buyer and deploys the
// escrow contract, moving it from "quoted" to "awaiting_deposit".
export const POST = claimEscrowInvoiceHandler;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
