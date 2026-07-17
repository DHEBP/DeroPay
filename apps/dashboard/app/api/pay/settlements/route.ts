import type { NextRequest } from "next/server";

const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "http://localhost:4402";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const target = new URL("/settlements", FACILITATOR_URL);
  const limit = url.searchParams.get("limit");
  if (limit) target.searchParams.set("limit", limit);

  try {
    const res = await fetch(target, { cache: "no-store" });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    return Response.json(
      {
        error: "facilitator_unreachable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
