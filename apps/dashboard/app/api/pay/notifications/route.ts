import { extensibleResponse } from "@/lib/extensible-response";

export async function GET() {
  return extensibleResponse(
    "notifications",
    "Add your own notification preferences store implementation.",
    [
      "GET /api/pay/notifications/preferences — get current settings",
      "GET /api/pay/notifications/history — delivery log",
    ],
  );
}

export async function PUT() {
  return extensibleResponse(
    "notifications",
    "Add your own notification preferences update implementation.",
    [
      "PUT /api/pay/notifications/preferences — update settings",
      "Body: { email?, webhook?, thresholds?, digest? }",
    ],
  );
}

export async function POST() {
  return extensibleResponse(
    "notifications",
    "Add your own notification test implementation.",
    [
      "POST /api/pay/notifications/test — send a test notification",
      "Body: { channel, event? }",
    ],
  );
}
