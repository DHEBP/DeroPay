import {
  errorJson,
  isDemoMode,
  json,
  readJsonBody,
  recordEventBestEffort,
  resolveDashboardStore,
} from "../../../../_lib/local";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!id) return errorJson("invalid_id", "Missing dispute id", 400);
  if (await isDemoMode()) {
    return errorJson("demo_mode", "Dispute status changes are disabled in demo mode", 503);
  }

  const body = await readJsonBody(req);
  if (!body) return errorJson("invalid_body", "Invalid JSON body", 400);

  const status = typeof body.status === "string" ? body.status : "";
  if (status !== "resolved" && status !== "lost") {
    return errorJson("invalid_status", "status must be resolved or lost", 400);
  }

  const notes = typeof body.notes === "string" ? body.notes : undefined;
  const store = await resolveDashboardStore();
  if (
    !store ||
    typeof store.getDispute !== "function" ||
    typeof store.updateDisputeStatus !== "function"
  ) {
    return errorJson("store_unavailable", "Dispute store is unavailable", 503);
  }

  const existing = store.getDispute(id);
  if (!existing) return errorJson("not_found", `Dispute ${id} not found`, 404);

  try {
    const dispute = store.updateDisputeStatus(id, { status, notes });
    await recordEventBestEffort(store, {
      type: status === "resolved" ? "dispute.resolved" : "dispute.lost",
      invoiceId: dispute.invoiceId,
      payload: {
        disputeId: dispute.id,
        invoiceId: dispute.invoiceId,
        status: dispute.status,
      },
    });
    return json(dispute);
  } catch (err) {
    return errorJson(
      "update_failed",
      err instanceof Error ? err.message : "Failed to update dispute",
      409
    );
  }
}
