import {
  errorJson,
  isDemoMode,
  json,
  parseLimit,
  readJsonBody,
  recordEventBestEffort,
  resolveDashboardStore,
} from "../../_lib/local";
import type { DisputeStatus } from "@/lib/commerce-types";

const DISPUTE_STATUSES: readonly DisputeStatus[] = [
  "open",
  "under_review",
  "resolved",
  "lost",
  "refunded",
];

function isDisputeStatus(value: string): value is DisputeStatus {
  return (DISPUTE_STATUSES as readonly string[]).includes(value);
}

export async function GET(req: Request): Promise<Response> {
  if (await isDemoMode()) return json({ disputes: [], total: 0 });

  const store = await resolveDashboardStore();
  if (!store || typeof store.listDisputes !== "function") {
    return errorJson("store_unavailable", "Dispute store is unavailable", 503);
  }

  const url = new URL(req.url);
  const limit = parseLimit(url, 100, 500);
  if (limit instanceof Response) return limit;
  const statusRaw = url.searchParams.get("status");
  const invoiceId = url.searchParams.get("invoiceId") || undefined;

  let status: DisputeStatus | undefined;
  if (statusRaw) {
    if (!isDisputeStatus(statusRaw)) {
      return errorJson("invalid_status", "Invalid dispute status", 400);
    }
    status = statusRaw;
  }

  try {
    const disputes = store.listDisputes({ status, invoiceId, limit });
    return json({ disputes, total: disputes.length });
  } catch (err) {
    return errorJson(
      "list_failed",
      err instanceof Error ? err.message : "Failed to list disputes",
      500
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  if (await isDemoMode()) {
    return errorJson("demo_mode", "Dispute creation is disabled in demo mode", 503);
  }

  const body = await readJsonBody(req);
  if (!body) return errorJson("invalid_body", "Invalid JSON body", 400);

  const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes : undefined;

  if (!invoiceId) return errorJson("invalid_invoice_id", "invoiceId is required", 400);
  if (!reason || reason.length > 1000) {
    return errorJson("invalid_reason", "reason must be 1..1000 characters", 400);
  }

  const store = await resolveDashboardStore();
  if (
    !store ||
    typeof store.createDispute !== "function" ||
    typeof store.getInvoice !== "function"
  ) {
    return errorJson("store_unavailable", "Dispute store is unavailable", 503);
  }

  try {
    const invoice = await store.getInvoice(invoiceId);
    if (!invoice) return errorJson("invoice_not_found", `Invoice ${invoiceId} not found`, 404);

    const dispute = store.createDispute({ invoiceId, reason, notes });
    await recordEventBestEffort(store, {
      type: "dispute.created",
      invoiceId,
      payload: { disputeId: dispute.id, invoiceId, reason: dispute.reason },
    });
    return json(dispute, { status: 201 });
  } catch (err) {
    return errorJson(
      "create_failed",
      err instanceof Error ? err.message : "Failed to create dispute",
      500
    );
  }
}
