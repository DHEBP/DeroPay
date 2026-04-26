import { findStoredProduct } from "@/lib/commerce-mock-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  const product = findStoredProduct(decodeURIComponent(id));
  if (!product) {
    return Response.json(
      { error: { code: "not_found", message: "Product not found" } },
      { status: 404 },
    );
  }
  return Response.json({ product });
}
