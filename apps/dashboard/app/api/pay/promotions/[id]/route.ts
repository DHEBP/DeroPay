import { findById, PROMOTIONS } from "@/lib/commerce";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const promotion = findById(PROMOTIONS, id);
  if (!promotion) {
    return Response.json(
      { error: "not_found", message: `Promotion ${id} not found` },
      { status: 404 },
    );
  }
  return Response.json({ promotion });
}
