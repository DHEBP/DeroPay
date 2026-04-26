import { findById, SALES_CHANNELS } from "@/lib/commerce";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const channel = findById(SALES_CHANNELS, id);
  if (!channel) {
    return Response.json(
      { error: "not_found", message: `Sales channel ${id} not found` },
      { status: 404 },
    );
  }
  return Response.json({ channel });
}
