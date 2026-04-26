import { findById } from "@/lib/commerce";
import { listInventory } from "@/lib/commerce-mock-store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const item = findById(listInventory(), id);
  if (!item) {
    return Response.json(
      { error: "not_found", message: `Inventory item ${id} not found` },
      { status: 404 },
    );
  }
  return Response.json({ item });
}
