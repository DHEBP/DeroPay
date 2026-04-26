import { listInvoicesHandler } from "@/lib/engine";
import {
  activePriceLists,
  mapInvoiceToOrder,
  priceListCoverage,
  PRODUCT_CATEGORIES,
  PRODUCT_COLLECTIONS,
  PRODUCT_TAGS,
  PRODUCT_TYPES,
  PROMOTIONS,
  SALES_CHANNELS,
  variantCount,
  type InvoiceRow,
} from "@/lib/commerce";
import {
  applyOrderOverlays,
  listCommerceProducts,
  listInventory,
  listPriceLists,
  listStockLocations,
} from "@/lib/commerce-mock-store";

async function loadOrders(req: Request) {
  try {
    const upstream = await listInvoicesHandler(req);
    if (!upstream.ok) return [];
    const invoices = (await upstream.json()) as InvoiceRow[];
    return applyOrderOverlays(invoices.map(mapInvoiceToOrder));
  } catch {
    return [];
  }
}

export async function GET(req: Request): Promise<Response> {
  const orders = await loadOrders(req);
  const products = listCommerceProducts();
  const inventory = listInventory();
  const priceLists = listPriceLists();
  const stockLocations = listStockLocations();
  const openOrders = orders.filter(
    (order) =>
      order.orderStatus === "pending" ||
      order.orderStatus === "processing" ||
      order.orderStatus === "requires_attention",
  );
  const inventoryAlerts = inventory.filter(
    (item) => item.status === "low_stock" || item.status === "out_of_stock",
  );
  const reservedUnits = inventory.reduce(
    (sum, item) => sum + item.reservedQuantity,
    0,
  );
  const availableUnits = inventory.reduce(
    (sum, item) => sum + item.availableQuantity,
    0,
  );
  const activePromotions = PROMOTIONS.filter((promo) => promo.status === "active");

  return Response.json({
    orders: {
      total: orders.length,
      open: openOrders.length,
      attention: orders.filter((order) => order.orderStatus === "requires_attention").length,
    },
    catalog: {
      products: products.length,
      published: products.filter((product) => product.status === "published").length,
      variants: variantCount(products),
      categories: PRODUCT_CATEGORIES.length,
      collections: PRODUCT_COLLECTIONS.length,
      tags: PRODUCT_TAGS.length,
      types: PRODUCT_TYPES.length,
    },
    inventory: {
      items: inventory.length,
      stockLocations: stockLocations.length,
      alerts: inventoryAlerts.length,
      reservedUnits,
      availableUnits,
    },
    pricing: {
      priceLists: priceLists.length,
      active: activePriceLists(priceLists).length,
      scheduled: priceLists.filter((list) => list.status === "scheduled").length,
      variantCoverage: priceListCoverage(priceLists),
    },
    growth: {
      promotions: PROMOTIONS.length,
      activePromotions: activePromotions.length,
    },
    salesChannels: SALES_CHANNELS,
  });
}
