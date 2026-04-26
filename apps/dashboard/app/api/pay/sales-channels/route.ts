import { SALES_CHANNELS } from "@/lib/commerce";

export function GET(req: Request): Response {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  let rows = SALES_CHANNELS;
  if (status) rows = rows.filter((channel) => channel.status === status);
  if (type) rows = rows.filter((channel) => channel.type === type);

  return Response.json({ channels: rows, total: rows.length });
}
