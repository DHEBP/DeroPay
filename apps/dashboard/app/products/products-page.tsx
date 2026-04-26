"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive,
  BadgeDollarSign,
  CheckCircle,
  Copy,
  Download,
  Eye,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  Link2,
  Package,
  Pencil,
  Plus,
  QrCode,
  Repeat2,
  SlidersHorizontal,
  Store,
  Tag,
  Tags,
  Upload,
  Warehouse,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  ActionCluster,
  CommerceChecklist,
  CommercePanelHeader,
} from "@/components/commerce/commerce-ui";
import { Badge, Button, Drawer, Input, Select, TextArea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { formatDero, formatDate, truncate } from "@/lib/format";
import type {
  CommerceProduct,
  InventoryItem,
  PriceList,
  ProductCategory,
  ProductCollection,
  ProductVariant,
  ProductTag,
  ProductType,
  SalesChannel,
  StockLocation,
} from "@/lib/commerce";
import type {
  PaymentLink,
  Product,
  ProductCurrency,
  Subscription,
  SubscriptionCadence,
  SubscriptionInvoice,
  SubscriptionStatus,
} from "@/lib/commerce-types";
import { useInitialTestMode } from "@/lib/test-mode-context";

/** Gateway public base URL (user-facing for `/l/:slug`). */
const GATEWAY_PUBLIC_URL = (
  process.env.NEXT_PUBLIC_DEROPAY_GATEWAY_URL ?? "http://localhost:3080"
).replace(/\/+$/, "");

/** Atomic-unit scale is 1e5 for DERO. USD prices flow through the same pipe. */
const ATOMIC_PER_UNIT = 100_000; // 1e5

// ---------------------------------------------------------------------------
// Demo-mode fixtures
// ---------------------------------------------------------------------------

const now = Date.now();
const day = 86_400_000;

const DEMO_PRODUCTS: Product[] = [
  {
    id: "prd_demo_01",
    slug: "privacy-audit-pack",
    name: "Privacy Audit Pack",
    description:
      "Comprehensive privacy review of your DERO integration with an actionable remediation report.",
    priceAtomic: "12000000", // 120 DERO
    currency: "DERO",
    imageUrl: null,
    active: true,
    createdAt: now - 40 * day,
    updatedAt: now - 2 * day,
    archivedAt: null,
  },
  {
    id: "prd_demo_02",
    slug: "deropay-starter",
    name: "DeroPay Starter",
    description:
      "Hosted gateway, dashboard, and checkout widget for small merchants.",
    priceAtomic: "2500000", // 25 DERO
    currency: "DERO",
    imageUrl: null,
    active: true,
    createdAt: now - 60 * day,
    updatedAt: now - 10 * day,
    archivedAt: null,
  },
  {
    id: "prd_demo_03",
    slug: "audit-hour",
    name: "Audit hour",
    description: "One-hour audit consultation with a senior DERO engineer.",
    priceAtomic: "15000000", // $150 (USD pipeline)
    currency: "USD",
    imageUrl: null,
    active: true,
    createdAt: now - 20 * day,
    updatedAt: now - 20 * day,
    archivedAt: null,
  },
  {
    id: "prd_demo_04",
    slug: "tela-bracket-entry",
    name: "TELA Bracket entry",
    description: "March Madness pool seat — one bracket per entry.",
    priceAtomic: "500000", // 5 DERO
    currency: "DERO",
    imageUrl: null,
    active: true,
    createdAt: now - 14 * day,
    updatedAt: now - 14 * day,
    archivedAt: null,
  },
  {
    id: "prd_demo_05",
    slug: "legacy-bundle",
    name: "Legacy bundle",
    description: "Pre-Phase 8 API bundle. Archived — kept for historical links.",
    priceAtomic: "6000000",
    currency: "DERO",
    imageUrl: null,
    active: false,
    createdAt: now - 200 * day,
    updatedAt: now - 150 * day,
    archivedAt: now - 150 * day,
  },
  {
    id: "prd_demo_06",
    slug: "mining-tune",
    name: "Dirtybird mining tune",
    description: "Per-CPU SPSA auto-tune profile delivered as a text manifest.",
    priceAtomic: "1000000",
    currency: "DERO",
    imageUrl: null,
    active: true,
    createdAt: now - 7 * day,
    updatedAt: now - 7 * day,
    archivedAt: null,
  },
];

const DEMO_LINKS: PaymentLink[] = [
  {
    id: "lnk_demo_01",
    slug: "privacy-audit-pack",
    productId: "prd_demo_01",
    name: "Privacy Audit Pack",
    amountAtomic: null,
    currency: null,
    ttlSeconds: 3600,
    usesCount: 47,
    maxUses: null,
    createdAt: now - 30 * day,
    archivedAt: null,
  },
  {
    id: "lnk_demo_02",
    slug: "audit-hour",
    productId: "prd_demo_03",
    name: "Audit hour",
    amountAtomic: null,
    currency: null,
    ttlSeconds: 7200,
    usesCount: 8,
    maxUses: 100,
    createdAt: now - 20 * day,
    archivedAt: null,
  },
  {
    id: "lnk_demo_03",
    slug: "bracket-2026",
    productId: "prd_demo_04",
    name: "TELA Bracket entry",
    amountAtomic: null,
    currency: null,
    ttlSeconds: 1800,
    usesCount: 132,
    maxUses: 500,
    createdAt: now - 10 * day,
    archivedAt: null,
  },
  {
    id: "lnk_demo_04",
    slug: "tip-jar",
    productId: null,
    name: "Tip jar",
    amountAtomic: "100000", // 1 DERO ad-hoc
    currency: "DERO",
    ttlSeconds: 3600,
    usesCount: 19,
    maxUses: null,
    createdAt: now - 14 * day,
    archivedAt: null,
  },
  {
    id: "lnk_demo_05",
    slug: "launch-sale-25",
    productId: null,
    name: "Launch sale — $25",
    amountAtomic: "2500000",
    currency: "USD",
    ttlSeconds: 3600,
    usesCount: 3,
    maxUses: 250,
    createdAt: now - 2 * day,
    archivedAt: null,
  },
];

const DEMO_SUBSCRIPTIONS: Subscription[] = [
  {
    id: "sub_demo_01",
    productId: "prd_demo_02",
    customerIdentifier: "alice@example.com",
    cadence: "monthly",
    status: "active",
    nextInvoiceAt: now + 12 * day,
    processingAt: null,
    createdAt: now - 90 * day,
    cancelledAt: null,
    pausedAt: null,
    totalInvoices: 3,
  },
  {
    id: "sub_demo_02",
    productId: "prd_demo_01",
    customerIdentifier: "team@acme.io",
    cadence: "quarterly",
    status: "active",
    nextInvoiceAt: now + 40 * day,
    processingAt: null,
    createdAt: now - 120 * day,
    cancelledAt: null,
    pausedAt: null,
    totalInvoices: 2,
  },
  {
    id: "sub_demo_03",
    productId: "prd_demo_02",
    customerIdentifier: "bob@example.com",
    cadence: "monthly",
    status: "paused",
    nextInvoiceAt: now + 5 * day,
    processingAt: null,
    createdAt: now - 60 * day,
    cancelledAt: null,
    pausedAt: now - 3 * day,
    totalInvoices: 2,
  },
  {
    id: "sub_demo_04",
    productId: "prd_demo_06",
    customerIdentifier: "carol@example.com",
    cadence: "annual",
    status: "ended",
    nextInvoiceAt: now - 10 * day,
    processingAt: null,
    createdAt: now - 400 * day,
    cancelledAt: now - 30 * day,
    pausedAt: null,
    totalInvoices: 1,
  },
];

const DEMO_SUB_INVOICES: SubscriptionInvoice[] = [
  {
    id: "subi_demo_01",
    subscriptionId: "sub_demo_01",
    invoiceId: "inv_5101",
    cycleIndex: 1,
    createdAt: now - 90 * day,
  },
  {
    id: "subi_demo_02",
    subscriptionId: "sub_demo_01",
    invoiceId: "inv_5180",
    cycleIndex: 2,
    createdAt: now - 60 * day,
  },
  {
    id: "subi_demo_03",
    subscriptionId: "sub_demo_01",
    invoiceId: "inv_5260",
    cycleIndex: 3,
    createdAt: now - 30 * day,
  },
  {
    id: "subi_demo_04",
    subscriptionId: "sub_demo_02",
    invoiceId: "inv_5055",
    cycleIndex: 1,
    createdAt: now - 120 * day,
  },
  {
    id: "subi_demo_05",
    subscriptionId: "sub_demo_02",
    invoiceId: "inv_5200",
    cycleIndex: 2,
    createdAt: now - 30 * day,
  },
  {
    id: "subi_demo_06",
    subscriptionId: "sub_demo_03",
    invoiceId: "inv_5070",
    cycleIndex: 1,
    createdAt: now - 60 * day,
  },
  {
    id: "subi_demo_07",
    subscriptionId: "sub_demo_03",
    invoiceId: "inv_5150",
    cycleIndex: 2,
    createdAt: now - 30 * day,
  },
  {
    id: "subi_demo_08",
    subscriptionId: "sub_demo_04",
    invoiceId: "inv_4800",
    cycleIndex: 1,
    createdAt: now - 400 * day,
  },
];

// ---------------------------------------------------------------------------
// Types + helpers
// ---------------------------------------------------------------------------

type TabId = "catalog" | "links" | "subscriptions";

type CommerceCatalogPayload = {
  products: CommerceProduct[];
  total: number;
  categories: ProductCategory[];
  collections: ProductCollection[];
  tags: ProductTag[];
  types: ProductType[];
  salesChannels: SalesChannel[];
  inventory?: InventoryItem[];
  stockLocations?: StockLocation[];
  priceLists?: PriceList[];
};

type PriceListsPayload = {
  priceLists: PriceList[];
  total: number;
};

type ApiError = { error?: { code?: string; message?: string } | string };

function extractError(body: ApiError | null, fallback: string): string {
  if (!body) return fallback;
  if (typeof body.error === "string") return body.error;
  if (body.error && typeof body.error === "object" && body.error.message) {
    return body.error.message;
  }
  return fallback;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* no body */
    }
    throw new Error(extractError(body, `Request failed (${res.status})`));
  }
  return (await res.json()) as T;
}

function toAtomic(displayValue: string): bigint | null {
  const n = Number(displayValue);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.round(n * ATOMIC_PER_UNIT));
}

/** Construct the public share URL for a payment link slug. */
function paymentLinkUrl(slug: string): string {
  return `${GATEWAY_PUBLIC_URL}/l/${encodeURIComponent(slug)}`;
}

function cadenceLabel(c: SubscriptionCadence): string {
  return c === "monthly" ? "Monthly" : c === "quarterly" ? "Quarterly" : "Annual";
}

function ttlLabel(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------

export function ProductsPage() {
  const isDemo = useInitialTestMode();
  const [tab, setTab] = useState<TabId>("catalog");

  // Products are shared across tabs so link/subscription rows can join by id.
  const [products, setProducts] = useState<Product[]>(
    isDemo ? DEMO_PRODUCTS : []
  );
  const [productsLoading, setProductsLoading] = useState(!isDemo);
  const [productsError, setProductsError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (isDemo) {
      setProducts(DEMO_PRODUCTS);
      setProductsLoading(false);
      return;
    }
    setProductsLoading(true);
    setProductsError(null);
    try {
      const data = await apiFetch<{ products: Product[] }>(
        "/api/pay/products?includeArchived=true"
      );
      setProducts(data.products ?? []);
    } catch (err) {
      setProductsError(
        err instanceof Error ? err.message : "Failed to load products"
      );
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Catalog, variants, product taxonomy, inventory binding, price-list coverage, and payment-link backed selling."
      />

      <Tabs
        current={tab}
        onChange={setTab}
        items={[
          { id: "catalog", label: "Catalog", Icon: Package },
          { id: "links", label: "Payment Links", Icon: Link2 },
          { id: "subscriptions", label: "Subscriptions", Icon: Repeat2 },
        ]}
      />

      <div style={{ marginTop: 18 }}>
        {tab === "catalog" && (
          <CatalogTab
            products={products}
            loading={productsLoading}
            error={productsError}
            reload={fetchProducts}
            setProducts={setProducts}
          />
        )}
        {tab === "links" && <LinksTab products={products} />}
        {tab === "subscriptions" && (
          <SubscriptionsTab products={products} />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function Tabs({
  current,
  onChange,
  items,
}: {
  current: TabId;
  onChange: (t: TabId) => void;
  items: Array<{ id: TabId; label: string; Icon: typeof Package }>;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--ink-hair)",
        padding: "0 2px",
      }}
    >
      {items.map(({ id, label, Icon }) => {
        const active = id === current;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${active ? "var(--dero)" : "transparent"}`,
              color: active ? "var(--bone)" : "var(--bone-quiet)",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              cursor: "pointer",
              marginBottom: -1,
              transition: "color 0.15s var(--ease-out)",
            }}
          >
            <Icon size={13} strokeWidth={2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ===========================================================================
// TAB 1 · Catalog (grid of cards)
// ===========================================================================

function CatalogTab({
  products,
  loading,
  error,
  reload,
  setProducts,
}: {
  products: Product[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
}) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState<
    { mode: "create" } | { mode: "edit"; product: Product } | null
  >(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(true);

  const visible = useMemo(() => {
    return products.filter((p) => {
      if (activeOnly && !p.active) return false;
      if (!includeArchived && p.archivedAt) return false;
      return true;
    });
  }, [products, activeOnly, includeArchived]);

  const archive = useCallback(
    async (p: Product) => {
      if (!confirm(`Archive "${p.name}"? Existing links keep working.`)) return;
      if (isDemo) {
        setProducts((prev) =>
          prev.map((x) =>
            x.id === p.id
              ? { ...x, active: false, archivedAt: Date.now() }
              : x
          )
        );
        toast({ title: "Product archived", tone: "info" });
        return;
      }
      try {
        await apiFetch(
          `/api/pay/products/${encodeURIComponent(p.id)}/archive`,
          { method: "POST" }
        );
        toast({ title: "Product archived", tone: "success" });
        reload();
      } catch (err) {
        toast({
          title: "Archive failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [reload, setProducts, toast]
  );

  const copySlug = useCallback(
    async (slug: string) => {
      try {
        await navigator.clipboard.writeText(slug);
        toast({ title: "Slug copied", tone: "success" });
      } catch {
        toast({ title: "Couldn't copy", tone: "error" });
      }
    },
    [toast]
  );

  const onSaved = useCallback(
    (p: Product, mode: "create" | "edit") => {
      if (isDemo) {
        if (mode === "create") {
          setProducts((prev) => [p, ...prev]);
        } else {
          setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        }
      } else {
        reload();
      }
      setShowModal(null);
      toast({
        title: mode === "create" ? "Product created" : "Product updated",
        tone: "success",
      });
    },
    [reload, setProducts, toast]
  );

  return (
    <>
      <SectionHeader
        title="Catalog"
        subtitle="Every product available in your store. Each carries a DERO or USD listed price and a slug used to build payment links."
        action={
          <button
            className="btn btn-primary btn-mini"
            onClick={() => setShowModal({ mode: "create" })}
          >
            <Plus size={12} /> New product
          </button>
        }
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <FilterToggle
          label="Active only"
          checked={activeOnly}
          onChange={setActiveOnly}
        />
        <FilterToggle
          label="Include archived"
          checked={includeArchived}
          onChange={setIncludeArchived}
        />
        <div style={{ flex: 1 }} />
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--bone-quiet)" }}
        >
          {visible.length} product{visible.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <CatalogModelPanel />

      {loading ? (
        <LoadingCard label="Loading products…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Package size={22} strokeWidth={1.6} />}
          title={
            products.length === 0 ? "No products yet" : "No products match"
          }
          description={
            products.length === 0
              ? "Add a product to start selling — each product can back payment links and subscriptions."
              : "Toggle the filters above to see more products."
          }
          action={
            products.length === 0 ? (
              <button
                className="btn btn-primary"
                onClick={() => setShowModal({ mode: "create" })}
                style={{ padding: "9px 16px", fontSize: 13 }}
              >
                <Plus size={14} strokeWidth={2.2} /> New product
              </button>
            ) : undefined
          }
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onEdit={() => setShowModal({ mode: "edit", product: p })}
              onArchive={() => archive(p)}
              onCopySlug={() => copySlug(p.slug)}
            />
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {showModal && (
          <ProductModal
            key={showModal.mode === "edit" ? showModal.product.id : "create"}
            mode={showModal.mode}
            product={showModal.mode === "edit" ? showModal.product : null}
            onClose={() => setShowModal(null)}
            onSaved={onSaved}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function CatalogModelPanel() {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<CommerceCatalogPayload | null>(null);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"overview" | "bulk" | "import">("overview");
  const [selectedProduct, setSelectedProduct] = useState<CommerceProduct | null>(null);
  const [csvInput, setCsvInput] = useState(
    "product_handle,variant_title,sku,price_atomic,currency\n" +
      "dero-hoodie,Black / XL,DERO-HOODIE-XL,8500000,DERO",
  );
  const [importPreview, setImportPreview] = useState<{
    totalRows: number;
    validRows: number;
    preview: {
      rows: Array<{
        rowNumber: number;
        productHandle: string;
        variantTitle: string;
        sku: string;
        priceAtomic: string;
        currency: string;
        errors: string[];
      }>;
    };
  } | null>(null);

  const loadCatalog = useCallback(async (cancelled?: () => boolean) => {
    try {
      const [catalogData, pricingData] = await Promise.all([
        apiFetch<CommerceCatalogPayload>("/api/pay/catalog/products"),
        apiFetch<PriceListsPayload>("/api/pay/price-lists"),
      ]);
      if (cancelled?.()) return;
      setCatalog(catalogData);
      setPriceLists(catalogData.priceLists ?? pricingData.priceLists ?? []);
      setError(null);
    } catch (err) {
      if (cancelled?.()) return;
      setError(err instanceof Error ? err.message : "Failed to load catalog model");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadCatalog(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadCatalog]);

  const products = catalog?.products ?? [];
  const categoryById = useMemo(
    () => new Map((catalog?.categories ?? []).map((category) => [category.id, category])),
    [catalog?.categories],
  );
  const typeById = useMemo(
    () => new Map((catalog?.types ?? []).map((type) => [type.id, type])),
    [catalog?.types],
  );
  const channelById = useMemo(
    () => new Map((catalog?.salesChannels ?? []).map((channel) => [channel.id, channel])),
    [catalog?.salesChannels],
  );
  const priceListsByVariant = useMemo(() => {
    const map = new Map<string, PriceList[]>();
    for (const list of priceLists) {
      for (const price of list.prices) {
        const rows = map.get(price.variantId) ?? [];
        rows.push(list);
        map.set(price.variantId, rows);
      }
      for (const variantId of list.variantIds) {
        const rows = map.get(variantId) ?? [];
        if (!rows.some((row) => row.id === list.id)) rows.push(list);
        map.set(variantId, rows);
      }
    }
    return map;
  }, [priceLists]);

  const previewImport = useCallback(async () => {
    try {
      const data = await apiFetch<typeof importPreview>("/api/pay/catalog/import", {
        method: "POST",
        body: JSON.stringify({ csv: csvInput }),
      });
      setImportPreview(data);
      toast({ title: "CSV preview ready", tone: "success" });
    } catch (err) {
      toast({
        title: "CSV preview failed",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    }
  }, [csvInput, toast]);

  const applyImport = useCallback(async () => {
    try {
      const data = await apiFetch<(typeof importPreview) & { applied: number }>(
        "/api/pay/catalog/import",
        {
          method: "POST",
          body: JSON.stringify({ csv: csvInput, apply: true }),
        },
      );
      setImportPreview(data);
      await loadCatalog();
      toast({
        title: "CSV import applied",
        description: `${data?.applied ?? 0} variant row${data?.applied === 1 ? "" : "s"} applied`,
        tone: "success",
      });
    } catch (err) {
      toast({
        title: "CSV import failed",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    }
  }, [csvInput, loadCatalog, toast]);

  const applyBulkEdit = useCallback(async () => {
    try {
      const edits = products.flatMap((product) =>
        product.variants.map((variant) => ({
          productId: product.id,
          variantId: variant.id,
          priceAtomic: variant.priceAtomic,
          channelIds: variant.channelIds,
        })),
      );
      await apiFetch("/api/pay/catalog/bulk-edit", {
        method: "POST",
        body: JSON.stringify({ edits }),
      });
      await loadCatalog();
      toast({ title: "Bulk edit accepted", tone: "success" });
    } catch (err) {
      toast({
        title: "Bulk edit failed",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    }
  }, [loadCatalog, products, toast]);

  const summary = useMemo(() => {
    const variants = products.reduce(
      (sum, product) => sum + product.variants.length,
      0,
    );
    const managedVariants = products.reduce(
      (sum, product) =>
        sum + product.variants.filter((variant) => variant.manageInventory).length,
      0,
    );
    const coveredVariants = products.reduce(
      (sum, product) =>
        sum +
        product.variants.filter((variant) => priceListsByVariant.has(variant.id)).length,
      0,
    );
    return {
      published: products.filter((product) => product.status === "published").length,
      variants,
      managedVariants,
      coveredVariants,
    };
  }, [products, priceListsByVariant]);

  const statusTone = (status: CommerceProduct["status"]) => {
    if (status === "published") return "positive";
    if (status === "draft") return "warn";
    return "neutral";
  };

  return (
    <section className="surface" style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
      <CommercePanelHeader
        icon={<Layers size={16} />}
        title="Catalog"
        description="Every product available in your store. Each carries a DERO or USD listed price and a slug used to build payment links."
        actions={
          <ActionCluster>
            {error ? (
              <Badge tone="danger" dotless>
                Offline
              </Badge>
            ) : (
              <Badge tone="positive" dotless>
                Editable
              </Badge>
            )}
            <button
              className="btn btn-ghost btn-mini"
              onClick={() => setMode(mode === "bulk" ? "overview" : "bulk")}
            >
              <SlidersHorizontal size={11} /> Bulk editor
            </button>
            <button
              className="btn btn-ghost btn-mini"
              onClick={() => setMode(mode === "import" ? "overview" : "import")}
            >
              <Upload size={11} /> Import CSV
            </button>
            <a className="btn btn-ghost btn-mini" href="/api/pay/catalog/export" download>
              <Download size={11} /> Export
            </a>
          </ActionCluster>
        }
      />

      {error ? (
        <div style={{ padding: 18, color: "var(--bone-mute)", fontSize: 12.5 }}>
          {error}
        </div>
      ) : !catalog ? (
        <div
          className="mono"
          style={{
            padding: 18,
            color: "var(--bone-quiet)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Loading catalog model...
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              borderBottom: "1px solid var(--ink-hair)",
            }}
          >
            <CatalogMetric
              icon={<Package size={14} />}
              label="Published"
              value={`${summary.published} / ${products.length}`}
            />
            <CatalogMetric
              icon={<Tags size={14} />}
              label="Taxonomy"
              value={`${catalog.categories.length} cat / ${catalog.tags.length} tags`}
            />
            <CatalogMetric
              icon={<Warehouse size={14} />}
              label="Inventory"
              value={`${summary.managedVariants} managed`}
            />
            <CatalogMetric
              icon={<BadgeDollarSign size={14} />}
              label="Price coverage"
              value={`${summary.coveredVariants} / ${summary.variants}`}
            />
          </div>

          {mode === "bulk" && (
            <BulkEditorPanel
              products={products}
              inventory={catalog.inventory ?? []}
              priceListsByVariant={priceListsByVariant}
              onApply={applyBulkEdit}
            />
          )}

          {mode === "import" && (
            <CsvImportPanel
              csvInput={csvInput}
              setCsvInput={setCsvInput}
              preview={importPreview}
              onPreview={previewImport}
              onApply={applyImport}
            />
          )}

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Categories</th>
                  <th>Variants</th>
                  <th>Channels</th>
                  <th>Pricing</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const variantPriceLists = product.variants
                    .flatMap((variant) => priceListsByVariant.get(variant.id) ?? [])
                    .filter(
                      (list, index, all) =>
                        all.findIndex((row) => row.id === list.id) === index,
                    );
                  const categoryNames = product.categoryIds
                    .map((id) => categoryById.get(id)?.name)
                    .filter(Boolean)
                    .join(", ");
                  const channelNames = product.salesChannelIds
                    .map((id) => channelById.get(id)?.name ?? id)
                    .join(", ");
                  const firstVariant = product.variants[0];

                  return (
                    <tr key={product.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{product.name}</div>
                        <div style={{ marginTop: 3, fontSize: 12, color: "var(--bone-mute)" }}>
                          {product.subtitle}
                        </div>
                        <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--bone-mute)" }}>
                          {product.handle}
                        </div>
                      </td>
                      <td>
                        <Badge tone={statusTone(product.status)}>{product.status}</Badge>
                      </td>
                      <td>{typeById.get(product.typeId)?.value ?? product.typeId}</td>
                      <td>{categoryNames || "none"}</td>
                      <td>
                        <div className="mono" style={{ fontSize: 11 }}>
                          {product.variants.length} variant{product.variants.length === 1 ? "" : "s"}
                        </div>
                        {firstVariant && (
                          <div style={{ marginTop: 4, fontSize: 12, color: "var(--bone-mute)" }}>
                            {firstVariant.sku}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Store size={13} color="var(--bone-mute)" />
                          {channelNames}
                        </span>
                      </td>
                      <td>
                        {variantPriceLists.length === 0 ? (
                          <span style={{ color: "var(--bone-mute)" }}>base price only</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {variantPriceLists.map((list) => (
                              <Badge
                                key={list.id}
                                tone={list.status === "active" ? "positive" : "info"}
                                dotless
                              >
                                {list.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => setSelectedProduct(product)}
                        >
                          Details <Eye size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <CommerceProductDrawer
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onChanged={(product) => {
              setSelectedProduct(product);
              void loadCatalog();
            }}
            categories={catalog.categories}
            collections={catalog.collections}
            tags={catalog.tags}
            types={catalog.types}
            channels={catalog.salesChannels}
            categoryById={categoryById}
            typeById={typeById}
            channelById={channelById}
            priceListsByVariant={priceListsByVariant}
            inventory={catalog.inventory ?? []}
            stockLocations={catalog.stockLocations ?? []}
          />
        </>
      )}
    </section>
  );
}

function CatalogMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        minHeight: 82,
        padding: "14px 16px",
        borderRight: "1px solid var(--ink-hair)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--bone-mute)" }}>
        {icon}
        <span className="eyebrow" style={{ fontSize: 10 }}>
          {label}
        </span>
      </div>
      <div className="display" style={{ fontSize: 18, color: "var(--bone)" }}>
        {value}
      </div>
    </div>
  );
}

function BulkEditorPanel({
  products,
  inventory,
  priceListsByVariant,
  onApply,
}: {
  products: CommerceProduct[];
  inventory: InventoryItem[];
  priceListsByVariant: Map<string, PriceList[]>;
  onApply: () => void;
}) {
  const inventoryByVariant = useMemo(
    () => new Map(inventory.map((item) => [item.variantId, item])),
    [inventory],
  );
  const rows = products.flatMap((product) =>
    product.variants.map((variant) => ({
      product,
      variant,
      inventory: inventoryByVariant.get(variant.id) ?? null,
      priceLists: priceListsByVariant.get(variant.id) ?? [],
    })),
  );

  return (
    <section
      style={{
        borderBottom: "1px solid var(--ink-hair)",
        padding: 16,
        background: "var(--ink-elev-1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600 }}>Bulk editor</div>
          <div style={{ fontSize: 12, color: "var(--bone-mute)" }}>
            Variant prices, inventory quantities, price-list coverage, and channel visibility.
          </div>
        </div>
        <button className="btn btn-primary btn-mini" onClick={onApply}>
          Apply mock edit
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Variant</th>
              <th>Base price</th>
              <th>Inventory</th>
              <th>Price lists</th>
              <th>Channels</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ product, variant, inventory: inv, priceLists: lists }) => (
              <tr key={variant.id}>
                <td>{product.name}</td>
                <td>
                  <div>{variant.title}</div>
                  <div className="mono" style={{ marginTop: 3, fontSize: 11, color: "var(--bone-mute)" }}>
                    {variant.sku}
                  </div>
                </td>
                <td>
                  <input
                    className="input input-mono"
                    defaultValue={variant.priceAtomic}
                    aria-label={`${variant.sku} atomic price`}
                    style={{ minWidth: 150 }}
                  />
                </td>
                <td>
                  <input
                    className="input input-mono"
                    defaultValue={inv ? String(inv.availableQuantity) : variant.manageInventory ? "0" : "digital"}
                    aria-label={`${variant.sku} inventory`}
                    style={{ width: 96 }}
                  />
                </td>
                <td>
                  {lists.length === 0 ? (
                    <span style={{ color: "var(--bone-mute)" }}>base only</span>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {lists.map((list) => (
                        <Badge key={list.id} tone={list.status === "active" ? "positive" : "info"} dotless>
                          {list.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  <input
                    className="input input-mono"
                    defaultValue={variant.channelIds.join(", ")}
                    aria-label={`${variant.sku} channel ids`}
                    style={{ minWidth: 180 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CsvImportPanel({
  csvInput,
  setCsvInput,
  preview,
  onPreview,
  onApply,
}: {
  csvInput: string;
  setCsvInput: (value: string) => void;
  preview: {
    totalRows: number;
    validRows: number;
    preview: {
      rows: Array<{
        rowNumber: number;
        productHandle: string;
        variantTitle: string;
        sku: string;
        priceAtomic: string;
        currency: string;
        errors: string[];
      }>;
    };
  } | null;
  onPreview: () => void;
  onApply: () => void;
}) {
  return (
    <section
      style={{
        borderBottom: "1px solid var(--ink-hair)",
        padding: 16,
        background: "var(--ink-elev-1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600 }}>CSV import preview</div>
          <div style={{ fontSize: 12, color: "var(--bone-mute)" }}>
            One row per variant with product handle, SKU, price, currency, and option values.
          </div>
        </div>
        <ActionCluster>
          <button className="btn btn-ghost btn-mini" onClick={onPreview}>
            Preview CSV
          </button>
          <button className="btn btn-primary btn-mini" onClick={onApply}>
            Apply import
          </button>
        </ActionCluster>
      </div>
      <textarea
        className="textarea input-mono"
        value={csvInput}
        onChange={(event) => setCsvInput(event.target.value)}
        rows={5}
        style={{ width: "100%", marginBottom: preview ? 14 : 0 }}
      />
      {preview && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Handle</th>
                <th>Variant</th>
                <th>SKU</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.preview.rows.map((row) => (
                <tr key={row.rowNumber}>
                  <td className="mono">{row.rowNumber}</td>
                  <td>{row.productHandle}</td>
                  <td>{row.variantTitle}</td>
                  <td className="mono">{row.sku}</td>
                  <td className="mono">
                    {row.priceAtomic} {row.currency}
                  </td>
                  <td>
                    <Badge tone={row.errors.length === 0 ? "positive" : "warn"} dotless>
                      {row.errors.length === 0 ? "ready" : row.errors.join(", ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CommerceProductDrawer({
  product,
  onClose,
  onChanged,
  categories,
  collections,
  tags,
  types,
  channels,
  categoryById,
  typeById,
  channelById,
  priceListsByVariant,
  inventory,
  stockLocations,
}: {
  product: CommerceProduct | null;
  onClose: () => void;
  onChanged: (product: CommerceProduct) => void;
  categories: ProductCategory[];
  collections: ProductCollection[];
  tags: ProductTag[];
  types: ProductType[];
  channels: SalesChannel[];
  categoryById: Map<string, ProductCategory>;
  typeById: Map<string, ProductType>;
  channelById: Map<string, SalesChannel>;
  priceListsByVariant: Map<string, PriceList[]>;
  inventory: InventoryItem[];
  stockLocations: StockLocation[];
}) {
  const { toast } = useToast();
  const inventoryByVariant = useMemo(
    () => new Map(inventory.map((item) => [item.variantId, item])),
    [inventory],
  );
  const locationById = useMemo(
    () => new Map(stockLocations.map((location) => [location.id, location])),
    [stockLocations],
  );

  const [detailDraft, setDetailDraft] = useState({
    name: "",
    handle: "",
    subtitle: "",
    description: "",
    status: "draft" as CommerceProduct["status"],
    typeId: "",
  });
  const [taxonomyDraft, setTaxonomyDraft] = useState({
    categoryIds: [] as string[],
    collectionIds: [] as string[],
    tagIds: [] as string[],
    salesChannelIds: [] as string[],
  });
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const selectedVariant = product?.variants.find((variant) => variant.id === selectedVariantId) ?? product?.variants[0] ?? null;
  const [variantDraft, setVariantDraft] = useState({
    title: "",
    sku: "",
    priceAtomic: "",
    currency: "DERO" as ProductVariant["currency"],
    manageInventory: false,
    allowBackorder: false,
    channelIds: [] as string[],
    stockLocationIds: [] as string[],
  });

  useEffect(() => {
    if (!product) return;
    setDetailDraft({
      name: product.name,
      handle: product.handle,
      subtitle: product.subtitle,
      description: product.description,
      status: product.status,
      typeId: product.typeId,
    });
    setTaxonomyDraft({
      categoryIds: product.categoryIds,
      collectionIds: product.collectionIds,
      tagIds: product.tagIds,
      salesChannelIds: product.salesChannelIds,
    });
    setSelectedVariantId(product.variants[0]?.id ?? "");
  }, [product]);

  useEffect(() => {
    if (!selectedVariant) return;
    setVariantDraft({
      title: selectedVariant.title,
      sku: selectedVariant.sku,
      priceAtomic: selectedVariant.priceAtomic,
      currency: selectedVariant.currency,
      manageInventory: selectedVariant.manageInventory,
      allowBackorder: selectedVariant.allowBackorder,
      channelIds: selectedVariant.channelIds,
      stockLocationIds: selectedVariant.stockLocationIds,
    });
  }, [selectedVariant]);

  const patchProductAndRefresh = useCallback(async (payload: Record<string, unknown>, successTitle: string) => {
    if (!product) return;
    try {
      const data = await apiFetch<{ product: CommerceProduct }>(`/api/pay/catalog/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      onChanged(data.product);
      toast({ title: successTitle, tone: "success" });
    } catch (err) {
      toast({
        title: "Catalog update failed",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    }
  }, [onChanged, product, toast]);

  const saveProductDetails = useCallback(() => {
    void patchProductAndRefresh(
      {
        ...detailDraft,
        metadata: {
          ...product?.metadata,
          editedAt: new Date().toISOString(),
        },
      },
      "Product details saved",
    );
  }, [detailDraft, patchProductAndRefresh, product?.metadata]);

  const saveTaxonomy = useCallback(() => {
    void patchProductAndRefresh(taxonomyDraft, "Taxonomy and availability saved");
  }, [patchProductAndRefresh, taxonomyDraft]);

  const saveVariant = useCallback(async () => {
    if (!product || !selectedVariant) return;
    try {
      const data = await apiFetch<{ variant: ProductVariant }>(
        `/api/pay/catalog/variants/${encodeURIComponent(selectedVariant.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(variantDraft),
        },
      );
      onChanged({
        ...product,
        variants: product.variants.map((variant) =>
          variant.id === data.variant.id ? data.variant : variant,
        ),
        updatedAt: new Date().toISOString(),
      });
      toast({ title: "Variant saved", tone: "success" });
    } catch (err) {
      toast({
        title: "Variant update failed",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    }
  }, [onChanged, product, selectedVariant, toast, variantDraft]);

  const variantRows = product?.variants ?? [];
  const categoryNames =
    product?.categoryIds.map((id) => categoryById.get(id)?.name ?? id).join(", ") ?? "";
  const channelNames =
    product?.salesChannelIds.map((id) => channelById.get(id)?.name ?? id).join(", ") ?? "";

  return (
    <Drawer
      open={!!product}
      onClose={onClose}
      title={product ? product.name : "Catalog product"}
      width={760}
      footer={
        product ? (
          <ActionCluster>
            <Button size="sm" onClick={saveTaxonomy}>
              Save taxonomy
            </Button>
            <Button size="sm" onClick={saveVariant} disabled={!selectedVariant}>
              Save variant
            </Button>
            <Button variant="primary" size="sm" onClick={saveProductDetails}>
              Save details
            </Button>
          </ActionCluster>
        ) : null
      }
    >
      {product && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="surface-flat" style={{ padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Edit product details
            </div>
            <div className="grid-2-1">
              <Input
                label="Name"
                value={detailDraft.name}
                onChange={(event) => setDetailDraft((draft) => ({ ...draft, name: event.target.value }))}
              />
              <Input
                label="Handle"
                mono
                value={detailDraft.handle}
                onChange={(event) => setDetailDraft((draft) => ({ ...draft, handle: event.target.value }))}
              />
              <Input
                label="Subtitle"
                value={detailDraft.subtitle}
                onChange={(event) => setDetailDraft((draft) => ({ ...draft, subtitle: event.target.value }))}
              />
              <Select
                label="Status"
                value={detailDraft.status}
                onChange={(event) =>
                  setDetailDraft((draft) => ({
                    ...draft,
                    status: event.target.value as CommerceProduct["status"],
                  }))
                }
                options={[
                  { value: "published", label: "Published" },
                  { value: "draft", label: "Draft" },
                  { value: "archived", label: "Archived" },
                ]}
              />
              <Select
                label="Type"
                value={detailDraft.typeId}
                onChange={(event) => setDetailDraft((draft) => ({ ...draft, typeId: event.target.value }))}
                options={types.map((type) => ({ value: type.id, label: type.value }))}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <TextArea
                label="Description"
                rows={4}
                value={detailDraft.description}
                onChange={(event) => setDetailDraft((draft) => ({ ...draft, description: event.target.value }))}
              />
            </div>
          </section>

          <section className="surface-flat" style={{ padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Taxonomy and availability
            </div>
            <div className="grid-2-1">
              <CommerceChecklist
                label="Categories"
                rows={categories.map((category) => ({ id: category.id, label: category.name }))}
                selected={taxonomyDraft.categoryIds}
                onChange={(categoryIds) => setTaxonomyDraft((draft) => ({ ...draft, categoryIds }))}
              />
              <CommerceChecklist
                label="Collections"
                rows={collections.map((collection) => ({ id: collection.id, label: collection.title }))}
                selected={taxonomyDraft.collectionIds}
                onChange={(collectionIds) => setTaxonomyDraft((draft) => ({ ...draft, collectionIds }))}
              />
              <CommerceChecklist
                label="Tags"
                rows={tags.map((tag) => ({ id: tag.id, label: tag.value }))}
                selected={taxonomyDraft.tagIds}
                onChange={(tagIds) => setTaxonomyDraft((draft) => ({ ...draft, tagIds }))}
              />
              <CommerceChecklist
                label="Sales channels"
                rows={channels.map((channel) => ({ id: channel.id, label: channel.name }))}
                selected={taxonomyDraft.salesChannelIds}
                onChange={(salesChannelIds) => setTaxonomyDraft((draft) => ({ ...draft, salesChannelIds }))}
              />
            </div>
          </section>

          <section className="surface-flat" style={{ padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Edit variant
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <Select
                label="Variant"
                value={selectedVariant?.id ?? ""}
                onChange={(event) => setSelectedVariantId(event.target.value)}
                options={variantRows.map((variant) => ({
                  value: variant.id,
                  label: `${variant.title} / ${variant.sku}`,
                }))}
              />
              {selectedVariant && (
                <>
                  <div className="grid-2-1">
                    <Input
                      label="Title"
                      value={variantDraft.title}
                      onChange={(event) => setVariantDraft((draft) => ({ ...draft, title: event.target.value }))}
                    />
                    <Input
                      label="SKU"
                      mono
                      value={variantDraft.sku}
                      onChange={(event) => setVariantDraft((draft) => ({ ...draft, sku: event.target.value }))}
                    />
                    <Input
                      label="Atomic price"
                      mono
                      value={variantDraft.priceAtomic}
                      onChange={(event) => setVariantDraft((draft) => ({ ...draft, priceAtomic: event.target.value }))}
                    />
                    <Select
                      label="Currency"
                      value={variantDraft.currency}
                      onChange={(event) =>
                        setVariantDraft((draft) => ({
                          ...draft,
                          currency: event.target.value as ProductVariant["currency"],
                        }))
                      }
                      options={[
                        { value: "DERO", label: "DERO" },
                        { value: "USD", label: "USD" },
                      ]}
                    />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={variantDraft.manageInventory}
                        onChange={(event) =>
                          setVariantDraft((draft) => ({ ...draft, manageInventory: event.target.checked }))
                        }
                        style={{ accentColor: "var(--dero)" }}
                      />
                      Track inventory
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={variantDraft.allowBackorder}
                        onChange={(event) =>
                          setVariantDraft((draft) => ({ ...draft, allowBackorder: event.target.checked }))
                        }
                        style={{ accentColor: "var(--dero)" }}
                      />
                      Allow backorder
                    </label>
                  </div>
                  <div className="grid-2-1">
                    <CommerceChecklist
                      label="Variant channels"
                      rows={channels.map((channel) => ({ id: channel.id, label: channel.name }))}
                      selected={variantDraft.channelIds}
                      onChange={(channelIds) => setVariantDraft((draft) => ({ ...draft, channelIds }))}
                    />
                    <CommerceChecklist
                      label="Stock locations"
                      rows={stockLocations.map((location) => ({ id: location.id, label: location.name }))}
                      selected={variantDraft.stockLocationIds}
                      onChange={(stockLocationIds) => setVariantDraft((draft) => ({ ...draft, stockLocationIds }))}
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="grid-2-1">
            <InfoCell label="Status">
              <Badge tone={product.status === "published" ? "positive" : product.status === "draft" ? "warn" : "neutral"}>
                {product.status}
              </Badge>
            </InfoCell>
            <InfoCell label="Type">
              {typeById.get(product.typeId)?.value ?? product.typeId}
            </InfoCell>
          </section>

          <section className="surface-flat" style={{ padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Product details
            </div>
            <div style={{ fontWeight: 600 }}>{product.subtitle}</div>
            <p style={{ margin: "8px 0 0", color: "var(--bone-dim)", fontSize: 13, lineHeight: 1.5 }}>
              {product.description}
            </p>
            <div className="mono" style={{ marginTop: 8, fontSize: 11, color: "var(--bone-mute)" }}>
              {product.handle}
            </div>
          </section>

          <section>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Variants and options
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {product.options.map((option) => (
                <Badge key={option.id} tone="info" dotless>
                  {option.title}: {option.values.join(", ")}
                </Badge>
              ))}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>SKU</th>
                    <th>Price</th>
                    <th>Inventory</th>
                    <th>Channels</th>
                  </tr>
                </thead>
                <tbody>
                  {variantRows.map((variant) => {
                    const inv = inventoryByVariant.get(variant.id);
                    return (
                      <tr key={variant.id}>
                        <td>{variant.title}</td>
                        <td className="mono">{variant.sku}</td>
                        <td className="mono">
                          {formatDero(variant.priceAtomic)} {variant.currency}
                        </td>
                        <td>
                          {inv ? (
                            <span className="mono">
                              {inv.availableQuantity} available at {inv.locationName}
                            </span>
                          ) : variant.manageInventory ? (
                            "managed"
                          ) : (
                            "not tracked"
                          )}
                        </td>
                        <td>{variant.channelIds.map((id) => channelById.get(id)?.name ?? id).join(", ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid-2-1">
            <InfoCell label="Taxonomy">
              <div>{categoryNames || "No categories"}</div>
              <div style={{ marginTop: 6, color: "var(--bone-mute)", fontSize: 12 }}>
                Tags: {product.tagIds.join(", ") || "none"}
              </div>
            </InfoCell>
            <InfoCell label="Channels">
              {channelNames || "No channels"}
            </InfoCell>
          </section>

          <section className="surface-flat" style={{ padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Inventory, price lists, and locations
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {variantRows.map((variant) => {
                const lists = priceListsByVariant.get(variant.id) ?? [];
                const locations = variant.stockLocationIds
                  .map((id) => locationById.get(id)?.name ?? id)
                  .join(", ");
                return (
                  <div key={variant.id} style={{ display: "grid", gap: 6 }}>
                    <strong>{variant.title}</strong>
                    <div style={{ fontSize: 12, color: "var(--bone-mute)" }}>
                      Locations: {locations || "none"}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {lists.length === 0 ? (
                        <Badge tone="neutral" dotless>
                          base price only
                        </Badge>
                      ) : (
                        lists.map((list) => (
                          <Badge key={list.id} tone={list.status === "active" ? "positive" : "info"} dotless>
                            {list.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="surface-flat" style={{ padding: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Metadata and activity
            </div>
            <pre
              className="mono"
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                fontSize: 11,
                color: "var(--bone-dim)",
              }}
            >
              {JSON.stringify(product.metadata, null, 2)}
            </pre>
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--bone-mute)" }}>
              Created {formatDate(product.createdAt)} / Updated {formatDate(product.updatedAt)}
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
}

function InfoCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-flat" style={{ padding: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "var(--bone)" }}>{children}</div>
    </div>
  );
}

function ProductCard({
  product: p,
  onEdit,
  onArchive,
  onCopySlug,
}: {
  product: Product;
  onEdit: () => void;
  onArchive: () => void;
  onCopySlug: () => void;
}) {
  const archived = !!p.archivedAt;
  return (
    <div
      className="surface"
      style={{
        padding: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        opacity: archived ? 0.65 : 1,
        position: "relative",
      }}
    >
      <div
        style={{
          height: 120,
          background: "var(--ink-elev-1)",
          borderBottom: "1px solid var(--ink-hair)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.imageUrl}
            alt={p.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <ImageIcon
            size={28}
            color="var(--bone-quiet)"
            strokeWidth={1.4}
            aria-hidden
          />
        )}
        <div style={{ position: "absolute", top: 8, right: 8 }}>
          <ProductStatusBadge
            active={p.active}
            archived={archived}
          />
        </div>
      </div>
      <div
        style={{
          padding: "14px 16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flex: 1,
        }}
      >
        <div
          className="display"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--bone)",
            letterSpacing: "-0.01em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={p.name}
        >
          {p.name}
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--bone-quiet)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={p.slug}
        >
          {p.slug}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--bone-dim)",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: 36,
          }}
          title={p.description ?? ""}
        >
          {p.description ?? "—"}
        </div>
        <div
          style={{
            marginTop: 6,
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            fontFamily: "var(--font-mono)",
          }}
        >
          <span
            style={{ fontSize: 16, color: "var(--bone)", fontWeight: 500 }}
          >
            {formatDero(p.priceAtomic, 5)}
          </span>
          <span
            style={{
              fontSize: 10,
              color: "var(--bone-quiet)",
              letterSpacing: "0.14em",
            }}
          >
            {p.currency}
          </span>
        </div>
      </div>
      <div
        style={{
          padding: "10px 12px",
          borderTop: "1px solid var(--ink-hair)",
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <button
          className="btn btn-ghost btn-mini"
          onClick={onEdit}
          title="Edit product"
        >
          <Pencil size={11} /> Edit
        </button>
        <button
          className="btn btn-ghost btn-mini"
          onClick={onCopySlug}
          title="Copy slug"
        >
          <Copy size={11} /> Slug
        </button>
        {!archived && (
          <button
            className="btn btn-ghost btn-mini"
            onClick={onArchive}
            title="Archive product"
          >
            <Archive size={11} /> Archive
          </button>
        )}
      </div>
    </div>
  );
}

function ProductStatusBadge({
  active,
  archived,
}: {
  active: boolean;
  archived: boolean;
}) {
  const tone = archived
    ? {
        bg: "var(--ink-elev-2)",
        color: "var(--bone-quiet)",
        label: "Archived",
      }
    : active
      ? { bg: "var(--dero-wash)", color: "var(--dero)", label: "Active" }
      : {
          bg: "var(--amber-wash)",
          color: "var(--amber)",
          label: "Inactive",
        };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.color,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: tone.color,
        }}
      />
      {tone.label}
    </span>
  );
}

function ProductModal({
  mode,
  product,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  product: Product | null;
  onClose: () => void;
  onSaved: (p: Product, mode: "create" | "edit") => void;
}) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  // Convert existing atomic back to display units for editing.
  const [priceInput, setPriceInput] = useState(() => {
    if (!product) return "";
    try {
      const atomic = BigInt(product.priceAtomic);
      const whole = Number(atomic) / ATOMIC_PER_UNIT;
      return Number.isFinite(whole) ? String(whole) : "";
    } catch {
      return "";
    }
  });
  const [currency, setCurrency] = useState<ProductCurrency>(
    product?.currency ?? "DERO"
  );
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    const slugTrim = slug.trim().toLowerCase();
    if (!slugTrim) {
      toast({ title: "Slug required", tone: "warn" });
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slugTrim)) {
      toast({ title: "Slug: lowercase alphanumeric + hyphens", tone: "warn" });
      return;
    }
    const nameTrim = name.trim();
    if (!nameTrim) {
      toast({ title: "Name required", tone: "warn" });
      return;
    }
    const atomic = toAtomic(priceInput);
    if (!atomic) {
      toast({ title: "Enter a positive price", tone: "warn" });
      return;
    }
    const imageTrim = imageUrl.trim();
    if (imageTrim && !(imageTrim.startsWith("https://") || imageTrim.startsWith("data:image/"))) {
      toast({ title: "Image URL must start with https:// or data:image/", tone: "warn" });
      return;
    }

    setSubmitting(true);

    if (mode === "edit" && product) {
      const updates = {
        name: nameTrim,
        description: description.trim() || null,
        priceAtomic: atomic.toString(),
        currency,
        imageUrl: imageTrim || null,
      };
      if (isDemo) {
        const updated: Product = {
          ...product,
          name: nameTrim,
          description: description.trim() || null,
          priceAtomic: atomic.toString(),
          currency,
          imageUrl: imageTrim || null,
          updatedAt: Date.now(),
        };
        setSubmitting(false);
        onSaved(updated, "edit");
        return;
      }
      try {
        const data = await apiFetch<{ product: Product }>(
          `/api/pay/products/${encodeURIComponent(product.id)}`,
          {
            method: "PUT",
            body: JSON.stringify(updates),
          }
        );
        onSaved(data.product, "edit");
      } catch (err) {
        toast({
          title: "Couldn't update product",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Create
    const payload = {
      slug: slugTrim,
      name: nameTrim,
      description: description.trim() || undefined,
      priceAtomic: atomic.toString(),
      currency,
      imageUrl: imageTrim || undefined,
    };
    if (isDemo) {
      const created: Product = {
        id: `prd_demo_${Math.random().toString(16).slice(2, 8)}`,
        slug: slugTrim,
        name: nameTrim,
        description: description.trim() || null,
        priceAtomic: atomic.toString(),
        currency,
        imageUrl: imageTrim || null,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        archivedAt: null,
      };
      setSubmitting(false);
      onSaved(created, "create");
      return;
    }
    try {
      const data = await apiFetch<{ product: Product }>("/api/pay/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onSaved(data.product, "create");
    } catch (err) {
      toast({
        title: "Couldn't create product",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    mode,
    product,
    slug,
    name,
    description,
    priceInput,
    currency,
    imageUrl,
    onSaved,
    toast,
  ]);

  return (
    <ModalShell
      title={mode === "create" ? "New product" : `Edit — ${product?.name ?? ""}`}
      eyebrow={mode === "create" ? "Create" : "Update"}
      onClose={onClose}
    >
      <div style={formPanelStyle}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <Field label="Slug" full>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="privacy-audit-pack"
              style={inputStyle}
              disabled={mode === "edit"}
              autoFocus={mode === "create"}
            />
          </Field>
          <Field label="Name" full>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Privacy Audit Pack"
              style={inputStyle}
            />
          </Field>
          <Field label="Description (optional)" wide>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this product do?"
              rows={3}
              style={{
                ...inputStyle,
                fontFamily: "var(--font-sans)",
                resize: "vertical",
              }}
            />
          </Field>
          <Field label={`Price (${currency})`} full>
            <input
              type="number"
              min={0}
              step="0.00001"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="25"
              style={inputStyle}
            />
          </Field>
          <Field label="Currency" full>
            <div style={{ display: "flex", gap: 8 }}>
              {(["DERO", "USD"] as ProductCurrency[]).map((c) => {
                const active = currency === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${
                        active ? "var(--dero)" : "var(--ink-hair)"
                      }`,
                      background: active ? "var(--dero-wash)" : "transparent",
                      color: active ? "var(--dero)" : "var(--bone-dim)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Image URL (optional)" wide>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            className="btn btn-primary btn-mini"
            onClick={submit}
            disabled={submitting}
          >
            {submitting
              ? "Saving…"
              : mode === "create"
                ? "Create product"
                : "Save changes"}
          </button>
          <button className="btn btn-ghost btn-mini" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ===========================================================================
// TAB 2 · Payment Links
// ===========================================================================

function LinksTab({ products }: { products: Product[] }) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();
  const [links, setLinks] = useState<PaymentLink[]>(isDemo ? DEMO_LINKS : []);
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<"adhoc" | "product" | null>(null);
  const [qrFor, setQrFor] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    if (isDemo) {
      setLinks(DEMO_LINKS);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ links: PaymentLink[] }>(
        "/api/pay/products/links?includeArchived=true"
      );
      setLinks(data.links ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payment links");
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const archive = useCallback(
    async (link: PaymentLink) => {
      if (!confirm(`Archive link "${link.slug}"?`)) return;
      if (isDemo) {
        setLinks((prev) =>
          prev.map((l) =>
            l.id === link.id ? { ...l, archivedAt: Date.now() } : l
          )
        );
        toast({ title: "Link archived", tone: "info" });
        return;
      }
      try {
        await apiFetch(
          `/api/pay/products/links/${encodeURIComponent(link.id)}/archive`,
          { method: "POST" }
        );
        toast({ title: "Link archived", tone: "success" });
        fetchLinks();
      } catch (err) {
        toast({
          title: "Archive failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [fetchLinks, toast]
  );

  const copy = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "URL copied", tone: "success" });
      } catch {
        toast({ title: "Couldn't copy", tone: "error" });
      }
    },
    [toast]
  );

  const onCreated = useCallback(
    (link: PaymentLink) => {
      if (isDemo) {
        setLinks((prev) => [link, ...prev]);
      } else {
        fetchLinks();
      }
      setShowModal(null);
      toast({ title: `Link "${link.slug}" created`, tone: "success" });
    },
    [fetchLinks, toast]
  );

  return (
    <>
      <SectionHeader
        title="Payment Links"
        subtitle={`Shareable URLs that spin up an invoice on click. Product links use the product's listed price; ad-hoc links set their own. Links live at ${GATEWAY_PUBLIC_URL}/l/<slug>.`}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-ghost btn-mini"
              onClick={() => setShowModal("adhoc")}
            >
              <Plus size={12} /> Ad-hoc link
            </button>
            <button
              className="btn btn-primary btn-mini"
              onClick={() => setShowModal("product")}
              disabled={products.length === 0}
              title={
                products.length === 0
                  ? "Create a product first"
                  : "Create a product-backed link"
              }
            >
              <Plus size={12} /> Product link
            </button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} onRetry={fetchLinks} />}

      {loading ? (
        <LoadingCard label="Loading payment links…" />
      ) : links.length === 0 ? (
        <EmptyState
          icon={<Link2 size={22} strokeWidth={1.6} />}
          title="No payment links yet"
          description="Create a link to accept DERO on a shareable URL — works in tweets, invoices, and DMs."
        />
      ) : (
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Slug</Th>
                <Th>Linked product</Th>
                <Th align="right">Amount</Th>
                <Th>Currency</Th>
                <Th align="right">Uses</Th>
                <Th>TTL</Th>
                <Th>Created</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const product = l.productId ? productById.get(l.productId) : null;
                const archived = !!l.archivedAt;
                const url = paymentLinkUrl(l.slug);
                const effAmount =
                  l.amountAtomic ?? product?.priceAtomic ?? null;
                const effCurrency =
                  l.currency ?? product?.currency ?? null;
                const showQr = qrFor === l.id;
                return (
                  <>
                    <tr key={l.id} style={{ opacity: archived ? 0.55 : 1 }}>
                      <Td mono>
                        <span style={{ color: "var(--bone)", fontWeight: 500 }}>
                          {l.slug}
                        </span>
                      </Td>
                      <Td>
                        {product ? (
                          <span style={{ color: "var(--bone)" }}>
                            {product.name}
                          </span>
                        ) : (
                          <span
                            style={{
                              color: "var(--bone-quiet)",
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            Ad-hoc
                          </span>
                        )}
                      </Td>
                      <Td align="right" mono>
                        {effAmount ? formatDero(effAmount, 5) : "—"}
                      </Td>
                      <Td mono>
                        <span style={{ fontSize: 11, color: "var(--bone-dim)" }}>
                          {effCurrency ?? "—"}
                        </span>
                      </Td>
                      <Td align="right" mono>
                        {l.usesCount}
                        {l.maxUses !== null && l.maxUses !== undefined ? (
                          <span style={{ color: "var(--bone-quiet)" }}>
                            {" / "}
                            {l.maxUses}
                          </span>
                        ) : (
                          <span style={{ color: "var(--bone-quiet)" }}> / ∞</span>
                        )}
                      </Td>
                      <Td mono>
                        <span style={{ fontSize: 11, color: "var(--bone-dim)" }}>
                          {ttlLabel(l.ttlSeconds)}
                        </span>
                      </Td>
                      <Td mono>
                        <span style={{ fontSize: 11, color: "var(--bone-dim)" }}>
                          {formatDate(new Date(l.createdAt).toISOString())}
                        </span>
                      </Td>
                      <Td align="right">
                        <div
                          style={{
                            display: "inline-flex",
                            gap: 6,
                            justifyContent: "flex-end",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            className="btn btn-ghost btn-mini"
                            onClick={() => copy(url)}
                            title={url}
                          >
                            <Copy size={11} /> Copy
                          </button>
                          <a
                            className="btn btn-ghost btn-mini"
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={11} /> Open
                          </a>
                          <button
                            className="btn btn-ghost btn-mini"
                            onClick={() =>
                              setQrFor((prev) => (prev === l.id ? null : l.id))
                            }
                            title="Toggle QR / URL"
                          >
                            <QrCode size={11} />
                          </button>
                          {!archived && (
                            <button
                              className="btn btn-ghost btn-mini"
                              onClick={() => archive(l)}
                            >
                              <Archive size={11} />
                            </button>
                          )}
                        </div>
                      </Td>
                    </tr>
                    {showQr && (
                      <tr key={`${l.id}-qr`}>
                        <td
                          colSpan={8}
                          style={{
                            padding: "12px 14px 18px",
                            background: "var(--ink-elev-1)",
                            borderBottom: "1px solid var(--ink-hair)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 14,
                              flexWrap: "wrap",
                            }}
                          >
                            <QrCode
                              size={40}
                              color="var(--bone-quiet)"
                              strokeWidth={1.4}
                            />
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="mono"
                              style={{
                                fontSize: 15,
                                color: "var(--bone)",
                                letterSpacing: "0.02em",
                                textDecoration: "none",
                                wordBreak: "break-all",
                              }}
                            >
                              {url}
                            </a>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      <AnimatePresence>
        {showModal === "adhoc" && (
          <PaymentLinkModal
            key="adhoc"
            mode="adhoc"
            products={products}
            onClose={() => setShowModal(null)}
            onCreated={onCreated}
          />
        )}
        {showModal === "product" && (
          <PaymentLinkModal
            key="product"
            mode="product"
            products={products}
            onClose={() => setShowModal(null)}
            onCreated={onCreated}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function PaymentLinkModal({
  mode,
  products,
  onClose,
  onCreated,
}: {
  mode: "adhoc" | "product";
  products: Product[];
  onClose: () => void;
  onCreated: (link: PaymentLink) => void;
}) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();
  const availableProducts = useMemo(
    () => products.filter((p) => p.active && !p.archivedAt),
    [products]
  );
  const [slug, setSlug] = useState("");
  const [productId, setProductId] = useState(
    mode === "product" ? availableProducts[0]?.id ?? "" : ""
  );
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<ProductCurrency>("DERO");
  const [ttl, setTtl] = useState("3600"); // seconds
  const [maxUses, setMaxUses] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    const slugTrim = slug.trim().toLowerCase();
    if (!slugTrim) {
      toast({ title: "Slug required", tone: "warn" });
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slugTrim)) {
      toast({ title: "Slug: lowercase alphanumeric + hyphens", tone: "warn" });
      return;
    }
    const ttlNum = Number(ttl);
    if (!Number.isFinite(ttlNum) || ttlNum < 60) {
      toast({ title: "TTL must be ≥ 60 seconds", tone: "warn" });
      return;
    }
    const maxUsesNum =
      maxUses.trim() === "" ? undefined : Number(maxUses);
    if (
      maxUsesNum !== undefined &&
      (!Number.isFinite(maxUsesNum) || maxUsesNum <= 0)
    ) {
      toast({ title: "Max uses must be positive", tone: "warn" });
      return;
    }

    let productForLink: Product | undefined;
    let amountAtomic: bigint | null = null;
    let linkCurrency: ProductCurrency | undefined;

    if (mode === "product") {
      productForLink = products.find((p) => p.id === productId);
      if (!productForLink) {
        toast({ title: "Select a product", tone: "warn" });
        return;
      }
    } else {
      amountAtomic = toAtomic(amount);
      if (!amountAtomic) {
        toast({ title: "Enter a positive amount", tone: "warn" });
        return;
      }
      linkCurrency = currency;
    }

    setSubmitting(true);

    const payload = {
      slug: slugTrim,
      name: productForLink?.name ?? `Ad-hoc · ${slugTrim}`,
      ttlSeconds: ttlNum,
      maxUses: maxUsesNum,
      ...(mode === "adhoc" && amountAtomic
        ? {
            amountAtomic: amountAtomic.toString(),
            currency: linkCurrency,
          }
        : {}),
    };

    if (isDemo) {
      const link: PaymentLink = {
        id: `lnk_demo_${Math.random().toString(16).slice(2, 8)}`,
        slug: slugTrim,
        productId: productForLink?.id ?? null,
        name: productForLink?.name ?? `Ad-hoc · ${slugTrim}`,
        amountAtomic:
          mode === "adhoc" && amountAtomic ? amountAtomic.toString() : null,
        currency: mode === "adhoc" ? linkCurrency ?? null : null,
        ttlSeconds: ttlNum,
        usesCount: 0,
        maxUses: maxUsesNum ?? null,
        createdAt: Date.now(),
        archivedAt: null,
      };
      setSubmitting(false);
      onCreated(link);
      return;
    }

    const path =
      mode === "product" && productForLink
        ? `/api/pay/products/${encodeURIComponent(productForLink.id)}/links`
        : "/api/pay/products/links";

    try {
      const data = await apiFetch<{ link: PaymentLink }>(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onCreated(data.link);
    } catch (err) {
      toast({
        title: "Couldn't create link",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    mode,
    slug,
    productId,
    amount,
    currency,
    ttl,
    maxUses,
    products,
    onCreated,
    toast,
  ]);

  return (
    <ModalShell
      title={mode === "product" ? "New product link" : "New ad-hoc link"}
      eyebrow="Create"
      onClose={onClose}
    >
      <div style={formPanelStyle}>
        {mode === "product" && (
          <Field label="Product">
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {availableProducts.length === 0 ? (
                <option value="">No active products</option>
              ) : null}
              {availableProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatDero(p.priceAtomic, 5)} {p.currency}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <Field label="Slug" full>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-widget"
              style={inputStyle}
              autoFocus
            />
          </Field>

          {mode === "adhoc" && (
            <>
              <Field label={`Amount (${currency})`} full>
                <input
                  type="number"
                  min={0}
                  step="0.00001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1"
                  style={inputStyle}
                />
              </Field>
              <Field label="Currency" full>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["DERO", "USD"] as ProductCurrency[]).map((c) => {
                    const active = currency === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCurrency(c)}
                        style={{
                          flex: 1,
                          padding: "8px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: `1px solid ${
                            active ? "var(--dero)" : "var(--ink-hair)"
                          }`,
                          background: active
                            ? "var(--dero-wash)"
                            : "transparent",
                          color: active ? "var(--dero)" : "var(--bone-dim)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          cursor: "pointer",
                        }}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </>
          )}

          <Field label="TTL (seconds)" full>
            <input
              type="number"
              min={60}
              step={60}
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              placeholder="3600"
              style={inputStyle}
            />
          </Field>
          <Field label="Max uses (optional)" full>
            <input
              type="number"
              min={1}
              step={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Unlimited"
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            className="btn btn-primary btn-mini"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create link"}
          </button>
          <button className="btn btn-ghost btn-mini" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ===========================================================================
// TAB 3 · Subscriptions
// ===========================================================================

function SubscriptionsTab({ products }: { products: Product[] }) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();
  const [subs, setSubs] = useState<Subscription[]>(
    isDemo ? DEMO_SUBSCRIPTIONS : []
  );
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>(
    isDemo ? DEMO_SUB_INVOICES : []
  );
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchSubs = useCallback(async () => {
    if (isDemo) {
      setSubs(DEMO_SUBSCRIPTIONS);
      setInvoices(DEMO_SUB_INVOICES);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{
        subscriptions: Subscription[];
        invoices?: SubscriptionInvoice[];
      }>("/api/pay/products/subscriptions");
      setSubs(data.subscriptions ?? []);
      setInvoices(data.invoices ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load subscriptions"
      );
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubs();
  }, [fetchSubs]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const invoicesBySub = useMemo(() => {
    const m = new Map<string, SubscriptionInvoice[]>();
    for (const si of invoices) {
      const arr = m.get(si.subscriptionId) ?? [];
      arr.push(si);
      m.set(si.subscriptionId, arr);
    }
    return m;
  }, [invoices]);

  const transition = useCallback(
    async (
      s: Subscription,
      action: "cancel" | "pause" | "resume"
    ) => {
      const verbs: Record<typeof action, string> = {
        cancel: "Cancel",
        pause: "Pause",
        resume: "Resume",
      };
      const verb = verbs[action];
      if (action === "cancel" && !confirm(`${verb} this subscription?`)) {
        return;
      }
      if (isDemo) {
        const nextStatus: SubscriptionStatus =
          action === "cancel"
            ? "cancelled"
            : action === "pause"
              ? "paused"
              : "active";
        setSubs((prev) =>
          prev.map((x) =>
            x.id === s.id
              ? {
                  ...x,
                  status: nextStatus,
                  cancelledAt:
                    action === "cancel" ? Date.now() : x.cancelledAt,
                  pausedAt: action === "pause" ? Date.now() : x.pausedAt,
                }
              : x
          )
        );
        toast({ title: `${verb}d`, tone: "info" });
        return;
      }
      try {
        await apiFetch(
          `/api/pay/products/subscriptions/${encodeURIComponent(s.id)}/${action}`,
          { method: "POST" }
        );
        toast({ title: `${verb}d`, tone: "success" });
        fetchSubs();
      } catch (err) {
        toast({
          title: `${verb} failed`,
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [fetchSubs, toast]
  );

  const onCreated = useCallback(
    (s: Subscription) => {
      if (isDemo) {
        setSubs((prev) => [s, ...prev]);
      } else {
        fetchSubs();
      }
      setShowCreate(false);
      toast({ title: "Subscription created", tone: "success" });
    },
    [fetchSubs, toast]
  );

  return (
    <>
      <SectionHeader
        title="Subscriptions"
        subtitle="Recurring billing runs bound to a product + customer identifier. The scheduler picks up due cycles, creates invoices, and advances the cursor."
        action={
          <button
            className="btn btn-primary btn-mini"
            onClick={() => setShowCreate(true)}
            disabled={products.length === 0}
            title={
              products.length === 0
                ? "Create a product first"
                : "New subscription"
            }
          >
            <Plus size={12} /> New subscription
          </button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={fetchSubs} />}

      {loading ? (
        <LoadingCard label="Loading subscriptions…" />
      ) : subs.length === 0 ? (
        <EmptyState
          icon={<Repeat2 size={22} strokeWidth={1.6} />}
          title="No subscriptions yet"
          description="Start a recurring billing run by attaching a customer identifier to a product."
        />
      ) : (
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Customer</Th>
                <Th>Cadence</Th>
                <Th>Status</Th>
                <Th>Next invoice</Th>
                <Th align="right">Invoices</Th>
                <Th>Created</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => {
                const product = productById.get(s.productId);
                const subInvoices = invoicesBySub.get(s.id) ?? [];
                const canCancel =
                  s.status === "active" || s.status === "paused";
                const canPause = s.status === "active";
                const canResume = s.status === "paused";
                const isOpen = expanded === s.id;
                return (
                  <>
                    <tr
                      key={s.id}
                      onClick={() =>
                        setExpanded((prev) => (prev === s.id ? null : s.id))
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <Td>
                        <span style={{ color: "var(--bone)" }}>
                          {product?.name ?? (
                            <span
                              style={{
                                color: "var(--bone-quiet)",
                                fontFamily: "var(--font-mono)",
                                fontSize: 11,
                              }}
                            >
                              {truncate(s.productId, 6, 4)}
                            </span>
                          )}
                        </span>
                      </Td>
                      <Td mono>
                        <span
                          style={{
                            fontSize: 11.5,
                            color: "var(--bone-dim)",
                            maxWidth: 220,
                            display: "inline-block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            verticalAlign: "bottom",
                          }}
                          title={s.customerIdentifier}
                        >
                          {truncate(s.customerIdentifier ?? "", 20, 8)}
                        </span>
                      </Td>
                      <Td>
                        <CadenceBadge cadence={s.cadence} />
                      </Td>
                      <Td>
                        <SubStatusBadge status={s.status} />
                      </Td>
                      <Td mono>
                        <span style={{ fontSize: 11, color: "var(--bone-dim)" }}>
                          {s.nextInvoiceAt ? formatDate(new Date(s.nextInvoiceAt).toISOString()) : "—"}
                        </span>
                      </Td>
                      <Td align="right" mono>
                        {s.totalInvoices}
                      </Td>
                      <Td mono>
                        <span style={{ fontSize: 11, color: "var(--bone-dim)" }}>
                          {formatDate(new Date(s.createdAt).toISOString())}
                        </span>
                      </Td>
                      <Td align="right" onClick={(e) => e.stopPropagation()}>
                        <div
                          style={{
                            display: "inline-flex",
                            gap: 6,
                            justifyContent: "flex-end",
                            flexWrap: "wrap",
                          }}
                        >
                          {canPause && (
                            <button
                              className="btn btn-ghost btn-mini"
                              onClick={() => transition(s, "pause")}
                            >
                              Pause
                            </button>
                          )}
                          {canResume && (
                            <button
                              className="btn btn-ghost btn-mini"
                              onClick={() => transition(s, "resume")}
                            >
                              Resume
                            </button>
                          )}
                          {canCancel && (
                            <button
                              className="btn btn-ghost btn-mini"
                              onClick={() => transition(s, "cancel")}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </Td>
                    </tr>
                    {isOpen && (
                      <tr key={`${s.id}-exp`}>
                        <td
                          colSpan={8}
                          style={{
                            padding: "14px 18px 18px",
                            background: "var(--ink-elev-1)",
                            borderBottom: "1px solid var(--ink-hair)",
                          }}
                        >
                          <div
                            className="eyebrow"
                            style={{
                              color: "var(--bone-quiet)",
                              fontSize: 10,
                              marginBottom: 10,
                            }}
                          >
                            Past invoices ({subInvoices.length})
                          </div>
                          {subInvoices.length === 0 ? (
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--bone-quiet)",
                              }}
                            >
                              No invoices yet.
                            </div>
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                              }}
                            >
                              {subInvoices
                                .slice()
                                .sort((a, b) => (b.cycleIndex ?? 0) - (a.cycleIndex ?? 0))
                                .map((si) => (
                                  <a
                                    key={si.id}
                                    href={`/invoices?id=${encodeURIComponent(
                                      si.invoiceId
                                    )}`}
                                    className="mono"
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      padding: "6px 10px",
                                      background: "var(--ink-deep)",
                                      border: "1px solid var(--ink-hair)",
                                      borderRadius: "var(--radius-sm)",
                                      fontSize: 11.5,
                                      textDecoration: "none",
                                      color: "var(--dero)",
                                    }}
                                  >
                                    <span>
                                      <span style={{ color: "var(--bone-quiet)" }}>
                                        #{si.cycleIndex}
                                      </span>{" "}
                                      {si.invoiceId}
                                    </span>
                                    <span
                                      style={{
                                        color: "var(--bone-quiet)",
                                        fontSize: 10.5,
                                      }}
                                    >
                                      {formatDate(
                                        new Date(si.createdAt).toISOString()
                                      )}
                                    </span>
                                  </a>
                                ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      <AnimatePresence>
        {showCreate && (
          <SubscriptionModal
            products={products}
            onClose={() => setShowCreate(false)}
            onCreated={onCreated}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function SubscriptionModal({
  products,
  onClose,
  onCreated,
}: {
  products: Product[];
  onClose: () => void;
  onCreated: (s: Subscription) => void;
}) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();
  const available = useMemo(
    () => products.filter((p) => p.active && !p.archivedAt),
    [products]
  );
  const [productId, setProductId] = useState(available[0]?.id ?? "");
  const [customer, setCustomer] = useState("");
  const [cadence, setCadence] = useState<SubscriptionCadence>("monthly");
  const [startAt, setStartAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    if (!productId) {
      toast({ title: "Select a product", tone: "warn" });
      return;
    }
    const customerTrim = customer.trim();
    if (!customerTrim) {
      toast({ title: "Customer identifier required", tone: "warn" });
      return;
    }
    const startMs = startAt ? new Date(startAt).getTime() : undefined;

    setSubmitting(true);

    const payload = {
      productId,
      customerIdentifier: customerTrim,
      cadence,
      startAt: startMs,
    };

    if (isDemo) {
      const s: Subscription = {
        id: `sub_demo_${Math.random().toString(16).slice(2, 8)}`,
        productId,
        customerIdentifier: customerTrim,
        cadence,
        status: "active",
        nextInvoiceAt: startMs ?? Date.now(),
        processingAt: null,
        createdAt: Date.now(),
        cancelledAt: null,
        pausedAt: null,
        totalInvoices: 0,
      };
      setSubmitting(false);
      onCreated(s);
      return;
    }

    try {
      const data = await apiFetch<{ subscription: Subscription }>(
        "/api/pay/products/subscriptions",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
      onCreated(data.subscription);
    } catch (err) {
      toast({
        title: "Couldn't create subscription",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [productId, customer, cadence, startAt, onCreated, toast]);

  return (
    <ModalShell title="New subscription" eyebrow="Create" onClose={onClose}>
      <div style={formPanelStyle}>
        <Field label="Product">
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            {available.length === 0 && <option value="">No products</option>}
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatDero(p.priceAtomic, 5)} {p.currency}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Customer identifier">
          <input
            type="text"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="alice@example.com"
            style={inputStyle}
          />
        </Field>

        <Field label="Cadence">
          <div style={{ display: "flex", gap: 8 }}>
            {(["monthly", "quarterly", "annual"] as SubscriptionCadence[]).map(
              (c) => {
                const active = cadence === c;
                return (
                  <label
                    key={c}
                    style={{
                      flex: 1,
                      cursor: "pointer",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${
                        active ? "var(--dero)" : "var(--ink-hair)"
                      }`,
                      background: active ? "var(--dero-wash)" : "transparent",
                      color: active ? "var(--dero)" : "var(--bone-dim)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    <input
                      type="radio"
                      name="cadence"
                      value={c}
                      checked={active}
                      onChange={() => setCadence(c)}
                      style={{ display: "none" }}
                    />
                    {cadenceLabel(c)}
                  </label>
                );
              }
            )}
          </div>
        </Field>

        <Field label="Start at (optional)">
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            className="btn btn-primary btn-mini"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create subscription"}
          </button>
          <button className="btn btn-ghost btn-mini" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function CadenceBadge({ cadence }: { cadence: SubscriptionCadence }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 4,
        background: "var(--ink-elev-2)",
        border: "1px solid var(--ink-hair)",
        color: "var(--bone-dim)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {cadenceLabel(cadence)}
    </span>
  );
}

function SubStatusBadge({ status }: { status: SubscriptionStatus }) {
  const tones: Record<
    SubscriptionStatus,
    { bg: string; color: string; label: string }
  > = {
    active: { bg: "var(--dero-wash)", color: "var(--dero)", label: "Active" },
    paused: {
      bg: "var(--amber-wash)",
      color: "var(--amber)",
      label: "Paused",
    },
    canceled: {
      bg: "var(--vermilion-wash)",
      color: "var(--vermilion)",
      label: "Canceled",
    },
    cancelled: {
      bg: "var(--vermilion-wash)",
      color: "var(--vermilion)",
      label: "Cancelled",
    },
    past_due: {
      bg: "var(--vermilion-wash)",
      color: "var(--vermilion)",
      label: "Past Due",
    },
    trialing: {
      bg: "var(--cobalt-wash)",
      color: "var(--cobalt)",
      label: "Trialing",
    },
    ended: {
      bg: "var(--ink-elev-2)",
      color: "var(--bone-quiet)",
      label: "Ended",
    },
  };
  const t = tones[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 999,
        background: t.bg,
        color: t.color,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: t.color,
        }}
      />
      {t.label}
    </span>
  );
}

// ===========================================================================
// Shared presentational bits
// ===========================================================================

function ModalShell({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      key="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <motion.div
        key="modal-panel"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="surface"
        style={{
          maxWidth: 640,
          width: "100%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "18px 22px",
            borderBottom: "1px solid var(--ink-hair)",
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              className="eyebrow"
              style={{
                color: "var(--bone-quiet)",
                marginBottom: 4,
                fontSize: 10,
              }}
            >
              {eyebrow}
            </div>
            <h3
              className="display"
              style={{
                fontSize: 15,
                fontWeight: 600,
                margin: 0,
                color: "var(--bone)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={title}
            >
              {title}
            </h3>
          </div>
          <button
            className="btn btn-ghost btn-mini"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={12} />
          </button>
        </div>
        <div
          style={{
            padding: "16px 22px 20px",
            overflowY: "auto",
            flex: 1,
          }}
        >
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 14,
        marginBottom: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h3
          className="display"
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            margin: 0,
            color: "var(--bone)",
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--bone-dim)",
              lineHeight: 1.55,
              margin: "4px 0 0",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="surface"
      style={{ padding: 0, overflowX: "auto" }}
    >
      {children}
    </motion.div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--bone-quiet)",
        fontWeight: 500,
        borderBottom: "1px solid var(--ink-hair)",
        background: "var(--ink-elev-1)",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono = false,
  onClick,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
}) {
  return (
    <td
      onClick={onClick}
      className={mono ? "num" : undefined}
      style={{
        textAlign: align,
        padding: "12px 14px",
        borderBottom: "1px solid var(--ink-hair)",
        color: "var(--bone)",
        fontSize: 13,
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}

function Field({
  label,
  children,
  full,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  wide?: boolean;
}) {
  const style: React.CSSProperties = {
    display: "block",
    ...(wide ? { gridColumn: "1 / -1" } : {}),
    ...(full ? {} : {}),
  };
  return (
    <label style={style}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--bone-quiet)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: checked ? "var(--bone)" : "var(--bone-quiet)",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ cursor: "pointer", accentColor: "var(--dero)" }}
      />
      {label}
    </label>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div
      className="surface"
      style={{
        padding: "60px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "var(--bone-quiet)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}
    >
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        style={{
          display: "inline-block",
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: "1.5px solid var(--ink-hair)",
          borderTopColor: "var(--dero)",
        }}
        aria-hidden
      />
      {label}
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        marginBottom: 14,
        padding: "12px 16px",
        background: "var(--vermilion-wash)",
        border: "1px solid rgba(224,93,68,0.28)",
        borderRadius: "var(--radius-sm)",
        color: "var(--bone)",
        fontSize: 12.5,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span>{message}</span>
      <button className="btn btn-ghost btn-mini" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style primitives
// ---------------------------------------------------------------------------

const formPanelStyle: React.CSSProperties = {
  padding: "18px 20px",
  background: "var(--ink-elev-1)",
  border: "1px solid var(--ink-hair)",
  borderRadius: "var(--radius-sm)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "var(--ink-deep)",
  border: "1px solid var(--ink-hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--bone)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  outline: "none",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};
