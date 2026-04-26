import { listInventory } from "@/lib/commerce-mock-store";

export function GET(req: Request): Response {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const locationId = url.searchParams.get("locationId");

  let rows = listInventory();
  if (status) rows = rows.filter((item) => item.status === status);
  if (locationId) rows = rows.filter((item) => item.locationId === locationId);

  return Response.json({ inventory: rows, total: rows.length });
}
