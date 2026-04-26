import {
  errorJson,
  isDemoMode,
  json,
  resolveDashboardStore,
} from "../../_lib/local";

export async function GET(req: Request): Promise<Response> {
  if (await isDemoMode()) return json({ cohorts: [] });

  const store = await resolveDashboardStore();
  if (!store || typeof store.reportCustomerCohorts !== "function") {
    return errorJson("store_unavailable", "Customer cohort reports are unavailable", 503);
  }

  const url = new URL(req.url);
  const raw = url.searchParams.get("months");
  const months = raw ? Number.parseInt(raw, 10) : 12;
  if (!Number.isInteger(months) || months < 3 || months > 24) {
    return errorJson("invalid_months", "months must be an integer between 3 and 24", 400);
  }

  try {
    const report = await store.reportCustomerCohorts({ months });
    return json({ cohorts: report.cohorts });
  } catch (err) {
    return errorJson(
      "report_failed",
      err instanceof Error ? err.message : "Failed to build cohorts",
      500
    );
  }
}
