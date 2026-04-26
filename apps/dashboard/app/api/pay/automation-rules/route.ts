import { extensibleResponse } from "@/lib/extensible-response";

export async function GET() {
  return extensibleResponse(
    "automation-rules",
    "Add your own automation engine implementation.",
    [
      "GET /api/pay/automation-rules — list all rules",
      "GET /api/pay/automation-rules/:id — rule detail + execution history",
    ],
  );
}

export async function POST() {
  return extensibleResponse(
    "automation-rules",
    "Add your own automation rule creation implementation.",
    [
      "POST /api/pay/automation-rules — create an automation rule",
      "Body: { name, trigger, conditions, actions, enabled? }",
      "Triggers: payment.confirmed, escrow.funded, invoice.expired, etc.",
      "Actions: webhook, notify, tag, sweep, update_metadata",
    ],
  );
}
