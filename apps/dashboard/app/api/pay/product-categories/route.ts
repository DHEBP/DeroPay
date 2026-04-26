import { PRODUCT_CATEGORIES } from "@/lib/commerce";

export function GET(): Response {
  return Response.json({
    categories: PRODUCT_CATEGORIES,
    total: PRODUCT_CATEGORIES.length,
  });
}
