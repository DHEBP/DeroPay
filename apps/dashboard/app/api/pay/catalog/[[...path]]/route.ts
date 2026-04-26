import type { CommerceProduct } from "@/lib/commerce";
import {
  addVariant,
  applyBulkCatalogEdits,
  applyVariantCsv,
  catalogTaxonomyPayload,
  commerceStatic,
  createCatalogTaxonomy,
  findStoredProduct,
  listCommerceProducts,
  listInventory,
  listPriceLists,
  listStockLocations,
  parseVariantCsv,
  patchProduct,
  patchVariant,
  upsertProduct,
} from "@/lib/commerce-mock-store";

type Ctx = { params: Promise<{ path?: string[] }> };

function catalogPayload(products = listCommerceProducts()) {
  return {
    products,
    total: products.length,
    categories: commerceStatic.categories,
    collections: commerceStatic.collections,
    tags: commerceStatic.tags,
    types: commerceStatic.types,
    salesChannels: commerceStatic.salesChannels,
    inventory: listInventory(),
    stockLocations: listStockLocations(),
    priceLists: listPriceLists(),
  };
}

function csvEscape(value: unknown): string {
  const raw = String(value ?? "");
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function variantCsv(products: CommerceProduct[]): string {
  const headers = [
    "product_handle",
    "product_title",
    "product_status",
    "variant_id",
    "variant_title",
    "sku",
    "price_atomic",
    "currency",
    "manage_inventory",
    "allow_backorder",
    "channels",
    "options",
  ];
  const rows = products.flatMap((product) =>
    product.variants.map((variant) => [
      product.handle,
      product.name,
      product.status,
      variant.id,
      variant.title,
      variant.sku,
      variant.priceAtomic,
      variant.currency,
      variant.manageInventory,
      variant.allowBackorder,
      variant.channelIds.join("|"),
      Object.entries(variant.options)
        .map(([key, value]) => `${key}:${value}`)
        .join("|"),
    ]),
  );
  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = (await req.json()) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { path = [] } = await ctx.params;
  const [resource, id] = path;
  const url = new URL(req.url);

  if (!resource || resource === "products") {
    if (id) {
      const product = findStoredProduct(decodeURIComponent(id));
      if (!product) {
        return Response.json(
          { error: "not_found", message: `Product ${id} not found` },
          { status: 404 },
        );
      }
      return Response.json({ product });
    }

    let rows = listCommerceProducts();
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.trim().toLowerCase();
    if (status) rows = rows.filter((product) => product.status === status);
    if (q) {
      rows = rows.filter((product) =>
        `${product.name} ${product.handle} ${product.description} ${product.variants
          .map((variant) => `${variant.title} ${variant.sku}`)
          .join(" ")}`
          .toLowerCase()
          .includes(q),
      );
    }
    return Response.json(catalogPayload(rows));
  }

  if (resource === "taxonomy") {
    return Response.json(catalogTaxonomyPayload());
  }

  if (resource === "bulk-editor") {
    return Response.json({
      rows: listCommerceProducts().flatMap((product) =>
        product.variants.map((variant) => ({
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantTitle: variant.title,
          sku: variant.sku,
          priceAtomic: variant.priceAtomic,
          currency: variant.currency,
          inventoryItemId: variant.inventoryItemId,
          channelIds: variant.channelIds,
        })),
      ),
      priceLists: listPriceLists(),
      inventory: listInventory(),
      channels: commerceStatic.salesChannels,
    });
  }

  if (resource === "export") {
    return new Response(variantCsv(listCommerceProducts()), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="deropay-product-variants.csv"',
      },
    });
  }

  return Response.json(
    { error: "not_found", message: `Unknown catalog resource: ${resource}` },
    { status: 404 },
  );
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { path = [] } = await ctx.params;
  const [resource, id] = path;
  const body = await readBody(req);

  if (!resource || resource === "products") {
    return Response.json({ product: upsertProduct(body) }, { status: 201 });
  }

  if (resource === "variants") {
    const productId = typeof body.productId === "string" ? body.productId : id;
    if (!productId) {
      return Response.json(
        { error: "invalid_product", message: "productId is required" },
        { status: 400 },
      );
    }
    const variant = addVariant(productId, body);
    if (!variant) {
      return Response.json(
        { error: "not_found", message: `Product ${productId} not found` },
        { status: 404 },
      );
    }
    return Response.json({ variant }, { status: 201 });
  }

  if (resource === "bulk-edit") {
    const edits = Array.isArray(body.edits) ? body.edits : [];
    const updated = applyBulkCatalogEdits(edits);
    return Response.json({
      status: "accepted",
      updated,
      preview: edits.slice(0, 10),
      appliedAt: new Date().toISOString(),
    });
  }

  if (resource === "import") {
    const csv = String(body.csv ?? "");
    const preview = parseVariantCsv(csv);
    const applied = body.apply === true ? applyVariantCsv(preview) : 0;
    return Response.json({
      preview,
      totalRows: preview.rows.length,
      validRows: preview.rows.filter((row) => row.errors.length === 0).length,
      applied,
    });
  }

  if (resource === "taxonomy") {
    return Response.json({
      status: "accepted",
      ...createCatalogTaxonomy(body),
    });
  }

  return Response.json(
    { error: "not_found", message: `Unknown catalog action: ${resource}` },
    { status: 404 },
  );
}

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  const { path = [] } = await ctx.params;
  const [resource, id] = path;
  const body = await readBody(req);

  if (resource === "products" && id) {
    const product = patchProduct(decodeURIComponent(id), body);
    if (!product) {
      return Response.json(
        { error: "not_found", message: `Product ${id} not found` },
        { status: 404 },
      );
    }
    return Response.json({ product });
  }

  if (resource === "variants" && id) {
    const variant = patchVariant(id, body);
    if (!variant) {
      return Response.json(
        { error: "not_found", message: `Variant ${id} not found` },
        { status: 404 },
      );
    }
    return Response.json({ variant });
  }

  return Response.json(
    { error: "not_found", message: `Unknown catalog patch target: ${path.join("/")}` },
    { status: 404 },
  );
}
