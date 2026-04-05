import { meteredX402Guard } from "@/lib/deropay";

export const GET = meteredX402Guard(async (request) => {
  const url = new URL(request.url);
  const tokensRaw = Number.parseInt(url.searchParams.get("tokens") ?? "1000", 10);
  const tokens = Number.isFinite(tokensRaw) && tokensRaw > 0 ? tokensRaw : 1000;

  return Response.json({
    message: "Paid metered inference unlocked",
    generatedAt: new Date().toISOString(),
    usage: {
      billedTokens: tokens,
      // Mirrors the resolver's unit price.
      billedAtomic: (BigInt(tokens) * 5_000n).toString(),
    },
    data: {
      model: "example-llm",
      completion: "Dynamic pricing route served by DeroPay x402 policy resolver.",
    },
  });
});
