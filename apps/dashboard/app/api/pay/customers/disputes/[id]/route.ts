import {
  errorJson,
  isDemoMode,
  json,
  resolveDashboardStore,
} from "../../../_lib/local";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!id) return errorJson("invalid_id", "Missing dispute id", 400);
  if (await isDemoMode()) return errorJson("demo_mode", "Demo mode", 503);

  const store = await resolveDashboardStore();
  if (!store || typeof store.getDispute !== "function") {
    return errorJson("store_unavailable", "Dispute store is unavailable", 503);
  }

  const dispute = store.getDispute(id);
  if (!dispute) return errorJson("not_found", `Dispute ${id} not found`, 404);
  return json(dispute);
}
