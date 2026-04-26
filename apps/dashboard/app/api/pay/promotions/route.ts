import { PROMOTIONS } from "@/lib/commerce";

export function GET(req: Request): Response {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  let rows = PROMOTIONS;
  if (status) rows = rows.filter((promo) => promo.status === status);
  if (type) rows = rows.filter((promo) => promo.type === type);

  return Response.json({ promotions: rows, total: rows.length });
}
