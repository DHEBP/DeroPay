import { x402Guard } from "@/lib/deropay";

export const GET = x402Guard(async () => {
  return Response.json({
    message: "Paid report unlocked",
    generatedAt: new Date().toISOString(),
    data: {
      mrr: 12345,
      churn: 0.023,
      notes: "This is protected x402-style content served by DeroPay.",
    },
  });
});
