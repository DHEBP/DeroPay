import { extensibleResponse } from "@/lib/extensible-response";

export async function GET() {
  return extensibleResponse(
    "products",
    "Add your own product catalog implementation.",
    [
      "GET /api/pay/products — list all products",
      "GET /api/pay/products/:id — product detail",
      "Query params: ?active, ?category, ?limit",
    ],
  );
}

export async function POST() {
  return extensibleResponse(
    "products",
    "Add your own product creation implementation.",
    [
      "POST /api/pay/products — create a product",
      "Body: { name, description?, amount, currency?, recurring? }",
    ],
  );
}
