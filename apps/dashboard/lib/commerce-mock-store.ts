import {
  COMMERCE_CURRENCIES,
  COMMERCE_PRODUCTS,
  DRAFT_ORDERS,
  FULFILLMENT_PROVIDERS,
  INVENTORY_ITEMS,
  PAYMENT_PROVIDERS,
  PRICE_LISTS,
  PRODUCT_CATEGORIES,
  PRODUCT_COLLECTIONS,
  PRODUCT_TAGS,
  PRODUCT_TYPES,
  REGIONS,
  RETURN_REASONS,
  SALES_CHANNELS,
  SHIPPING_OPTIONS,
  SHIPPING_PROFILES,
  STOCK_LOCATIONS,
  TAX_REGIONS,
  type Claim,
  type CommerceCurrency,
  type CommerceCurrencySetting,
  type CommerceOrder,
  type CommerceProduct,
  type DraftOrder,
  type Exchange,
  type Fulfillment,
  type FulfillmentProvider,
  type InventoryItem,
  type OrderLineItem,
  type OrderTimelineEvent,
  type PaymentProvider,
  type PriceList,
  type ProductCategory,
  type ProductCollection,
  type ProductTag,
  type ProductType,
  type ProductVariant,
  type Refund,
  type Region,
  type Return,
  type ReturnReason,
  type SalesChannel,
  type Shipment,
  type ShippingOption,
  type ShippingProfile,
  type StockLocation,
  type TaxRegion,
} from "./commerce";
import {
  commerceDemoSnapshotStatus,
  loadCommerceDemoSnapshot,
  resetCommerceDemoSnapshot,
  saveCommerceDemoSnapshot,
} from "./commerce-demo-store";

type OrderOverlay = Partial<
  Pick<
    CommerceOrder,
    | "orderStatus"
    | "paymentStatus"
    | "fulfillmentStatus"
    | "inventoryReservationStatus"
    | "captureStatus"
    | "amountReceived"
    | "refundStatus"
    | "disputeStatus"
  >
> & {
  fulfillments?: Fulfillment[];
  shipments?: Shipment[];
  returns?: Return[];
  claims?: Claim[];
  exchanges?: Exchange[];
  refunds?: Refund[];
  attentionReasons?: string[];
  timeline?: OrderTimelineEvent[];
};

type StoreState = {
  products: CommerceProduct[];
  categories: ProductCategory[];
  collections: ProductCollection[];
  tags: ProductTag[];
  types: ProductType[];
  salesChannels: SalesChannel[];
  priceLists: PriceList[];
  inventory: InventoryItem[];
  draftOrders: DraftOrder[];
  regions: Region[];
  taxRegions: TaxRegion[];
  locations: StockLocation[];
  shippingProfiles: ShippingProfile[];
  shippingOptions: ShippingOption[];
  returnReasons: ReturnReason[];
  currencies: CommerceCurrencySetting[];
  fulfillmentProviders: FulfillmentProvider[];
  paymentProviders: PaymentProvider[];
  orderOverlays: Map<string, OrderOverlay>;
};

type SerializedStoreState = Omit<StoreState, "orderOverlays"> & {
  orderOverlays: Array<[string, OrderOverlay]>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isoNow(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function createInitialState(): StoreState {
  return {
    products: clone(COMMERCE_PRODUCTS),
    categories: clone(PRODUCT_CATEGORIES),
    collections: clone(PRODUCT_COLLECTIONS),
    tags: clone(PRODUCT_TAGS),
    types: clone(PRODUCT_TYPES),
    salesChannels: clone(SALES_CHANNELS),
    priceLists: clone(PRICE_LISTS),
    inventory: clone(INVENTORY_ITEMS),
    draftOrders: clone(DRAFT_ORDERS),
    regions: clone(REGIONS),
    taxRegions: clone(TAX_REGIONS),
    locations: clone(STOCK_LOCATIONS),
    shippingProfiles: clone(SHIPPING_PROFILES),
    shippingOptions: clone(SHIPPING_OPTIONS),
    returnReasons: clone(RETURN_REASONS),
    currencies: clone(COMMERCE_CURRENCIES),
    fulfillmentProviders: clone(FULFILLMENT_PROVIDERS),
    paymentProviders: clone(PAYMENT_PROVIDERS),
    orderOverlays: new Map(),
  };
}

function serializeStoreState(value: StoreState): SerializedStoreState {
  return {
    products: clone(value.products),
    categories: clone(value.categories),
    collections: clone(value.collections),
    tags: clone(value.tags),
    types: clone(value.types),
    salesChannels: clone(value.salesChannels),
    priceLists: clone(value.priceLists),
    inventory: clone(value.inventory),
    draftOrders: clone(value.draftOrders),
    regions: clone(value.regions),
    taxRegions: clone(value.taxRegions),
    locations: clone(value.locations),
    shippingProfiles: clone(value.shippingProfiles),
    shippingOptions: clone(value.shippingOptions),
    returnReasons: clone(value.returnReasons),
    currencies: clone(value.currencies),
    fulfillmentProviders: clone(value.fulfillmentProviders),
    paymentProviders: clone(value.paymentProviders),
    orderOverlays: Array.from(value.orderOverlays.entries()).map(([orderId, overlay]) => [
      orderId,
      clone(overlay),
    ]),
  };
}

function hydrateStoreState(value: Partial<SerializedStoreState> | null | undefined): StoreState {
  const seed = createInitialState();
  return {
    products: clone(value?.products ?? seed.products),
    categories: clone(value?.categories ?? seed.categories),
    collections: clone(value?.collections ?? seed.collections),
    tags: clone(value?.tags ?? seed.tags),
    types: clone(value?.types ?? seed.types),
    salesChannels: clone(value?.salesChannels ?? seed.salesChannels),
    priceLists: clone(value?.priceLists ?? seed.priceLists),
    inventory: clone(value?.inventory ?? seed.inventory),
    draftOrders: clone(value?.draftOrders ?? seed.draftOrders),
    regions: clone(value?.regions ?? seed.regions),
    taxRegions: clone(value?.taxRegions ?? seed.taxRegions),
    locations: clone(value?.locations ?? seed.locations),
    shippingProfiles: clone(value?.shippingProfiles ?? seed.shippingProfiles),
    shippingOptions: clone(value?.shippingOptions ?? seed.shippingOptions),
    returnReasons: clone(value?.returnReasons ?? seed.returnReasons),
    currencies: clone(value?.currencies ?? seed.currencies),
    fulfillmentProviders: clone(value?.fulfillmentProviders ?? seed.fulfillmentProviders),
    paymentProviders: clone(value?.paymentProviders ?? seed.paymentProviders),
    orderOverlays: new Map(value?.orderOverlays ?? []),
  };
}

let state: StoreState = hydrateStoreState(
  loadCommerceDemoSnapshot<SerializedStoreState>(serializeStoreState(createInitialState())),
);

function persistState(): void {
  saveCommerceDemoSnapshot(serializeStoreState(state));
}

export function resetCommerceDemoState() {
  state = createInitialState();
  resetCommerceDemoSnapshot(serializeStoreState(state));
  return commerceDemoStatus();
}

export function commerceDemoStatus() {
  return {
    ...commerceDemoSnapshotStatus(),
    totals: {
      products: state.products.length,
      variants: state.products.reduce((sum, product) => sum + product.variants.length, 0),
      inventoryItems: state.inventory.length,
      draftOrders: state.draftOrders.length,
      regions: state.regions.length,
      shippingOptions: state.shippingOptions.length,
      returnReasons: state.returnReasons.length,
      orderOverlays: state.orderOverlays.size,
    },
  };
}

function getOverlay(orderId: string): OrderOverlay {
  const existing = state.orderOverlays.get(orderId);
  if (existing) return existing;
  const overlay: OrderOverlay = {};
  state.orderOverlays.set(orderId, overlay);
  return overlay;
}

function addTimeline(orderId: string, label: string, description: string, tone: OrderTimelineEvent["tone"]) {
  const overlay = getOverlay(orderId);
  overlay.timeline = [
    ...(overlay.timeline ?? []),
    {
      id: id("evt"),
      label,
      description,
      at: isoNow(),
      tone,
    },
  ];
  persistState();
}

function mergeUnique<T extends { id: string }>(base: T[], extra: T[] | undefined): T[] {
  if (!extra || extra.length === 0) return clone(base);
  const map = new Map<string, T>();
  for (const row of base) map.set(row.id, clone(row));
  for (const row of extra) map.set(row.id, clone(row));
  return Array.from(map.values());
}

export function applyOrderOverlay(order: CommerceOrder): CommerceOrder {
  const overlay = state.orderOverlays.get(order.id);
  if (!overlay) return order;

  const attentionReasons = Array.from(
    new Set([...(order.attentionReasons ?? []), ...(overlay.attentionReasons ?? [])]),
  );

  return {
    ...order,
    ...overlay,
    lineItems: clone(order.lineItems),
    fulfillments: mergeUnique(order.fulfillments, overlay.fulfillments),
    shipments: mergeUnique(order.shipments, overlay.shipments),
    returns: mergeUnique(order.returns, overlay.returns),
    claims: mergeUnique(order.claims, overlay.claims),
    exchanges: mergeUnique(order.exchanges, overlay.exchanges),
    refunds: mergeUnique(order.refunds, overlay.refunds),
    attentionReasons,
    timeline: [...clone(order.timeline), ...(overlay.timeline ?? [])],
    metadata: clone(order.metadata),
  };
}

export function applyOrderOverlays(orders: CommerceOrder[]): CommerceOrder[] {
  return orders.map(applyOrderOverlay);
}

export class DemoCommerceError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "DemoCommerceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new DemoCommerceError(status, code, message, details);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isString) : [];
}

function selectedLineItems(
  order: CommerceOrder,
  input: Record<string, unknown>,
  field = "lineItemIds",
): OrderLineItem[] {
  const requested = stringArray(input[field]);
  if (requested.length === 0) return order.lineItems;
  const rows = requested.map((lineItemId) => order.lineItems.find((item) => item.id === lineItemId));
  const missing = requested.filter((lineItemId, index) => !rows[index]);
  if (missing.length > 0) {
    fail(422, "validation_failed", "One or more line items do not belong to this order.", { missing });
  }
  return rows.filter((item): item is OrderLineItem => Boolean(item));
}

function selectedLineItemTotal(items: OrderLineItem[]): string {
  return items.reduce((sum, item) => sum + safeBigInt(item.total), 0n).toString();
}

function inventoryForLineItem(item: OrderLineItem): InventoryItem | null {
  return item.inventoryItemId
    ? state.inventory.find((inventory) => inventory.id === item.inventoryItemId) ?? null
    : null;
}

function refreshInventoryStatus(item: InventoryItem): void {
  if (item.status === "digital") return;
  if (item.availableQuantity <= 0) {
    item.status = "out_of_stock";
  } else if (item.availableQuantity <= item.reorderPoint) {
    item.status = "low_stock";
  } else {
    item.status = "in_stock";
  }
  item.updatedAt = isoNow();
}

function reserveInventoryForLines(items: OrderLineItem[]): void {
  for (const item of items) {
    const inventory = inventoryForLineItem(item);
    if (!inventory) continue;
    if (inventory.availableQuantity < item.quantity) {
      fail(409, "insufficient_inventory", `${item.title} does not have enough available stock.`, {
        lineItemId: item.id,
        inventoryItemId: inventory.id,
        availableQuantity: inventory.availableQuantity,
        requestedQuantity: item.quantity,
      });
    }
  }
  for (const item of items) {
    const inventory = inventoryForLineItem(item);
    if (!inventory) continue;
    inventory.reservedQuantity += item.quantity;
    inventory.availableQuantity -= item.quantity;
    refreshInventoryStatus(inventory);
  }
}

function fulfillInventoryForLines(items: OrderLineItem[]): void {
  for (const item of items) {
    const inventory = inventoryForLineItem(item);
    if (!inventory) continue;
    inventory.reservedQuantity = Math.max(0, inventory.reservedQuantity - item.quantity);
    inventory.stockedQuantity = Math.max(0, inventory.stockedQuantity - item.quantity);
    inventory.availableQuantity = Math.max(0, inventory.stockedQuantity - inventory.reservedQuantity);
    refreshInventoryStatus(inventory);
  }
}

function restockInventoryForLines(items: OrderLineItem[]): void {
  for (const item of items) {
    const inventory = inventoryForLineItem(item);
    if (!inventory) continue;
    inventory.stockedQuantity += item.quantity;
    inventory.availableQuantity += item.quantity;
    refreshInventoryStatus(inventory);
  }
}

function releaseInventoryForLines(items: OrderLineItem[]): void {
  for (const item of items) {
    const inventory = inventoryForLineItem(item);
    if (!inventory) continue;
    const release = Math.min(inventory.reservedQuantity, item.quantity);
    inventory.reservedQuantity -= release;
    inventory.availableQuantity += release;
    refreshInventoryStatus(inventory);
  }
}

function processedRefundTotal(order: CommerceOrder): bigint {
  return order.refunds
    .filter((refund) => refund.status === "processed")
    .reduce((sum, refund) => sum + safeBigInt(refund.amount), 0n);
}

export function captureOrder(order: CommerceOrder): CommerceOrder {
  if (order.captureStatus !== "ready" || order.paymentStatus === "captured") {
    fail(409, "invalid_transition", "This order is not ready for payment capture.", {
      captureStatus: order.captureStatus,
      paymentStatus: order.paymentStatus,
    });
  }
  const overlay = getOverlay(order.id);
  overlay.paymentStatus = "captured";
  overlay.captureStatus = "captured";
  overlay.amountReceived = order.total;
  overlay.orderStatus = "completed";
  addTimeline(order.id, "Payment captured", "Demo payment capture completed for the authorized amount.", "positive");
  return applyOrderOverlay(order);
}

export function reserveOrderInventory(order: CommerceOrder, input: Record<string, unknown> = {}): CommerceOrder {
  if (order.inventoryReservationStatus === "reserved") {
    fail(409, "invalid_transition", "Inventory is already reserved for this order.");
  }
  const lines = selectedLineItems(order, input);
  const inventoryLines = lines.filter((line) => inventoryForLineItem(line));
  if (inventoryLines.length === 0) {
    fail(422, "validation_failed", "No stock-managed line items were selected for reservation.");
  }
  reserveInventoryForLines(inventoryLines);
  const overlay = getOverlay(order.id);
  overlay.inventoryReservationStatus = "reserved";
  if (order.fulfillmentStatus !== "not_required") overlay.fulfillmentStatus = "reserved";
  addTimeline(order.id, "Inventory reserved", "Demo inventory was reserved for selected line items.", "positive");
  return applyOrderOverlay(order);
}

export function createOrderFulfillment(
  order: CommerceOrder,
  input: Record<string, unknown>,
): Fulfillment {
  if (order.paymentStatus !== "captured") {
    fail(409, "invalid_transition", "Payment must be captured before fulfillment.");
  }
  const lineItems = selectedLineItems(order, input);
  if (lineItems.some((line) => inventoryForLineItem(line)) && order.inventoryReservationStatus !== "reserved") {
    fail(409, "invalid_transition", "Stock-managed line items must be reserved before fulfillment.");
  }
  const locationId = typeof input.locationId === "string" ? input.locationId : "";
  const providerId = typeof input.providerId === "string" ? input.providerId : "";
  const shippingOptionId = typeof input.shippingOptionId === "string" ? input.shippingOptionId : "";
  if (!state.locations.some((location) => location.id === locationId)) {
    fail(422, "validation_failed", "A valid stock location is required for fulfillment.");
  }
  if (!state.fulfillmentProviders.some((provider) => provider.id === providerId)) {
    fail(422, "validation_failed", "A valid fulfillment provider is required.");
  }
  if (shippingOptionId && !state.shippingOptions.some((option) => option.id === shippingOptionId)) {
    fail(422, "validation_failed", "Unknown shipping option.");
  }
  fulfillInventoryForLines(lineItems);
  const overlay = getOverlay(order.id);
  const lineItemIds = lineItems.map((item) => item.id);
  const fulfillment: Fulfillment = {
    id: id("ful"),
    orderId: order.id,
    status: "shipped",
    locationId,
    providerId,
    shippingOptionId: shippingOptionId || null,
    lineItemIds,
    createdAt: isoNow(),
    shippedAt: isoNow(),
  };
  const shipment: Shipment = {
    id: id("shp"),
    orderId: order.id,
    fulfillmentId: fulfillment.id,
    carrier: typeof input.carrier === "string" ? input.carrier : "DeroShip",
    service: typeof input.service === "string" ? input.service : "Demo ground",
    trackingNumber:
      typeof input.trackingNumber === "string"
        ? input.trackingNumber
        : `DERO${fulfillment.id.slice(-6).toUpperCase()}`,
    trackingUrl:
      typeof input.trackingUrl === "string"
        ? input.trackingUrl
        : `https://tracking.example.test/${fulfillment.id.slice(-6)}`,
    shippedAt: fulfillment.shippedAt,
    deliveredAt: null,
  };
  overlay.fulfillments = [...(overlay.fulfillments ?? []), fulfillment];
  overlay.shipments = [...(overlay.shipments ?? []), shipment];
  overlay.fulfillmentStatus = "fulfilled";
  overlay.inventoryReservationStatus = "reserved";
  addTimeline(order.id, "Fulfillment shipped", "Demo fulfillment shipped selected line items.", "positive");
  return clone(fulfillment);
}

export function createOrderReturn(
  order: CommerceOrder,
  input: Record<string, unknown>,
): Return {
  if (order.paymentStatus !== "captured" || order.fulfillmentStatus !== "fulfilled") {
    fail(409, "invalid_transition", "Only captured and fulfilled orders can receive returns.");
  }
  const lineItems = selectedLineItems(order, input);
  const reasonId = typeof input.reasonId === "string" ? input.reasonId : "";
  if (!state.returnReasons.some((reason) => reason.id === reasonId && reason.enabled)) {
    fail(422, "validation_failed", "A valid enabled return reason is required.");
  }
  const overlay = getOverlay(order.id);
  const lineItemIds = lineItems.map((item) => item.id);
  const ret: Return = {
    id: id("ret"),
    orderId: order.id,
    status: "requested",
    reasonId,
    lineItemIds,
    refundAmount: typeof input.refundAmount === "string" ? input.refundAmount : selectedLineItemTotal(lineItems),
    requestedAt: isoNow(),
    receivedAt: null,
  };
  overlay.returns = [...(overlay.returns ?? []), ret];
  overlay.refundStatus = "requested";
  overlay.attentionReasons = [...(overlay.attentionReasons ?? []), "Return requested"];
  addTimeline(order.id, "Return requested", "Demo return request was opened for selected line items.", "warn");
  return clone(ret);
}

export function receiveOrderReturn(
  order: CommerceOrder,
  returnId: string,
  input: Record<string, unknown> = {},
): Return | null {
  const overlay = getOverlay(order.id);
  const returns = overlay.returns ?? clone(order.returns);
  const index = returns.findIndex((row) => row.id === returnId);
  if (index < 0) return null;
  const current = returns[index]!;
  if (current.status !== "requested") {
    fail(409, "invalid_transition", "Only requested returns can be marked received.", {
      returnId,
      status: current.status,
    });
  }
  const updated: Return = { ...current, status: "received", receivedAt: isoNow() };
  overlay.returns = returns.map((row) => (row.id === returnId ? updated : row));
  if (input.restock !== false) {
    restockInventoryForLines(order.lineItems.filter((item) => updated.lineItemIds.includes(item.id)));
  }
  if (input.refund !== false && safeBigInt(updated.refundAmount) > 0n) {
    const refund: Refund = {
      id: id("ref"),
      orderId: order.id,
      status: "processed",
      amount: updated.refundAmount,
      reason: `Return ${updated.reasonId}`,
      createdAt: isoNow(),
      processedAt: isoNow(),
    };
    overlay.refunds = [...(overlay.refunds ?? []), refund];
    overlay.refundStatus = "refunded";
  }
  addTimeline(order.id, "Return received", "Demo return was received and reconciled.", "positive");
  return clone(updated);
}

export function createOrderClaim(order: CommerceOrder, input: Record<string, unknown>): Claim {
  if (order.paymentStatus !== "captured") {
    fail(409, "invalid_transition", "Only captured orders can receive claims.");
  }
  const lineItems = selectedLineItems(order, input);
  const overlay = getOverlay(order.id);
  const lineItemIds = lineItems.map((item) => item.id);
  const claim: Claim = {
    id: id("clm"),
    orderId: order.id,
    status: "open",
    type:
      input.type === "missing_item" || input.type === "wrong_item" || input.type === "damaged_item"
        ? input.type
        : "damaged_item",
    lineItemIds,
    replacementFulfillmentId: null,
    refundAmount: typeof input.refundAmount === "string" ? input.refundAmount : null,
    createdAt: isoNow(),
  };
  overlay.claims = [...(overlay.claims ?? []), claim];
  overlay.disputeStatus = "open";
  overlay.attentionReasons = [...(overlay.attentionReasons ?? []), "Claim opened"];
  addTimeline(order.id, "Claim opened", "Demo claim was opened for support review.", "warn");
  return clone(claim);
}

export function createOrderExchange(
  order: CommerceOrder,
  input: Record<string, unknown>,
): Exchange {
  if (order.paymentStatus !== "captured" || order.fulfillmentStatus !== "fulfilled") {
    fail(409, "invalid_transition", "Only captured and fulfilled orders can receive exchanges.");
  }
  const overlay = getOverlay(order.id);
  const returnLineItems = selectedLineItems(order, input, "returnLineItemIds");
  const returnLineItemIds = returnLineItems.map((item) => item.id);
  const replacementLineItems = Array.isArray(input.replacementLineItems)
    ? (input.replacementLineItems as OrderLineItem[])
    : order.lineItems.map((item) => ({ ...item, id: id("li_exchange") }));
  if (replacementLineItems.length === 0) {
    fail(422, "validation_failed", "At least one replacement line item is required.");
  }
  const exchange: Exchange = {
    id: id("exc"),
    orderId: order.id,
    status: "requested",
    returnLineItemIds,
    replacementLineItems,
    additionalTotal: typeof input.additionalTotal === "string" ? input.additionalTotal : "0",
    createdAt: isoNow(),
  };
  overlay.exchanges = [...(overlay.exchanges ?? []), exchange];
  overlay.attentionReasons = [...(overlay.attentionReasons ?? []), "Exchange requested"];
  addTimeline(order.id, "Exchange requested", "Demo exchange request was opened.", "warn");
  return clone(exchange);
}

export function createOrderRefund(order: CommerceOrder, input: Record<string, unknown>): Refund {
  if (order.paymentStatus !== "captured" && order.paymentStatus !== "partially_paid") {
    fail(409, "invalid_transition", "Only captured or partially paid orders can be refunded.");
  }
  const amount = typeof input.amount === "string" ? input.amount : "";
  const amountAtomic = safeBigInt(amount);
  const refundable = safeBigInt(order.amountReceived) - processedRefundTotal(order);
  if (amountAtomic <= 0n) {
    fail(422, "validation_failed", "Refund amount must be greater than zero.");
  }
  if (amountAtomic > refundable) {
    fail(409, "invalid_refund_amount", "Refund amount exceeds available received funds.", {
      requestedAmount: amount,
      refundableAmount: refundable.toString(),
    });
  }
  const overlay = getOverlay(order.id);
  const refund: Refund = {
    id: id("ref"),
    orderId: order.id,
    status: "processed",
    amount,
    reason: typeof input.reason === "string" ? input.reason : "Merchant adjustment",
    createdAt: isoNow(),
    processedAt: isoNow(),
  };
  overlay.refunds = [...(overlay.refunds ?? []), refund];
  overlay.refundStatus = "refunded";
  addTimeline(order.id, "Refund processed", "Demo refund was processed.", "info");
  return clone(refund);
}

export function cancelOrder(order: CommerceOrder, input: Record<string, unknown> = {}): CommerceOrder {
  if (order.orderStatus === "completed" || order.fulfillmentStatus === "fulfilled") {
    fail(409, "invalid_transition", "Completed or fulfilled orders require a refund/return flow instead of cancellation.");
  }
  releaseInventoryForLines(order.lineItems);
  const overlay = getOverlay(order.id);
  overlay.orderStatus = "canceled";
  overlay.fulfillmentStatus = "pending";
  overlay.inventoryReservationStatus = "not_required";
  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : "Merchant canceled";
  addTimeline(order.id, "Order canceled", `Demo order was canceled: ${reason}.`, "danger");
  return applyOrderOverlay(order);
}

export function listDraftOrders(status?: string | null): DraftOrder[] {
  const rows = status
    ? state.draftOrders.filter((draft) => draft.status === status)
    : state.draftOrders;
  return clone(rows);
}

export function createDraftOrder(input: Record<string, unknown>): DraftOrder {
  const now = isoNow();
  const lineItems = Array.isArray(input.lineItems)
    ? (input.lineItems as OrderLineItem[])
    : [];
  const subtotal =
    typeof input.subtotal === "string"
      ? input.subtotal
      : lineItems.reduce((sum, item) => sum + safeBigInt(item.total), 0n).toString();
  const draft: DraftOrder = {
    id: id("draft"),
    displayId: `DRAFT-${Math.floor(1000 + Math.random() * 8999)}`,
    status: "open",
    customerName: String(input.customerName ?? "Manual draft"),
    customerEmail: String(input.customerEmail ?? "customer@example.test"),
    regionId: String(input.regionId ?? "reg_us"),
    salesChannelId: String(input.salesChannelId ?? "ch_hosted"),
    lineItems,
    subtotal,
    shippingTotal: String(input.shippingTotal ?? "0"),
    taxTotal: String(input.taxTotal ?? "0"),
    total: String(input.total ?? subtotal),
    createdAt: now,
    expiresAt: typeof input.expiresAt === "string" ? input.expiresAt : null,
    metadata:
      input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? (input.metadata as Record<string, string>)
        : { source: "mock_api" },
  };
  state.draftOrders = [draft, ...state.draftOrders];
  persistState();
  return clone(draft);
}

function safeBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function listCommerceProducts(): CommerceProduct[] {
  return clone(state.products);
}

export function listPriceLists(): PriceList[] {
  return clone(state.priceLists);
}

export function listInventory(): InventoryItem[] {
  return clone(state.inventory);
}

export function listStockLocations(): StockLocation[] {
  return clone(state.locations);
}

export function catalogTaxonomyPayload() {
  return {
    categories: clone(state.categories),
    collections: clone(state.collections),
    tags: clone(state.tags),
    types: clone(state.types),
    salesChannels: clone(state.salesChannels),
    stockLocations: clone(state.locations),
  };
}

export function findStoredProduct(idOrHandle: string): CommerceProduct | null {
  const product =
    state.products.find(
      (row) =>
        row.id === idOrHandle ||
        row.handle === idOrHandle ||
        row.paymentProductId === idOrHandle,
    ) ?? null;
  return product ? clone(product) : null;
}

export function upsertProduct(input: Record<string, unknown>): CommerceProduct {
  const now = isoNow();
  const name = String(input.name ?? "New catalog product");
  const handle = String(
    input.handle ??
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
  );
  const variant: ProductVariant = {
    id: id("var"),
    title: "Default",
    sku: String(input.sku ?? `${handle.toUpperCase()}-DEFAULT`),
    priceAtomic: String(input.priceAtomic ?? "0"),
    currency: normalizeCurrency(input.currency),
    options: { Title: "Default" },
    inventoryItemId: null,
    manageInventory: false,
    allowBackorder: true,
    stockLocationIds: ["loc_digital"],
    channelIds: ["ch_hosted"],
  };
  const product: CommerceProduct = {
    id: id("prod"),
    paymentProductId: null,
    name,
    handle,
    subtitle: String(input.subtitle ?? "Manual catalog item"),
    description: String(input.description ?? ""),
    status: "draft",
    thumbnailUrl: null,
    typeId: "ptype_service",
    categoryIds: [],
    collectionIds: [],
    tagIds: [],
    salesChannelIds: ["ch_hosted"],
    options: [{ id: id("opt"), title: "Title", values: ["Default"] }],
    variants: [variant],
    metadata: { source: "mock_api" },
    createdAt: now,
    updatedAt: now,
  };
  state.products = [product, ...state.products];
  persistState();
  return clone(product);
}

function normalizeCurrency(value: unknown): CommerceCurrency {
  return value === "USD" ? "USD" : "DERO";
}

function stringList(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) return value.filter(isString);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return fallback;
}

function boolValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1" || value === "yes";
  return fallback;
}

function providerStatus(value: unknown): FulfillmentProvider["status"] {
  return value === "testing" || value === "disabled" ? value : "enabled";
}

export function patchProduct(idOrHandle: string, patch: Record<string, unknown>): CommerceProduct | null {
  const index = state.products.findIndex(
    (row) =>
      row.id === idOrHandle ||
      row.handle === idOrHandle ||
      row.paymentProductId === idOrHandle,
  );
  if (index < 0) return null;
  const current = state.products[index]!;
  const next: CommerceProduct = {
    ...current,
    ...coerceProductPatch(patch),
    id: current.id,
    variants: current.variants,
    options: current.options,
    createdAt: current.createdAt,
    updatedAt: isoNow(),
  };
  if (patch.metadata && typeof patch.metadata === "object" && !Array.isArray(patch.metadata)) {
    next.metadata = {
      ...current.metadata,
      ...(patch.metadata as Record<string, string>),
    };
  }
  state.products[index] = next;
  persistState();
  return clone(next);
}

function coerceProductPatch(patch: Record<string, unknown>): Partial<CommerceProduct> {
  const out: Partial<CommerceProduct> = {};
  if (typeof patch.name === "string") out.name = patch.name;
  if (typeof patch.handle === "string") out.handle = patch.handle;
  if (typeof patch.subtitle === "string") out.subtitle = patch.subtitle;
  if (typeof patch.description === "string") out.description = patch.description;
  if (patch.status === "published" || patch.status === "draft" || patch.status === "archived") {
    out.status = patch.status;
  }
  if (typeof patch.thumbnailUrl === "string" || patch.thumbnailUrl === null) {
    out.thumbnailUrl = patch.thumbnailUrl;
  }
  if (typeof patch.typeId === "string") out.typeId = patch.typeId;
  if (Array.isArray(patch.categoryIds)) out.categoryIds = patch.categoryIds.filter(isString);
  if (Array.isArray(patch.collectionIds)) out.collectionIds = patch.collectionIds.filter(isString);
  if (Array.isArray(patch.tagIds)) out.tagIds = patch.tagIds.filter(isString);
  if (Array.isArray(patch.salesChannelIds)) out.salesChannelIds = patch.salesChannelIds.filter(isString);
  return out;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function addVariant(productId: string, input: Record<string, unknown>): ProductVariant | null {
  const product = state.products.find((row) => row.id === productId || row.handle === productId);
  if (!product) return null;
  const variant: ProductVariant = {
    id: id("var"),
    title: String(input.title ?? "New variant"),
    sku: String(input.sku ?? "NEW-VARIANT"),
    priceAtomic: String(input.priceAtomic ?? "0"),
    currency: normalizeCurrency(input.currency),
    options:
      input.options && typeof input.options === "object" && !Array.isArray(input.options)
        ? (input.options as Record<string, string>)
        : {},
    inventoryItemId: typeof input.inventoryItemId === "string" ? input.inventoryItemId : null,
    manageInventory: Boolean(input.manageInventory),
    allowBackorder: Boolean(input.allowBackorder),
    stockLocationIds: Array.isArray(input.stockLocationIds) ? input.stockLocationIds.filter(isString) : [],
    channelIds: Array.isArray(input.channelIds) ? input.channelIds.filter(isString) : ["ch_hosted"],
  };
  product.variants = [...product.variants, variant];
  product.updatedAt = isoNow();
  persistState();
  return clone(variant);
}

export function patchVariant(variantId: string, patch: Record<string, unknown>): ProductVariant | null {
  for (const product of state.products) {
    const index = product.variants.findIndex((variant) => variant.id === variantId);
    if (index < 0) continue;
    const current = product.variants[index]!;
    const next: ProductVariant = {
      ...current,
      title: typeof patch.title === "string" ? patch.title : current.title,
      sku: typeof patch.sku === "string" ? patch.sku : current.sku,
      priceAtomic: typeof patch.priceAtomic === "string" ? patch.priceAtomic : current.priceAtomic,
      currency: patch.currency ? normalizeCurrency(patch.currency) : current.currency,
      channelIds: Array.isArray(patch.channelIds) ? patch.channelIds.filter(isString) : current.channelIds,
      stockLocationIds: Array.isArray(patch.stockLocationIds)
        ? patch.stockLocationIds.filter(isString)
        : current.stockLocationIds,
      manageInventory:
        typeof patch.manageInventory === "boolean" ? patch.manageInventory : current.manageInventory,
      allowBackorder:
        typeof patch.allowBackorder === "boolean" ? patch.allowBackorder : current.allowBackorder,
    };
    product.variants[index] = next;
    product.updatedAt = isoNow();
    persistState();
    return clone(next);
  }
  return null;
}

export function applyBulkCatalogEdits(edits: unknown[]): number {
  let updated = 0;
  for (const raw of edits) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const edit = raw as Record<string, unknown>;
    const variantId = typeof edit.variantId === "string" ? edit.variantId : null;
    if (!variantId) continue;
    const variant = patchVariant(variantId, edit);
    if (variant) updated++;

    if (typeof edit.availableQuantity === "number") {
      const inv = state.inventory.find((item) => item.variantId === variantId);
      if (inv) {
        inv.availableQuantity = edit.availableQuantity;
        inv.stockedQuantity = edit.availableQuantity + inv.reservedQuantity;
        inv.updatedAt = isoNow();
        refreshInventoryStatus(inv);
        persistState();
      }
    }
  }
  return updated;
}

export function createCatalogTaxonomy(input: Record<string, unknown>) {
  const kind = typeof input.kind === "string" ? input.kind : typeof input.resource === "string" ? input.resource : "tag";
  const rawName = String(input.name ?? input.title ?? input.value ?? "New catalog label").trim() || "New catalog label";
  const rawHandle = String(input.handle ?? input.value ?? rawName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (kind === "category" || kind === "categories") {
    const category: ProductCategory = {
      id: id("pcat"),
      name: rawName,
      handle: rawHandle,
      parentId: typeof input.parentId === "string" ? input.parentId : null,
      status: input.status === "internal" ? "internal" : "active",
      productCount: 0,
    };
    state.categories = [category, ...state.categories];
    persistState();
    return { category: clone(category) };
  }

  if (kind === "collection" || kind === "collections") {
    const collection: ProductCollection = {
      id: id("pcol"),
      title: rawName,
      handle: rawHandle,
      productCount: 0,
      channelIds: Array.isArray(input.channelIds) ? input.channelIds.filter(isString) : ["ch_hosted"],
    };
    state.collections = [collection, ...state.collections];
    persistState();
    return { collection: clone(collection) };
  }

  if (kind === "type" || kind === "types") {
    const type: ProductType = {
      id: id("ptype"),
      value: rawName,
      productCount: 0,
    };
    state.types = [type, ...state.types];
    persistState();
    return { type: clone(type) };
  }

  const tag: ProductTag = {
    id: id("ptag"),
    value: rawName,
    productCount: 0,
  };
  state.tags = [tag, ...state.tags];
  persistState();
  return { tag: clone(tag) };
}

export type CsvImportPreview = {
  headers: string[];
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

export function parseVariantCsv(csv: string): CsvImportPreview {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0]!.split(",").map((cell) => cell.trim());
  const rows = lines.slice(1).map((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = cells[i] ?? "";
    });
    const productHandle = record.product_handle ?? record.handle ?? "";
    const variantTitle = record.variant_title ?? record.title ?? "";
    const sku = record.sku ?? "";
    const priceAtomic = record.price_atomic ?? record.price ?? "";
    const currency = record.currency ?? "DERO";
    return {
      rowNumber: index + 2,
      productHandle,
      variantTitle,
      sku,
      priceAtomic,
      currency,
      errors: [
        !sku ? "Missing sku" : null,
        !productHandle ? "Missing product handle" : null,
        !priceAtomic ? "Missing price" : null,
        currency !== "DERO" && currency !== "USD" ? "Currency must be DERO or USD" : null,
      ].filter((error): error is string => Boolean(error)),
    };
  });
  return { headers, rows };
}

export function applyVariantCsv(preview: CsvImportPreview): number {
  let applied = 0;
  for (const row of preview.rows) {
    if (row.errors.length > 0) continue;
    let product = state.products.find((item) => item.handle === row.productHandle);
    if (!product) {
      product = upsertProduct({
        name: row.productHandle
          .split("-")
          .filter(Boolean)
          .map((part) => part[0]!.toUpperCase() + part.slice(1))
          .join(" "),
        handle: row.productHandle,
        sku: row.sku,
        priceAtomic: row.priceAtomic,
        currency: row.currency,
      });
      applied++;
      continue;
    }
    const existing = product.variants.find((variant) => variant.sku === row.sku);
    if (existing) {
      patchVariant(existing.id, {
        title: row.variantTitle || existing.title,
        priceAtomic: row.priceAtomic,
        currency: row.currency,
      });
    } else {
      product.variants.push({
        id: id("var"),
        title: row.variantTitle || row.sku,
        sku: row.sku,
        priceAtomic: row.priceAtomic,
        currency: normalizeCurrency(row.currency),
        options: {},
        inventoryItemId: null,
        manageInventory: false,
        allowBackorder: true,
        stockLocationIds: ["loc_digital"],
        channelIds: product.salesChannelIds.length > 0 ? product.salesChannelIds : ["ch_hosted"],
      });
      product.updatedAt = isoNow();
    }
    applied++;
  }
  if (applied > 0) persistState();
  return applied;
}

export function storeSettingsPayload() {
  return {
    regions: clone(state.regions),
    taxRegions: clone(state.taxRegions),
    locations: clone(state.locations),
    shippingProfiles: clone(state.shippingProfiles),
    shippingOptions: clone(state.shippingOptions),
    returnReasons: clone(state.returnReasons),
    currencies: clone(state.currencies),
    fulfillmentProviders: clone(state.fulfillmentProviders),
    paymentProviders: clone(state.paymentProviders),
  };
}

export function storeSettingsResource(resource: string) {
  const payload = storeSettingsPayload();
  switch (resource) {
    case "regions":
      return { regions: payload.regions, total: payload.regions.length };
    case "tax-regions":
      return { taxRegions: payload.taxRegions, total: payload.taxRegions.length };
    case "locations":
    case "stock-locations":
      return { locations: payload.locations, total: payload.locations.length };
    case "shipping-profiles":
      return { shippingProfiles: payload.shippingProfiles, total: payload.shippingProfiles.length };
    case "shipping-options":
      return { shippingOptions: payload.shippingOptions, total: payload.shippingOptions.length };
    case "return-reasons":
      return { returnReasons: payload.returnReasons, total: payload.returnReasons.length };
    case "currencies":
      return { currencies: payload.currencies, total: payload.currencies.length };
    case "fulfillment-providers":
      return {
        fulfillmentProviders: payload.fulfillmentProviders,
        total: payload.fulfillmentProviders.length,
      };
    case "payment-providers":
      return { paymentProviders: payload.paymentProviders, total: payload.paymentProviders.length };
    default:
      return null;
  }
}

export function createStoreSettingsResource(resource: string, input: Record<string, unknown>) {
  const createdAt = isoNow();
  switch (resource) {
    case "currencies": {
      const currency: CommerceCurrencySetting = {
        code: normalizeCurrency(input.code),
        symbol: String(input.symbol ?? normalizeCurrency(input.code)),
        decimalDigits: Number(input.decimalDigits ?? (normalizeCurrency(input.code) === "USD" ? 2 : 12)),
        default: boolValue(input.default),
        enabled: input.enabled !== false,
      };
      const existingIndex = state.currencies.findIndex((row) => row.code === currency.code);
      if (currency.default) {
        state.currencies = state.currencies.map((row) => ({ ...row, default: false }));
      }
      if (existingIndex >= 0) {
        state.currencies[existingIndex] = { ...state.currencies[existingIndex]!, ...currency };
      } else {
        state.currencies = [currency, ...state.currencies];
      }
      persistState();
      return { currency: clone(currency) };
    }
    case "fulfillment-providers": {
      const provider: FulfillmentProvider = {
        id: id("fp"),
        name: String(input.name ?? "New fulfillment provider"),
        code: String(input.code ?? "custom_provider")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, ""),
        status: providerStatus(input.status),
        locationIds: stringList(input.locationIds, state.locations.slice(0, 1).map((location) => location.id)),
      };
      state.fulfillmentProviders = [provider, ...state.fulfillmentProviders];
      persistState();
      return { fulfillmentProvider: clone(provider) };
    }
    case "shipping-profiles": {
      const profile: ShippingProfile = {
        id: id("sp"),
        name: String(input.name ?? "New shipping profile"),
        type:
          input.type === "digital" || input.type === "gift_card" || input.type === "custom"
            ? input.type
            : "default",
        productIds: stringList(input.productIds),
      };
      state.shippingProfiles = [profile, ...state.shippingProfiles];
      persistState();
      return { shippingProfile: clone(profile) };
    }
    case "locations":
    case "stock-locations": {
      const location: StockLocation = {
        id: id("loc"),
        name: String(input.name ?? "New stock location"),
        type: input.type === "digital" || input.type === "partner" ? input.type : "warehouse",
        city: String(input.city ?? "Remote"),
        country: String(input.country ?? "US"),
        status: input.status === "paused" ? "paused" : "active",
        channelIds: stringList(input.channelIds, ["ch_hosted"]),
        shippingOptionIds: stringList(input.shippingOptionIds),
      };
      state.locations = [location, ...state.locations];
      persistState();
      return { location: clone(location) };
    }
    case "return-reasons": {
      const reason: ReturnReason = {
        id: id("rr"),
        label: String(input.label ?? "New reason"),
        value: String(input.value ?? "new_reason"),
        description: String(input.description ?? ""),
        requiresNote: Boolean(input.requiresNote),
        enabled: input.enabled !== false,
      };
      state.returnReasons = [reason, ...state.returnReasons];
      persistState();
      return { returnReason: clone(reason) };
    }
    case "regions": {
      const region: Region = {
        id: id("reg"),
        name: String(input.name ?? "New region"),
        currencyCode: normalizeCurrency(input.currencyCode),
        countryCodes: Array.isArray(input.countryCodes) ? input.countryCodes.filter(isString) : [],
        paymentProviderIds: Array.isArray(input.paymentProviderIds)
          ? input.paymentProviderIds.filter(isString)
          : ["pay_deropay_direct"],
        fulfillmentProviderIds: Array.isArray(input.fulfillmentProviderIds)
          ? input.fulfillmentProviderIds.filter(isString)
          : ["fp_manual"],
        taxInclusivePricing: Boolean(input.taxInclusivePricing),
        automaticTaxes: input.automaticTaxes !== false,
        createdAt,
      };
      state.regions = [region, ...state.regions];
      persistState();
      return { region: clone(region) };
    }
    case "tax-regions": {
      const taxRegion: TaxRegion = {
        id: id("tax"),
        regionId: String(input.regionId ?? state.regions[0]?.id ?? "reg_us"),
        countryCode: String(input.countryCode ?? state.regions[0]?.countryCodes[0] ?? "US").toUpperCase(),
        provinceCode:
          typeof input.provinceCode === "string" && input.provinceCode.trim()
            ? input.provinceCode.trim().toUpperCase()
            : null,
        taxRate: Number(input.taxRate ?? 0),
        taxCode: String(input.taxCode ?? "CUSTOM-TAX").toUpperCase(),
        includesTax: boolValue(input.includesTax),
        overrides: [],
      };
      state.taxRegions = [taxRegion, ...state.taxRegions];
      persistState();
      return { taxRegion: clone(taxRegion) };
    }
    case "shipping-options": {
      const option: ShippingOption = {
        id: id("ship"),
        name: String(input.name ?? "New shipping option"),
        regionId: String(input.regionId ?? state.regions[0]?.id ?? "reg_us"),
        profileId: String(input.profileId ?? state.shippingProfiles[0]?.id ?? "sp_default"),
        providerId: String(input.providerId ?? state.fulfillmentProviders[0]?.id ?? "fp_manual"),
        locationId: String(input.locationId ?? state.locations[0]?.id ?? "loc_main"),
        priceAtomic: String(input.priceAtomic ?? "0"),
        currencyCode: normalizeCurrency(input.currencyCode),
        countries: stringList(input.countries, state.regions[0]?.countryCodes ?? ["US"]).map((country) =>
          country.toUpperCase(),
        ),
        enabled: input.enabled !== false,
      };
      state.shippingOptions = [option, ...state.shippingOptions];
      const location = state.locations.find((row) => row.id === option.locationId);
      if (location && !location.shippingOptionIds.includes(option.id)) {
        location.shippingOptionIds = [option.id, ...location.shippingOptionIds];
      }
      persistState();
      return { shippingOption: clone(option) };
    }
    default:
      return {
        status: "accepted",
        resource,
        id: id(resource.replace(/[^a-z0-9]/gi, "_")),
        createdAt,
        payload: input,
      };
  }
}

export function patchStoreSettingsResource(
  resource: string,
  idValue: string,
  patch: Record<string, unknown>,
) {
  const collections: Record<string, Array<{ id: string } & Record<string, unknown>>> = {
    "regions": state.regions as Array<{ id: string } & Record<string, unknown>>,
    "tax-regions": state.taxRegions as Array<{ id: string } & Record<string, unknown>>,
    "locations": state.locations as Array<{ id: string } & Record<string, unknown>>,
    "stock-locations": state.locations as Array<{ id: string } & Record<string, unknown>>,
    "shipping-profiles": state.shippingProfiles as Array<{ id: string } & Record<string, unknown>>,
    "shipping-options": state.shippingOptions as Array<{ id: string } & Record<string, unknown>>,
    "return-reasons": state.returnReasons as Array<{ id: string } & Record<string, unknown>>,
    "currencies": state.currencies.map((currency) => ({ ...currency, id: currency.code })) as Array<
      { id: string } & Record<string, unknown>
    >,
    "fulfillment-providers": state.fulfillmentProviders as Array<{ id: string } & Record<string, unknown>>,
    "payment-providers": state.paymentProviders as Array<{ id: string } & Record<string, unknown>>,
  };
  const rows = collections[resource];
  if (!rows) return null;
  const index = rows.findIndex((row) => row.id === idValue);
  if (index < 0) return null;
  const updated = { ...rows[index]!, ...patch, id: rows[index]!.id };

  if (resource === "currencies") {
    const currencyIndex = state.currencies.findIndex((currency) => currency.code === idValue);
    if (currencyIndex >= 0) {
      if (boolValue(patch.default, state.currencies[currencyIndex]!.default)) {
        state.currencies = state.currencies.map((currency) => ({ ...currency, default: false }));
      }
      state.currencies[currencyIndex] = {
        ...state.currencies[currencyIndex]!,
        ...(patch as Partial<CommerceCurrencySetting>),
        code: state.currencies[currencyIndex]!.code,
      };
      persistState();
      return clone(state.currencies[currencyIndex]);
    }
  } else {
    rows[index] = updated;
    const updatedRecord = updated as { id: string; locationId?: unknown };
    if (resource === "shipping-options" && typeof updatedRecord.locationId === "string") {
      for (const location of state.locations) {
        location.shippingOptionIds = location.shippingOptionIds.filter((optionId) => optionId !== updatedRecord.id);
      }
      const location = state.locations.find((row) => row.id === updatedRecord.locationId);
      if (location) location.shippingOptionIds = [updatedRecord.id, ...location.shippingOptionIds];
    }
  }
  persistState();
  return clone(updated);
}

export const commerceStatic = {
  get categories() {
    return clone(state.categories);
  },
  get collections() {
    return clone(state.collections);
  },
  get tags() {
    return clone(state.tags);
  },
  get types() {
    return clone(state.types);
  },
  get salesChannels() {
    return clone(state.salesChannels);
  },
};
