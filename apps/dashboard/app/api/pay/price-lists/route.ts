import { listPriceLists } from "@/lib/commerce-mock-store";

export function GET(req: Request): Response {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const channelId = url.searchParams.get("channelId");

  let rows = listPriceLists();
  if (status) rows = rows.filter((list) => list.status === status);
  if (type) rows = rows.filter((list) => list.type === type);
  if (channelId) {
    rows = rows.filter((list) => list.salesChannelIds.includes(channelId));
  }

  return Response.json({ priceLists: rows, total: rows.length });
}
