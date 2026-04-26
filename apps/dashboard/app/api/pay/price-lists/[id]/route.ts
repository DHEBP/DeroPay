import { findById } from "@/lib/commerce";
import { listPriceLists } from "@/lib/commerce-mock-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  const list = findById(listPriceLists(), decodeURIComponent(id));
  if (!list) {
    return Response.json(
      { error: { code: "not_found", message: "Price list not found" } },
      { status: 404 },
    );
  }
  return Response.json({ priceList: list });
}
