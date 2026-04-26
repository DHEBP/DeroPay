export type InvoiceRow = {
  id: string;
  name?: string;
  description?: string | null;
  status?: string;
  amount?: string;
  amountReceived?: string;
  paymentId?: string;
  createdAt?: string;
  completedAt?: string | null;
  expiresAt?: string | null;
};

export type OrderStatus =
  | "pending"
  | "processing"
  | "completed"
  | "requires_attention"
  | "canceled";

export type PaymentStatus =
  | "awaiting"
  | "authorized"
  | "partially_paid"
  | "captured"
  | "expired";

export type FulfillmentStatus =
  | "not_required"
  | "pending"
  | "reserved"
  | "fulfilled";

export type OrderLineItem = {
  id: string;
  title: string;
  sku: string;
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: string;
  total: string;
  inventoryItemId?: string;
};

export type OrderTimelineEvent = {
  id: string;
  label: string;
  description: string;
  at: string;
  tone: "positive" | "warn" | "info" | "danger" | "neutral";
};

export type Shipment = {
  id: string;
  orderId: string;
  fulfillmentId: string;
  carrier: string;
  service: string;
  trackingNumber: string;
  trackingUrl: string;
  shippedAt: string | null;
  deliveredAt: string | null;
};

export type Fulfillment = {
  id: string;
  orderId: string;
  status: "reserved" | "packed" | "shipped" | "delivered" | "canceled";
  locationId: string;
  providerId: string;
  shippingOptionId: string | null;
  lineItemIds: string[];
  createdAt: string;
  shippedAt: string | null;
};

export type Return = {
  id: string;
  orderId: string;
  status: "requested" | "received" | "refunded" | "canceled";
  reasonId: string;
  lineItemIds: string[];
  refundAmount: string;
  requestedAt: string;
  receivedAt: string | null;
};

export type Claim = {
  id: string;
  orderId: string;
  status: "open" | "replacement_sent" | "refunded" | "closed";
  type: "missing_item" | "damaged_item" | "wrong_item";
  lineItemIds: string[];
  replacementFulfillmentId: string | null;
  refundAmount: string | null;
  createdAt: string;
};

export type Exchange = {
  id: string;
  orderId: string;
  status: "requested" | "received" | "fulfilled" | "canceled";
  returnLineItemIds: string[];
  replacementLineItems: OrderLineItem[];
  additionalTotal: string;
  createdAt: string;
};

export type Refund = {
  id: string;
  orderId: string;
  status: "requested" | "processed" | "failed";
  amount: string;
  reason: string;
  createdAt: string;
  processedAt: string | null;
};

export type CommerceOrder = {
  id: string;
  displayId: string;
  invoiceId: string;
  customerName: string;
  customerEmail: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  total: string;
  amountReceived: string;
  paymentId: string;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  salesChannelId: string;
  salesChannelName: string;
  refundStatus: "none" | "requested" | "refunded";
  disputeStatus: "none" | "open";
  inventoryReservationStatus: "not_required" | "reserved" | "short";
  captureStatus: "not_ready" | "ready" | "captured";
  lineItems: OrderLineItem[];
  fulfillments: Fulfillment[];
  shipments: Shipment[];
  returns: Return[];
  claims: Claim[];
  exchanges: Exchange[];
  refunds: Refund[];
  attentionReasons: string[];
  timeline: OrderTimelineEvent[];
  metadata: Record<string, string>;
};

export type StockLocation = {
  id: string;
  name: string;
  type: "warehouse" | "digital" | "partner";
  city: string;
  country: string;
  status: "active" | "paused";
  channelIds: string[];
  shippingOptionIds: string[];
};

export type InventoryItem = {
  id: string;
  sku: string;
  title: string;
  productId: string;
  variantId: string;
  locationId: string;
  locationName: string;
  stockedQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  reorderPoint: number;
  status: "in_stock" | "low_stock" | "out_of_stock" | "digital";
  channelIds: string[];
  updatedAt: string;
};

export type Promotion = {
  id: string;
  code: string;
  name: string;
  type: "percent" | "fixed" | "store_credit" | "gift_card";
  status: "active" | "scheduled" | "paused" | "expired";
  value: string;
  startsAt: string;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  budgetAtomic: string | null;
  usedAtomic: string;
  channelIds: string[];
};

export type SalesChannel = {
  id: string;
  name: string;
  type: "hosted_checkout" | "payment_links" | "plugin" | "partner";
  status: "active" | "testing" | "paused";
  productCount: number;
  orderCount: number;
  revenueAtomic: string;
  keyType: "publishable" | "secret" | "plugin";
  lastOrderAt: string | null;
};

export type CommerceCurrency = "DERO" | "USD";

export type ProductOption = {
  id: string;
  title: string;
  values: string[];
};

export type ProductVariant = {
  id: string;
  title: string;
  sku: string;
  priceAtomic: string;
  currency: CommerceCurrency;
  options: Record<string, string>;
  inventoryItemId: string | null;
  manageInventory: boolean;
  allowBackorder: boolean;
  stockLocationIds: string[];
  channelIds: string[];
};

export type ProductCategory = {
  id: string;
  name: string;
  handle: string;
  parentId: string | null;
  status: "active" | "internal";
  productCount: number;
};

export type ProductCollection = {
  id: string;
  title: string;
  handle: string;
  productCount: number;
  channelIds: string[];
};

export type ProductTag = {
  id: string;
  value: string;
  productCount: number;
};

export type ProductType = {
  id: string;
  value: string;
  productCount: number;
};

export type CommerceProduct = {
  id: string;
  paymentProductId: string | null;
  name: string;
  handle: string;
  subtitle: string;
  description: string;
  status: "published" | "draft" | "archived";
  thumbnailUrl: string | null;
  typeId: string;
  categoryIds: string[];
  collectionIds: string[];
  tagIds: string[];
  salesChannelIds: string[];
  options: ProductOption[];
  variants: ProductVariant[];
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type PriceListRule = {
  id: string;
  attribute: "customer_group" | "sales_channel" | "product_category" | "product_tag";
  operator: "in" | "not_in";
  values: string[];
};

export type PriceListPrice = {
  id: string;
  variantId: string;
  amountAtomic: string;
  currency: CommerceCurrency;
};

export type PriceList = {
  id: string;
  name: string;
  description: string;
  type: "sale" | "override";
  status: "active" | "draft" | "scheduled" | "expired";
  startsAt: string | null;
  endsAt: string | null;
  customerGroupIds: string[];
  salesChannelIds: string[];
  productIds: string[];
  variantIds: string[];
  rules: PriceListRule[];
  prices: PriceListPrice[];
  createdAt: string;
  updatedAt: string;
};

export type DraftOrder = {
  id: string;
  displayId: string;
  status: "open" | "converted" | "canceled";
  customerName: string;
  customerEmail: string;
  regionId: string;
  salesChannelId: string;
  lineItems: OrderLineItem[];
  subtotal: string;
  shippingTotal: string;
  taxTotal: string;
  total: string;
  createdAt: string;
  expiresAt: string | null;
  metadata: Record<string, string>;
};

export type CommerceCurrencySetting = {
  code: CommerceCurrency;
  symbol: string;
  decimalDigits: number;
  default: boolean;
  enabled: boolean;
};

export type PaymentProvider = {
  id: string;
  name: string;
  code: string;
  status: "enabled" | "testing" | "disabled";
  regionIds: string[];
};

export type FulfillmentProvider = {
  id: string;
  name: string;
  code: string;
  status: "enabled" | "testing" | "disabled";
  locationIds: string[];
};

export type Region = {
  id: string;
  name: string;
  currencyCode: CommerceCurrency;
  countryCodes: string[];
  paymentProviderIds: string[];
  fulfillmentProviderIds: string[];
  taxInclusivePricing: boolean;
  automaticTaxes: boolean;
  createdAt: string;
};

export type TaxRegion = {
  id: string;
  regionId: string;
  countryCode: string;
  provinceCode: string | null;
  taxRate: number;
  taxCode: string;
  includesTax: boolean;
  overrides: Array<{
    id: string;
    target: "product_type" | "product_category" | "shipping";
    targetId: string;
    rate: number;
  }>;
};

export type ShippingProfile = {
  id: string;
  name: string;
  type: "default" | "digital" | "gift_card" | "custom";
  productIds: string[];
};

export type ShippingOption = {
  id: string;
  name: string;
  regionId: string;
  profileId: string;
  providerId: string;
  locationId: string;
  priceAtomic: string;
  currencyCode: CommerceCurrency;
  countries: string[];
  enabled: boolean;
};

export type ReturnReason = {
  id: string;
  label: string;
  value: string;
  description: string;
  requiresNote: boolean;
  enabled: boolean;
};

const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
const futureIso = (days: number) => new Date(now + days * 86_400_000).toISOString();

export const STOCK_LOCATIONS: StockLocation[] = [
  {
    id: "loc_main",
    name: "Primary warehouse",
    type: "warehouse",
    city: "Austin",
    country: "US",
    status: "active",
    channelIds: ["ch_hosted", "ch_links", "ch_medusa"],
    shippingOptionIds: ["ship_us_ground", "ship_us_priority"],
  },
  {
    id: "loc_digital",
    name: "Digital fulfillment",
    type: "digital",
    city: "Remote",
    country: "Global",
    status: "active",
    channelIds: ["ch_hosted", "ch_links", "ch_medusa"],
    shippingOptionIds: ["ship_digital_delivery"],
  },
  {
    id: "loc_partner",
    name: "Partner stock",
    type: "partner",
    city: "Chicago",
    country: "US",
    status: "active",
    channelIds: ["ch_partners"],
    shippingOptionIds: ["ship_partner_standard"],
  },
];

export const INVENTORY_ITEMS: InventoryItem[] = [
  {
    id: "ii_hoodie_xl",
    sku: "DERO-HOODIE-XL",
    title: "Dero Hoodie / XL",
    productId: "prod_hoodie",
    variantId: "var_hoodie_xl",
    locationId: "loc_main",
    locationName: "Primary warehouse",
    stockedQuantity: 24,
    reservedQuantity: 3,
    availableQuantity: 21,
    reorderPoint: 8,
    status: "in_stock",
    channelIds: ["ch_hosted", "ch_links"],
    updatedAt: iso(1),
  },
  {
    id: "ii_mug_set",
    sku: "DERO-MUG-SET-3",
    title: "Coffee Mug Set / 3 pack",
    productId: "prod_mug_set",
    variantId: "var_mug_set_3",
    locationId: "loc_main",
    locationName: "Primary warehouse",
    stockedQuantity: 9,
    reservedQuantity: 6,
    availableQuantity: 3,
    reorderPoint: 6,
    status: "low_stock",
    channelIds: ["ch_hosted", "ch_partners"],
    updatedAt: iso(0),
  },
  {
    id: "ii_sticker_pack",
    sku: "DERO-STICKERS-PRIVACY",
    title: "Privacy Sticker Pack",
    productId: "prod_stickers",
    variantId: "var_stickers_default",
    locationId: "loc_partner",
    locationName: "Partner stock",
    stockedQuantity: 0,
    reservedQuantity: 0,
    availableQuantity: 0,
    reorderPoint: 20,
    status: "out_of_stock",
    channelIds: ["ch_partners"],
    updatedAt: iso(3),
  },
  {
    id: "ii_api_access",
    sku: "DERO-API-MONTHLY",
    title: "API Access / Monthly",
    productId: "prod_api_access",
    variantId: "var_api_monthly",
    locationId: "loc_digital",
    locationName: "Digital fulfillment",
    stockedQuantity: 9999,
    reservedQuantity: 0,
    availableQuantity: 9999,
    reorderPoint: 0,
    status: "digital",
    channelIds: ["ch_medusa", "ch_hosted"],
    updatedAt: iso(0),
  },
  {
    id: "ii_vpn_six_months",
    sku: "DERO-VPN-6M",
    title: "VPN / 6 months",
    productId: "prod_vpn",
    variantId: "var_vpn_6m",
    locationId: "loc_digital",
    locationName: "Digital fulfillment",
    stockedQuantity: 9999,
    reservedQuantity: 0,
    availableQuantity: 9999,
    reorderPoint: 0,
    status: "digital",
    channelIds: ["ch_hosted"],
    updatedAt: iso(2),
  },
];

export const PROMOTIONS: Promotion[] = [
  {
    id: "promo_privacy10",
    code: "PRIVACY10",
    name: "Privacy starter offer",
    type: "percent",
    status: "active",
    value: "10%",
    startsAt: iso(14),
    endsAt: futureIso(16),
    usageLimit: 500,
    usageCount: 128,
    budgetAtomic: "25000000",
    usedAtomic: "6300000",
    channelIds: ["ch_hosted", "ch_links"],
  },
  {
    id: "promo_annual15",
    code: "ANNUAL15",
    name: "Annual plan push",
    type: "percent",
    status: "active",
    value: "15%",
    startsAt: iso(30),
    endsAt: futureIso(30),
    usageLimit: 200,
    usageCount: 42,
    budgetAtomic: "50000000",
    usedAtomic: "11700000",
    channelIds: ["ch_medusa", "ch_hosted"],
  },
  {
    id: "credit_vip",
    code: "VIP-CREDIT",
    name: "VIP store credit",
    type: "store_credit",
    status: "active",
    value: "25 DERO",
    startsAt: iso(7),
    endsAt: null,
    usageLimit: null,
    usageCount: 18,
    budgetAtomic: "100000000",
    usedAtomic: "45000000",
    channelIds: ["ch_hosted"],
  },
  {
    id: "gift_spring",
    code: "SPRING-GIFT",
    name: "Spring gift card drop",
    type: "gift_card",
    status: "scheduled",
    value: "50 DERO",
    startsAt: futureIso(3),
    endsAt: futureIso(33),
    usageLimit: 100,
    usageCount: 0,
    budgetAtomic: "500000000",
    usedAtomic: "0",
    channelIds: ["ch_links", "ch_partners"],
  },
];

export const SALES_CHANNELS: SalesChannel[] = [
  {
    id: "ch_hosted",
    name: "Hosted checkout",
    type: "hosted_checkout",
    status: "active",
    productCount: 12,
    orderCount: 84,
    revenueAtomic: "91000000",
    keyType: "publishable",
    lastOrderAt: iso(0),
  },
  {
    id: "ch_links",
    name: "Payment links",
    type: "payment_links",
    status: "active",
    productCount: 7,
    orderCount: 51,
    revenueAtomic: "42000000",
    keyType: "publishable",
    lastOrderAt: iso(1),
  },
  {
    id: "ch_medusa",
    name: "Medusa plugin",
    type: "plugin",
    status: "testing",
    productCount: 4,
    orderCount: 16,
    revenueAtomic: "12500000",
    keyType: "plugin",
    lastOrderAt: iso(2),
  },
  {
    id: "ch_partners",
    name: "Partner referrals",
    type: "partner",
    status: "active",
    productCount: 5,
    orderCount: 29,
    revenueAtomic: "23000000",
    keyType: "secret",
    lastOrderAt: iso(0),
  },
];

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  {
    id: "pcat_services",
    name: "Services",
    handle: "services",
    parentId: null,
    status: "active",
    productCount: 3,
  },
  {
    id: "pcat_subscriptions",
    name: "Subscriptions",
    handle: "subscriptions",
    parentId: "pcat_services",
    status: "active",
    productCount: 2,
  },
  {
    id: "pcat_merch",
    name: "Merchandise",
    handle: "merchandise",
    parentId: null,
    status: "active",
    productCount: 3,
  },
  {
    id: "pcat_digital",
    name: "Digital delivery",
    handle: "digital-delivery",
    parentId: null,
    status: "active",
    productCount: 3,
  },
];

export const PRODUCT_COLLECTIONS: ProductCollection[] = [
  {
    id: "pcol_privacy",
    title: "Privacy starter",
    handle: "privacy-starter",
    productCount: 4,
    channelIds: ["ch_hosted", "ch_links"],
  },
  {
    id: "pcol_integrations",
    title: "Integration ready",
    handle: "integration-ready",
    productCount: 2,
    channelIds: ["ch_medusa", "ch_hosted"],
  },
  {
    id: "pcol_merch",
    title: "Physical merch",
    handle: "physical-merch",
    productCount: 3,
    channelIds: ["ch_hosted", "ch_partners"],
  },
];

export const PRODUCT_TAGS: ProductTag[] = [
  { id: "ptag_digital", value: "digital", productCount: 3 },
  { id: "ptag_physical", value: "physical", productCount: 3 },
  { id: "ptag_subscription", value: "subscription", productCount: 2 },
  { id: "ptag_dero", value: "dero", productCount: 6 },
  { id: "ptag_featured", value: "featured", productCount: 4 },
];

export const PRODUCT_TYPES: ProductType[] = [
  { id: "ptype_service", value: "Service", productCount: 2 },
  { id: "ptype_license", value: "License", productCount: 2 },
  { id: "ptype_merch", value: "Merchandise", productCount: 3 },
];

export const COMMERCE_PRODUCTS: CommerceProduct[] = [
  {
    id: "prod_privacy_audit",
    paymentProductId: "prd_demo_01",
    name: "Privacy Audit Pack",
    handle: "privacy-audit-pack",
    subtitle: "One-time deliverable",
    description: "Comprehensive privacy review of your DERO integration with an actionable remediation report.",
    status: "published",
    thumbnailUrl: null,
    typeId: "ptype_service",
    categoryIds: ["pcat_services", "pcat_digital"],
    collectionIds: ["pcol_integrations", "pcol_privacy"],
    tagIds: ["ptag_digital", "ptag_dero", "ptag_featured"],
    salesChannelIds: ["ch_hosted", "ch_medusa"],
    options: [
      { id: "opt_audit_scope", title: "Scope", values: ["Standard", "Deep"] },
    ],
    variants: [
      {
        id: "var_audit_standard",
        title: "Standard",
        sku: "DERO-AUDIT-STD",
        priceAtomic: "12000000",
        currency: "DERO",
        options: { Scope: "Standard" },
        inventoryItemId: null,
        manageInventory: false,
        allowBackorder: true,
        stockLocationIds: ["loc_digital"],
        channelIds: ["ch_hosted", "ch_medusa"],
      },
      {
        id: "var_audit_deep",
        title: "Deep",
        sku: "DERO-AUDIT-DEEP",
        priceAtomic: "126000000",
        currency: "DERO",
        options: { Scope: "Deep" },
        inventoryItemId: null,
        manageInventory: false,
        allowBackorder: true,
        stockLocationIds: ["loc_digital"],
        channelIds: ["ch_medusa"],
      },
    ],
    metadata: { fulfillment: "report-pdf", source: "payment_product" },
    createdAt: iso(40),
    updatedAt: iso(2),
  },
  {
    id: "prod_api_access",
    paymentProductId: "prd_demo_02",
    name: "DeroPay Starter",
    handle: "deropay-starter",
    subtitle: "Hosted checkout and API",
    description: "Hosted gateway, dashboard, and checkout widget for small merchants.",
    status: "published",
    thumbnailUrl: null,
    typeId: "ptype_service",
    categoryIds: ["pcat_services", "pcat_subscriptions", "pcat_digital"],
    collectionIds: ["pcol_integrations", "pcol_privacy"],
    tagIds: ["ptag_digital", "ptag_subscription", "ptag_dero", "ptag_featured"],
    salesChannelIds: ["ch_hosted", "ch_medusa", "ch_links"],
    options: [
      { id: "opt_starter_cadence", title: "Cadence", values: ["Monthly", "Annual"] },
    ],
    variants: [
      {
        id: "var_api_monthly",
        title: "Monthly",
        sku: "DERO-API-MONTHLY",
        priceAtomic: "2500000",
        currency: "DERO",
        options: { Cadence: "Monthly" },
        inventoryItemId: "ii_api_access",
        manageInventory: false,
        allowBackorder: true,
        stockLocationIds: ["loc_digital"],
        channelIds: ["ch_hosted", "ch_medusa", "ch_links"],
      },
      {
        id: "var_api_annual",
        title: "Annual",
        sku: "DERO-API-ANNUAL",
        priceAtomic: "25000000",
        currency: "DERO",
        options: { Cadence: "Annual" },
        inventoryItemId: null,
        manageInventory: false,
        allowBackorder: true,
        stockLocationIds: ["loc_digital"],
        channelIds: ["ch_hosted", "ch_medusa"],
      },
    ],
    metadata: { fulfillment: "account-entitlement", source: "payment_product" },
    createdAt: iso(60),
    updatedAt: iso(10),
  },
  {
    id: "prod_vpn",
    paymentProductId: null,
    name: "Privacy VPN",
    handle: "privacy-vpn",
    subtitle: "Private access subscription",
    description: "DERO-paid privacy VPN access fulfilled through digital delivery.",
    status: "draft",
    thumbnailUrl: null,
    typeId: "ptype_service",
    categoryIds: ["pcat_services", "pcat_subscriptions", "pcat_digital"],
    collectionIds: ["pcol_privacy"],
    tagIds: ["ptag_digital", "ptag_subscription", "ptag_dero"],
    salesChannelIds: ["ch_hosted"],
    options: [{ id: "opt_vpn_term", title: "Term", values: ["6 months", "12 months"] }],
    variants: [
      {
        id: "var_vpn_6m",
        title: "6 months",
        sku: "DERO-VPN-6M",
        priceAtomic: "4200000",
        currency: "DERO",
        options: { Term: "6 months" },
        inventoryItemId: "ii_vpn_six_months",
        manageInventory: false,
        allowBackorder: true,
        stockLocationIds: ["loc_digital"],
        channelIds: ["ch_hosted"],
      },
      {
        id: "var_vpn_12m",
        title: "12 months",
        sku: "DERO-VPN-12M",
        priceAtomic: "7800000",
        currency: "DERO",
        options: { Term: "12 months" },
        inventoryItemId: null,
        manageInventory: false,
        allowBackorder: true,
        stockLocationIds: ["loc_digital"],
        channelIds: ["ch_hosted"],
      },
    ],
    metadata: { fulfillment: "account-entitlement", source: "commerce_seed" },
    createdAt: iso(18),
    updatedAt: iso(2),
  },
  {
    id: "prod_hoodie",
    paymentProductId: null,
    name: "Dero Hoodie",
    handle: "dero-hoodie",
    subtitle: "Physical apparel",
    description: "Heavy cotton hoodie with DeroPay merchant mark.",
    status: "published",
    thumbnailUrl: null,
    typeId: "ptype_merch",
    categoryIds: ["pcat_merch"],
    collectionIds: ["pcol_merch"],
    tagIds: ["ptag_physical", "ptag_dero", "ptag_featured"],
    salesChannelIds: ["ch_hosted", "ch_links"],
    options: [
      { id: "opt_hoodie_size", title: "Size", values: ["M", "L", "XL"] },
      { id: "opt_hoodie_color", title: "Color", values: ["Black", "Moss"] },
    ],
    variants: [
      {
        id: "var_hoodie_l",
        title: "Black / L",
        sku: "DERO-HOODIE-L",
        priceAtomic: "8500000",
        currency: "DERO",
        options: { Color: "Black", Size: "L" },
        inventoryItemId: null,
        manageInventory: true,
        allowBackorder: false,
        stockLocationIds: ["loc_main"],
        channelIds: ["ch_hosted", "ch_links"],
      },
      {
        id: "var_hoodie_xl",
        title: "Black / XL",
        sku: "DERO-HOODIE-XL",
        priceAtomic: "8500000",
        currency: "DERO",
        options: { Color: "Black", Size: "XL" },
        inventoryItemId: "ii_hoodie_xl",
        manageInventory: true,
        allowBackorder: false,
        stockLocationIds: ["loc_main"],
        channelIds: ["ch_hosted", "ch_links"],
      },
    ],
    metadata: { fulfillment: "ship", source: "commerce_seed" },
    createdAt: iso(32),
    updatedAt: iso(1),
  },
  {
    id: "prod_mug_set",
    paymentProductId: null,
    name: "Coffee Mug Set",
    handle: "coffee-mug-set",
    subtitle: "Physical bundle",
    description: "Three-pack ceramic mug bundle for checkout demo kits.",
    status: "published",
    thumbnailUrl: null,
    typeId: "ptype_merch",
    categoryIds: ["pcat_merch"],
    collectionIds: ["pcol_merch"],
    tagIds: ["ptag_physical", "ptag_dero"],
    salesChannelIds: ["ch_hosted", "ch_partners"],
    options: [{ id: "opt_mug_pack", title: "Pack", values: ["3 pack"] }],
    variants: [
      {
        id: "var_mug_set_3",
        title: "3 pack",
        sku: "DERO-MUG-SET-3",
        priceAtomic: "3600000",
        currency: "DERO",
        options: { Pack: "3 pack" },
        inventoryItemId: "ii_mug_set",
        manageInventory: true,
        allowBackorder: false,
        stockLocationIds: ["loc_main"],
        channelIds: ["ch_hosted", "ch_partners"],
      },
    ],
    metadata: { fulfillment: "ship", source: "commerce_seed" },
    createdAt: iso(25),
    updatedAt: iso(0),
  },
  {
    id: "prod_stickers",
    paymentProductId: null,
    name: "Privacy Sticker Pack",
    handle: "privacy-sticker-pack",
    subtitle: "Partner-stocked merch",
    description: "DERO and DeroPay stickers for events and partner storefronts.",
    status: "published",
    thumbnailUrl: null,
    typeId: "ptype_merch",
    categoryIds: ["pcat_merch"],
    collectionIds: ["pcol_merch", "pcol_privacy"],
    tagIds: ["ptag_physical", "ptag_dero"],
    salesChannelIds: ["ch_partners"],
    options: [{ id: "opt_sticker_pack", title: "Pack", values: ["Default"] }],
    variants: [
      {
        id: "var_stickers_default",
        title: "Default",
        sku: "DERO-STICKERS-PRIVACY",
        priceAtomic: "900000",
        currency: "DERO",
        options: { Pack: "Default" },
        inventoryItemId: "ii_sticker_pack",
        manageInventory: true,
        allowBackorder: false,
        stockLocationIds: ["loc_partner"],
        channelIds: ["ch_partners"],
      },
    ],
    metadata: { fulfillment: "partner-ship", source: "commerce_seed" },
    createdAt: iso(20),
    updatedAt: iso(3),
  },
];

export const PRICE_LISTS: PriceList[] = [
  {
    id: "plist_launch_sale",
    name: "Launch sale",
    description: "Time-boxed offer across hosted checkout and payment links.",
    type: "sale",
    status: "active",
    startsAt: iso(7),
    endsAt: futureIso(14),
    customerGroupIds: [],
    salesChannelIds: ["ch_hosted", "ch_links"],
    productIds: ["prod_api_access", "prod_privacy_audit"],
    variantIds: ["var_api_monthly", "var_audit_standard"],
    rules: [
      {
        id: "rule_launch_channels",
        attribute: "sales_channel",
        operator: "in",
        values: ["ch_hosted", "ch_links"],
      },
    ],
    prices: [
      {
        id: "price_launch_api_monthly",
        variantId: "var_api_monthly",
        amountAtomic: "2000000",
        currency: "DERO",
      },
      {
        id: "price_launch_audit_standard",
        variantId: "var_audit_standard",
        amountAtomic: "9600000",
        currency: "DERO",
      },
    ],
    createdAt: iso(8),
    updatedAt: iso(1),
  },
  {
    id: "plist_partner_merch",
    name: "Partner merch override",
    description: "Partner-channel pricing for physical merchandise.",
    type: "override",
    status: "active",
    startsAt: iso(21),
    endsAt: null,
    customerGroupIds: ["cg_partners"],
    salesChannelIds: ["ch_partners"],
    productIds: ["prod_mug_set", "prod_stickers"],
    variantIds: ["var_mug_set_3", "var_stickers_default"],
    rules: [
      {
        id: "rule_partner_channel",
        attribute: "sales_channel",
        operator: "in",
        values: ["ch_partners"],
      },
      {
        id: "rule_partner_category",
        attribute: "product_category",
        operator: "in",
        values: ["pcat_merch"],
      },
    ],
    prices: [
      {
        id: "price_partner_mug",
        variantId: "var_mug_set_3",
        amountAtomic: "3100000",
        currency: "DERO",
      },
      {
        id: "price_partner_stickers",
        variantId: "var_stickers_default",
        amountAtomic: "700000",
        currency: "DERO",
      },
    ],
    createdAt: iso(21),
    updatedAt: iso(0),
  },
  {
    id: "plist_annual_push",
    name: "Annual plan push",
    description: "Scheduled yearly-plan discount for subscription products.",
    type: "sale",
    status: "scheduled",
    startsAt: futureIso(3),
    endsAt: futureIso(33),
    customerGroupIds: ["cg_vip"],
    salesChannelIds: ["ch_medusa", "ch_hosted"],
    productIds: ["prod_api_access", "prod_vpn"],
    variantIds: ["var_api_annual", "var_vpn_12m"],
    rules: [
      {
        id: "rule_annual_tag",
        attribute: "product_tag",
        operator: "in",
        values: ["ptag_subscription"],
      },
    ],
    prices: [
      {
        id: "price_annual_api",
        variantId: "var_api_annual",
        amountAtomic: "21250000",
        currency: "DERO",
      },
      {
        id: "price_annual_vpn",
        variantId: "var_vpn_12m",
        amountAtomic: "6600000",
        currency: "DERO",
      },
    ],
    createdAt: iso(4),
    updatedAt: iso(0),
  },
];

export const COMMERCE_CURRENCIES: CommerceCurrencySetting[] = [
  {
    code: "DERO",
    symbol: "DERO",
    decimalDigits: 12,
    default: true,
    enabled: true,
  },
  {
    code: "USD",
    symbol: "$",
    decimalDigits: 2,
    default: false,
    enabled: true,
  },
];

export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  {
    id: "pay_deropay_direct",
    name: "DeroPay direct",
    code: "deropay",
    status: "enabled",
    regionIds: ["reg_us", "reg_global"],
  },
  {
    id: "pay_deropay_test",
    name: "DeroPay test mode",
    code: "deropay_test",
    status: "testing",
    regionIds: ["reg_us"],
  },
];

export const FULFILLMENT_PROVIDERS: FulfillmentProvider[] = [
  {
    id: "fp_manual",
    name: "Manual fulfillment",
    code: "manual",
    status: "enabled",
    locationIds: ["loc_main", "loc_partner"],
  },
  {
    id: "fp_digital",
    name: "Digital delivery",
    code: "digital",
    status: "enabled",
    locationIds: ["loc_digital"],
  },
  {
    id: "fp_partner",
    name: "Partner carrier",
    code: "partner_carrier",
    status: "testing",
    locationIds: ["loc_partner"],
  },
];

export const REGIONS: Region[] = [
  {
    id: "reg_us",
    name: "United States",
    currencyCode: "DERO",
    countryCodes: ["US"],
    paymentProviderIds: ["pay_deropay_direct", "pay_deropay_test"],
    fulfillmentProviderIds: ["fp_manual", "fp_digital"],
    taxInclusivePricing: false,
    automaticTaxes: true,
    createdAt: iso(90),
  },
  {
    id: "reg_global",
    name: "Global digital",
    currencyCode: "DERO",
    countryCodes: ["CA", "GB", "AU", "DE", "NL"],
    paymentProviderIds: ["pay_deropay_direct"],
    fulfillmentProviderIds: ["fp_digital"],
    taxInclusivePricing: true,
    automaticTaxes: false,
    createdAt: iso(60),
  },
];

export const TAX_REGIONS: TaxRegion[] = [
  {
    id: "tax_us_default",
    regionId: "reg_us",
    countryCode: "US",
    provinceCode: null,
    taxRate: 6.25,
    taxCode: "US-STANDARD",
    includesTax: false,
    overrides: [
      {
        id: "tax_us_digital",
        target: "product_category",
        targetId: "pcat_digital",
        rate: 0,
      },
      {
        id: "tax_us_shipping",
        target: "shipping",
        targetId: "shipping",
        rate: 4,
      },
    ],
  },
  {
    id: "tax_global_vat",
    regionId: "reg_global",
    countryCode: "GB",
    provinceCode: null,
    taxRate: 20,
    taxCode: "VAT-DIGITAL",
    includesTax: true,
    overrides: [],
  },
];

export const SHIPPING_PROFILES: ShippingProfile[] = [
  {
    id: "sp_default",
    name: "Physical products",
    type: "default",
    productIds: ["prod_hoodie", "prod_mug_set", "prod_stickers"],
  },
  {
    id: "sp_digital",
    name: "Digital delivery",
    type: "digital",
    productIds: ["prod_privacy_audit", "prod_api_access", "prod_vpn"],
  },
  {
    id: "sp_gift_cards",
    name: "Gift cards",
    type: "gift_card",
    productIds: [],
  },
];

export const SHIPPING_OPTIONS: ShippingOption[] = [
  {
    id: "ship_us_ground",
    name: "US ground",
    regionId: "reg_us",
    profileId: "sp_default",
    providerId: "fp_manual",
    locationId: "loc_main",
    priceAtomic: "600000",
    currencyCode: "DERO",
    countries: ["US"],
    enabled: true,
  },
  {
    id: "ship_us_priority",
    name: "US priority",
    regionId: "reg_us",
    profileId: "sp_default",
    providerId: "fp_manual",
    locationId: "loc_main",
    priceAtomic: "1200000",
    currencyCode: "DERO",
    countries: ["US"],
    enabled: true,
  },
  {
    id: "ship_digital_delivery",
    name: "Instant digital delivery",
    regionId: "reg_global",
    profileId: "sp_digital",
    providerId: "fp_digital",
    locationId: "loc_digital",
    priceAtomic: "0",
    currencyCode: "DERO",
    countries: ["US", "CA", "GB", "AU", "DE", "NL"],
    enabled: true,
  },
  {
    id: "ship_partner_standard",
    name: "Partner standard",
    regionId: "reg_us",
    profileId: "sp_default",
    providerId: "fp_partner",
    locationId: "loc_partner",
    priceAtomic: "400000",
    currencyCode: "DERO",
    countries: ["US"],
    enabled: true,
  },
];

export const RETURN_REASONS: ReturnReason[] = [
  {
    id: "rr_wrong_size",
    label: "Wrong size",
    value: "wrong_size",
    description: "Customer ordered a wearable item that does not fit.",
    requiresNote: false,
    enabled: true,
  },
  {
    id: "rr_damaged",
    label: "Damaged",
    value: "damaged",
    description: "Item arrived damaged or unusable.",
    requiresNote: true,
    enabled: true,
  },
  {
    id: "rr_not_as_described",
    label: "Not as described",
    value: "not_as_described",
    description: "Customer reports mismatch with catalog description.",
    requiresNote: true,
    enabled: true,
  },
  {
    id: "rr_no_longer_needed",
    label: "No longer needed",
    value: "no_longer_needed",
    description: "Customer changed their mind before using the product.",
    requiresNote: false,
    enabled: true,
  },
];

export const DRAFT_ORDERS: DraftOrder[] = [
  {
    id: "draft_privacy_bundle",
    displayId: "DRAFT-1007",
    status: "open",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.test",
    regionId: "reg_us",
    salesChannelId: "ch_hosted",
    lineItems: [
      {
        id: "li_draft_hoodie",
        title: "Dero Hoodie / Black / XL",
        sku: "DERO-HOODIE-XL",
        productId: "prod_hoodie",
        variantId: "var_hoodie_xl",
        quantity: 1,
        unitPrice: "8500000",
        total: "8500000",
        inventoryItemId: "ii_hoodie_xl",
      },
      {
        id: "li_draft_api",
        title: "DeroPay Starter / Monthly",
        sku: "DERO-API-MONTHLY",
        productId: "prod_api_access",
        variantId: "var_api_monthly",
        quantity: 1,
        unitPrice: "2500000",
        total: "2500000",
        inventoryItemId: "ii_api_access",
      },
    ],
    subtotal: "11000000",
    shippingTotal: "600000",
    taxTotal: "725000",
    total: "12325000",
    createdAt: iso(1),
    expiresAt: futureIso(6),
    metadata: { source: "manual_quote", owner: "ops" },
  },
  {
    id: "draft_partner_restock",
    displayId: "DRAFT-1008",
    status: "open",
    customerName: "Partner storefront",
    customerEmail: "ops@partner.example.test",
    regionId: "reg_us",
    salesChannelId: "ch_partners",
    lineItems: [
      {
        id: "li_draft_stickers",
        title: "Privacy Sticker Pack",
        sku: "DERO-STICKERS-PRIVACY",
        productId: "prod_stickers",
        variantId: "var_stickers_default",
        quantity: 20,
        unitPrice: "900000",
        total: "18000000",
        inventoryItemId: "ii_sticker_pack",
      },
    ],
    subtotal: "18000000",
    shippingTotal: "400000",
    taxTotal: "1150000",
    total: "19550000",
    createdAt: iso(2),
    expiresAt: futureIso(4),
    metadata: { source: "partner_quote", owner: "commerce" },
  },
];

export function findCommerceProduct(id: string): CommerceProduct | null {
  return (
    COMMERCE_PRODUCTS.find(
      (product) =>
        product.id === id ||
        product.paymentProductId === id ||
        product.handle === id,
    ) ?? null
  );
}

export function variantCount(products = COMMERCE_PRODUCTS): number {
  return products.reduce((sum, product) => sum + product.variants.length, 0);
}

export function priceListCoverage(priceLists = PRICE_LISTS): number {
  const variants = new Set<string>();
  for (const list of priceLists) {
    for (const variantId of list.variantIds) variants.add(variantId);
    for (const price of list.prices) variants.add(price.variantId);
  }
  return variants.size;
}

export function activePriceLists(priceLists = PRICE_LISTS): PriceList[] {
  return priceLists.filter((list) => list.status === "active");
}

export function orderStatus(invoiceStatus: string | undefined): OrderStatus {
  switch (invoiceStatus) {
    case "completed":
    case "paid":
      return "completed";
    case "confirming":
    case "detected":
      return "processing";
    case "partial":
      return "requires_attention";
    case "expired":
    case "cancelled":
    case "canceled":
      return "canceled";
    default:
      return "pending";
  }
}

export function paymentStatus(invoiceStatus: string | undefined): PaymentStatus {
  switch (invoiceStatus) {
    case "completed":
    case "paid":
      return "captured";
    case "confirming":
    case "detected":
      return "authorized";
    case "partial":
      return "partially_paid";
    case "expired":
      return "expired";
    default:
      return "awaiting";
  }
}

function isPhysicalTitle(title: string): boolean {
  return /hoodie|mug|sticker|shirt|pack|merch/i.test(title);
}

function inventoryForTitle(title: string): InventoryItem | undefined {
  const lower = title.toLowerCase();
  if (lower.includes("hoodie")) return INVENTORY_ITEMS.find((i) => i.id === "ii_hoodie_xl");
  if (lower.includes("mug")) return INVENTORY_ITEMS.find((i) => i.id === "ii_mug_set");
  if (lower.includes("sticker")) return INVENTORY_ITEMS.find((i) => i.id === "ii_sticker_pack");
  if (lower.includes("api")) return INVENTORY_ITEMS.find((i) => i.id === "ii_api_access");
  if (lower.includes("vpn")) return INVENTORY_ITEMS.find((i) => i.id === "ii_vpn_six_months");
  return undefined;
}

function channelForInvoice(inv: InvoiceRow): SalesChannel {
  const seed = inv.paymentId ? Number.parseInt(inv.paymentId, 10) : inv.id.length;
  const channels = SALES_CHANNELS;
  return channels[Math.abs(Number.isFinite(seed) ? seed : inv.id.length) % channels.length]!;
}

function buildLineItem(inv: InvoiceRow): OrderLineItem {
  const title = inv.name || "Direct checkout";
  const item = inventoryForTitle(title);
  return {
    id: `li_${inv.id}`,
    title,
    sku: item?.sku ?? "DERO-CHECKOUT",
    productId: item?.productId ?? "prod_direct_checkout",
    variantId: item?.variantId ?? "var_default",
    quantity: 1,
    unitPrice: inv.amount ?? "0",
    total: inv.amount ?? "0",
    inventoryItemId: item?.id,
  };
}

function fulfillmentStatusFor(inv: InvoiceRow): FulfillmentStatus {
  const title = inv.name || "";
  if (!isPhysicalTitle(title)) return "not_required";
  if (orderStatus(inv.status) === "completed") return "reserved";
  if (orderStatus(inv.status) === "canceled") return "pending";
  return "pending";
}

function reservationStatus(inv: InvoiceRow): CommerceOrder["inventoryReservationStatus"] {
  const title = inv.name || "";
  if (!isPhysicalTitle(title)) return "not_required";
  const item = inventoryForTitle(title);
  if (!item || item.availableQuantity <= 0) return "short";
  return "reserved";
}

function buildTimeline(inv: InvoiceRow): OrderTimelineEvent[] {
  const createdAt = inv.createdAt ?? new Date(0).toISOString();
  const timeline: OrderTimelineEvent[] = [
    {
      id: `evt_${inv.id}_created`,
      label: "Order created",
      description: "Invoice and checkout intent were created.",
      at: createdAt,
      tone: "info",
    },
  ];

  const status = orderStatus(inv.status);
  if (status === "processing") {
    timeline.push({
      id: `evt_${inv.id}_detected`,
      label: "Payment detected",
      description: "Funds are visible and waiting for confirmation.",
      at: inv.completedAt ?? createdAt,
      tone: "info",
    });
  }
  if (status === "completed") {
    timeline.push({
      id: `evt_${inv.id}_paid`,
      label: "Payment captured",
      description: "DERO payment was fully received.",
      at: inv.completedAt ?? createdAt,
      tone: "positive",
    });
  }
  if (status === "requires_attention") {
    timeline.push({
      id: `evt_${inv.id}_partial`,
      label: "Partial payment",
      description: "Amount received is below the order total.",
      at: inv.completedAt ?? createdAt,
      tone: "warn",
    });
  }
  if (status === "canceled") {
    timeline.push({
      id: `evt_${inv.id}_expired`,
      label: "Checkout expired",
      description: "Payment window closed before full capture.",
      at: inv.expiresAt ?? createdAt,
      tone: "danger",
    });
  }
  return timeline;
}

function captureStatusFor(status: PaymentStatus): CommerceOrder["captureStatus"] {
  if (status === "captured") return "captured";
  if (status === "authorized" || status === "partially_paid") return "ready";
  return "not_ready";
}

function orderOpsFor({
  orderId,
  lineItem,
  payment,
  status,
  fulfillment,
  reservation,
}: {
  orderId: string;
  lineItem: OrderLineItem;
  payment: PaymentStatus;
  status: OrderStatus;
  fulfillment: FulfillmentStatus;
  reservation: CommerceOrder["inventoryReservationStatus"];
}): Pick<
  CommerceOrder,
  | "fulfillments"
  | "shipments"
  | "returns"
  | "claims"
  | "exchanges"
  | "refunds"
  | "attentionReasons"
> {
  const isPhysical = lineItem.inventoryItemId
    ? INVENTORY_ITEMS.some(
        (item) => item.id === lineItem.inventoryItemId && item.locationId !== "loc_digital",
      )
    : isPhysicalTitle(lineItem.title);
  const canFulfill =
    isPhysical &&
    status === "completed" &&
    (fulfillment === "reserved" || fulfillment === "fulfilled");
  const fulfillmentId = `ful_${orderId.slice(-8)}`;

  const fulfillments: Fulfillment[] = canFulfill
    ? [
        {
          id: fulfillmentId,
          orderId,
          status: fulfillment === "fulfilled" ? "shipped" : "packed",
          locationId: lineItem.inventoryItemId === "ii_sticker_pack" ? "loc_partner" : "loc_main",
          providerId: lineItem.inventoryItemId === "ii_sticker_pack" ? "fp_partner" : "fp_manual",
          shippingOptionId:
            lineItem.inventoryItemId === "ii_sticker_pack"
              ? "ship_partner_standard"
              : "ship_us_ground",
          lineItemIds: [lineItem.id],
          createdAt: iso(0),
          shippedAt: fulfillment === "fulfilled" ? iso(0) : null,
        },
      ]
    : [];

  const shipments: Shipment[] =
    fulfillments.length > 0 && fulfillments[0]?.shippedAt
      ? [
          {
            id: `shp_${orderId.slice(-8)}`,
            orderId,
            fulfillmentId,
            carrier: "DeroShip",
            service: "Ground",
            trackingNumber: `DERO${orderId.slice(-6).toUpperCase()}`,
            trackingUrl: `https://tracking.example.test/${orderId.slice(-6)}`,
            shippedAt: fulfillments[0].shippedAt,
            deliveredAt: null,
          },
        ]
      : [];

  const returns: Return[] =
    status === "completed" && lineItem.inventoryItemId === "ii_hoodie_xl"
      ? [
          {
            id: `ret_${orderId.slice(-8)}`,
            orderId,
            status: "requested",
            reasonId: "rr_wrong_size",
            lineItemIds: [lineItem.id],
            refundAmount: lineItem.total,
            requestedAt: iso(0),
            receivedAt: null,
          },
        ]
      : [];

  const claims: Claim[] =
    status === "completed" && lineItem.inventoryItemId === "ii_mug_set"
      ? [
          {
            id: `clm_${orderId.slice(-8)}`,
            orderId,
            status: "open",
            type: "damaged_item",
            lineItemIds: [lineItem.id],
            replacementFulfillmentId: null,
            refundAmount: null,
            createdAt: iso(0),
          },
        ]
      : [];

  const exchanges: Exchange[] =
    status === "completed" && /hoodie/i.test(lineItem.title)
      ? [
          {
            id: `exc_${orderId.slice(-8)}`,
            orderId,
            status: "requested",
            returnLineItemIds: [lineItem.id],
            replacementLineItems: [
              {
                ...lineItem,
                id: `li_exchange_${orderId.slice(-6)}`,
                title: lineItem.title.replace(/XL/i, "L"),
                sku: lineItem.sku.replace(/XL/i, "L"),
                variantId: "var_hoodie_l",
                inventoryItemId: undefined,
              },
            ],
            additionalTotal: "0",
            createdAt: iso(0),
          },
        ]
      : [];

  const refunds: Refund[] =
    payment === "partially_paid"
      ? [
          {
            id: `ref_${orderId.slice(-8)}`,
            orderId,
            status: "requested",
            amount: "0",
            reason: "Partial payment cleanup",
            createdAt: iso(0),
            processedAt: null,
          },
        ]
      : [];

  const attentionReasons = [
    payment === "partially_paid" ? "Partial payment needs review" : null,
    reservation === "short" ? "Inventory is short for at least one line item" : null,
    returns.length > 0 ? "Return requested" : null,
    claims.length > 0 ? "Claim opened" : null,
    exchanges.length > 0 ? "Exchange requested" : null,
  ].filter((reason): reason is string => Boolean(reason));

  return { fulfillments, shipments, returns, claims, exchanges, refunds, attentionReasons };
}

export function mapInvoiceToOrder(inv: InvoiceRow): CommerceOrder {
  const channel = channelForInvoice(inv);
  const lineItem = buildLineItem(inv);
  const status = orderStatus(inv.status);
  const payment = paymentStatus(inv.status);
  const fulfillment = fulfillmentStatusFor(inv);
  const reservation = reservationStatus(inv);
  const ops = orderOpsFor({
    orderId: `ord_${inv.id}`,
    lineItem,
    payment,
    status,
    fulfillment,
    reservation,
  });
  return {
    id: `ord_${inv.id}`,
    displayId: `ORD-${inv.id.slice(-8).toUpperCase()}`,
    invoiceId: inv.id,
    customerName: inv.name || "Direct checkout",
    customerEmail: `customer-${inv.id.replace(/[^a-z0-9]/gi, "").toLowerCase()}@example.test`,
    orderStatus: status,
    paymentStatus: paymentStatus(inv.status),
    fulfillmentStatus: fulfillmentStatusFor(inv),
    total: inv.amount ?? "0",
    amountReceived: inv.amountReceived ?? "0",
    paymentId: inv.paymentId ?? "",
    createdAt: inv.createdAt ?? new Date(0).toISOString(),
    completedAt: inv.completedAt ?? null,
    expiresAt: inv.expiresAt ?? null,
    salesChannelId: channel.id,
    salesChannelName: channel.name,
    refundStatus:
      ops.refunds.some((refund) => refund.status === "processed")
        ? "refunded"
        : ops.refunds.length > 0 || ops.returns.length > 0
          ? "requested"
          : "none",
    disputeStatus: status === "requires_attention" || ops.claims.length > 0 ? "open" : "none",
    inventoryReservationStatus: reservation,
    captureStatus: captureStatusFor(payment),
    lineItems: [lineItem],
    fulfillments: ops.fulfillments,
    shipments: ops.shipments,
    returns: ops.returns,
    claims: ops.claims,
    exchanges: ops.exchanges,
    refunds: ops.refunds,
    attentionReasons: ops.attentionReasons,
    timeline: buildTimeline(inv),
    metadata: {
      invoiceId: inv.id,
      source: "deropay_invoice",
      paymentId: inv.paymentId ?? "",
    },
  };
}

export function findById<T extends { id: string }>(rows: T[], id: string): T | null {
  return rows.find((row) => row.id === id) ?? null;
}
