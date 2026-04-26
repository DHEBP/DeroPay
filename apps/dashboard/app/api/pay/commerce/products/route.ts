import { commerceStatic, listCommerceProducts } from "@/lib/commerce-mock-store";

export function GET(req: Request): Response {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const categoryId = url.searchParams.get("categoryId");
  const collectionId = url.searchParams.get("collectionId");
  const channelId = url.searchParams.get("channelId");
  const q = url.searchParams.get("q")?.trim().toLowerCase();

  let rows = listCommerceProducts();
  if (status) rows = rows.filter((product) => product.status === status);
  if (categoryId) {
    rows = rows.filter((product) => product.categoryIds.includes(categoryId));
  }
  if (collectionId) {
    rows = rows.filter((product) => product.collectionIds.includes(collectionId));
  }
  if (channelId) {
    rows = rows.filter((product) => product.salesChannelIds.includes(channelId));
  }
  if (q) {
    rows = rows.filter((product) => {
      const variantText = product.variants
        .map((variant) => `${variant.title} ${variant.sku}`)
        .join(" ");
      return `${product.name} ${product.handle} ${product.description} ${variantText}`
        .toLowerCase()
        .includes(q);
    });
  }

  return Response.json({
    products: rows,
    total: rows.length,
    categories: commerceStatic.categories,
    collections: commerceStatic.collections,
    tags: commerceStatic.tags,
    types: commerceStatic.types,
    salesChannels: commerceStatic.salesChannels,
  });
}
