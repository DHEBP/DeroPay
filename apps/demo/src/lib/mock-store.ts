import { randomBytes } from "node:crypto";
import type { Invoice, InvoiceEscrow, Payment } from "dero-pay";
import { getStoreProduct } from "@/lib/store-catalog";

const DEMO_BASE_ADDRESS =
  "deri1qy0ehnqcg0rr4qlsgkfgpv3cx6fmk9pq0a95rfhssmacxvhfvz2yqg2wpnee0gf5qmet0e8w4gp3sxm6t7ycx5qd6w5kfzlsq9ycx0z3qsadmn5k";
const DEMO_SELLER_ADDRESS =
  "dero1qyr8yjnu6cl2c5yqkls0hmxe6rry77kn24nmc5fje6hm9jltyvdd5qq4hn5pn";
const DEMO_ARBITRATOR_ADDRESS =
  "dero1qyk8j05cgs8ud6mfp0m6lk2d4g0ldhfx5rxn5ga8c27kvzjlwmzu3qqcdp8vk";
const DEMO_BUYER_ADDRESS =
  "dero1qydl0fdmk59f7g3nqrry4w2x7tzh2g0d2x0r5z39qz4l49ddrw2njqql90pn9";

const DEFAULT_TTL_SECONDS = 15 * 60;
const DEFAULT_REQUIRED_CONFIRMATIONS = 8;
const MAX_ACTIVE_INVOICES = 200;
const TARGET_INVOICE_COUNT = 150;
const MAX_ABSOLUTE_INVOICE_AGE_MS = 12 * 60 * 60 * 1000;
const TERMINAL_INVOICE_RETENTION_MS = 45 * 60 * 1000;
const STANDARD_CONFIRMING_MS = 3_000;
const ESCROW_DEPLOY_MS = 1_200;
const MAX_CART_LINES = 12;
const MAX_TOTAL_UNITS = 50;
const MAX_LINE_QUANTITY = 25;
const MAX_ESCROW_FEE_BPS = 1_000;
const MAX_ESCROW_BLOCK_EXPIRATION = 10_000;

type EscrowStatus = NonNullable<Invoice["escrow"]>["escrowStatus"];
type EscrowAction =
  | "deposit"
  | "confirmDelivery"
  | "dispute"
  | "refundBuyer"
  | "claimAfterExpiry"
  | "arbitrateRelease"
  | "arbitrateRefund";

type SerializablePayment = Omit<Payment, "amount" | "destinationPort"> & {
  amount: string;
  destinationPort: string;
};

export type SerializableInvoice = Omit<
  Invoice,
  "amount" | "amountReceived" | "paymentId" | "payments"
> & {
  amount: string;
  amountReceived: string;
  paymentId: string;
  payments: SerializablePayment[];
};

type StoredInvoice = SerializableInvoice & {
  sessionId: string;
  createdAtMs: number;
  expiresAtMs: number;
  lastTouchedAtMs: number;
  pendingCompleteAtMs: number | null;
  escrowDeployReadyAtMs: number | null;
};

type DerivedCartLine = {
  id: string;
  name: string;
  category: string;
  demoKey: string;
  quantity: number;
  unitPrice: bigint;
  lineTotal: bigint;
};

export class MockStoreError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "MockStoreError";
    this.status = status;
    this.code = code;
  }
}

const invoices = new Map<string, StoredInvoice>();
let mockBlockHeight = 987_000;

export function isMockStoreError(error: unknown): error is MockStoreError {
  return error instanceof MockStoreError;
}

export function createMockInvoice(input: {
  sessionId: string;
  cartLines: unknown;
  escrow?: unknown;
}): SerializableInvoice {
  pruneInvoices();

  const lines = normalizeCartLines(input.cartLines);
  const order = buildOrderDetails(lines);
  const now = Date.now();
  const expiresAtMs = now + DEFAULT_TTL_SECONDS * 1000;
  const useEscrow = Boolean(input.escrow);
  const escrow = useEscrow ? buildEscrow(input.escrow) : null;

  const invoice: StoredInvoice = {
    id: buildInvoiceId(),
    name: order.name,
    description: order.description,
    amount: order.amountAtomic,
    amountReceived: "0",
    status: "pending",
    paymentId: buildPaymentId(),
    integratedAddress: DEMO_BASE_ADDRESS,
    baseAddress: DEMO_BASE_ADDRESS,
    ttlSeconds: DEFAULT_TTL_SECONDS,
    requiredConfirmations: DEFAULT_REQUIRED_CONFIRMATIONS,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    completedAt: null,
    payments: [],
    metadata: order.metadata,
    escrow,
    sessionId: input.sessionId,
    createdAtMs: now,
    expiresAtMs,
    lastTouchedAtMs: now,
    pendingCompleteAtMs: null,
    escrowDeployReadyAtMs: escrow ? now + ESCROW_DEPLOY_MS : null,
  };

  invoices.set(invoice.id, invoice);
  pruneInvoices();
  return clonePublicInvoice(invoice);
}

export function getMockInvoiceForSession(
  id: string,
  sessionId: string
): SerializableInvoice | undefined {
  pruneInvoices();
  const invoice = invoices.get(id);
  if (!invoice) return undefined;
  if (invoice.sessionId !== sessionId) return undefined;

  refreshInvoice(invoice);
  return clonePublicInvoice(invoice);
}

export function simulatePaymentForSession(
  id: string,
  sessionId: string
): SerializableInvoice {
  const invoice = requireInvoiceForSession(id, sessionId);
  refreshInvoice(invoice);

  if (isInvoiceExpired(invoice)) {
    throw new MockStoreError(409, "INVOICE_EXPIRED", "Invoice has expired.");
  }

  if (invoice.escrow) {
    prepareEscrowForDeposit(invoice);
    if (invoice.escrow.escrowStatus !== "awaiting_deposit") {
      return clonePublicInvoice(invoice);
    }
    depositIntoEscrow(invoice);
    return clonePublicInvoice(invoice);
  }

  if (invoice.status === "completed") {
    return clonePublicInvoice(invoice);
  }

  if (invoice.status !== "pending" && invoice.status !== "partial") {
    return clonePublicInvoice(invoice);
  }

  const now = Date.now();
  const payment = buildDetectedPayment(invoice, now);
  payment.status = "confirming";
  payment.confirmations = 1;
  invoice.payments = [payment];
  invoice.amountReceived = invoice.amount;
  invoice.status = "confirming";
  invoice.pendingCompleteAtMs = now + STANDARD_CONFIRMING_MS;
  invoice.lastTouchedAtMs = now;

  refreshInvoice(invoice);
  return clonePublicInvoice(invoice);
}

export function performEscrowActionForSession(input: {
  invoiceId: string;
  sessionId: string;
  action: string;
}): { invoice: SerializableInvoice; txid: string } {
  const action = normalizeEscrowAction(input.action);
  const invoice = requireInvoiceForSession(input.invoiceId, input.sessionId);
  refreshInvoice(invoice);

  if (!invoice.escrow) {
    throw new MockStoreError(400, "ESCROW_REQUIRED", "Invoice is not an escrow invoice.");
  }

  const expired = isInvoiceExpired(invoice);
  if (expired && !canRunExpiredEscrowAction(action, invoice.escrow.escrowStatus)) {
    throw new MockStoreError(409, "INVOICE_EXPIRED", "Invoice has expired.");
  }

  if (action === "deposit") {
    prepareEscrowForDeposit(invoice);
  }

  switch (action) {
    case "deposit":
      requireEscrowStatus(invoice, ["awaiting_deposit"]);
      depositIntoEscrow(invoice);
      break;
    case "confirmDelivery":
      requireEscrowStatus(invoice, ["funded"]);
      finalizeEscrowToSeller(invoice, "released");
      break;
    case "dispute":
      requireEscrowStatus(invoice, ["funded"]);
      invoice.escrow.escrowStatus = "disputed";
      invoice.escrow.disputedAt = new Date().toISOString();
      invoice.status = "confirming";
      invoice.lastTouchedAtMs = Date.now();
      break;
    case "refundBuyer":
      requireEscrowStatus(invoice, ["funded"]);
      finalizeEscrowToBuyer(invoice, "refunded");
      break;
    case "claimAfterExpiry":
      requireEscrowStatus(invoice, ["funded"]);
      if (!expired) {
        throw new MockStoreError(
          409,
          "ESCROW_NOT_EXPIRED",
          "Escrow cannot be claimed before expiry."
        );
      }
      finalizeEscrowToSeller(invoice, "expired_claimed");
      break;
    case "arbitrateRelease":
      requireEscrowStatus(invoice, ["disputed"]);
      finalizeEscrowToSeller(invoice, "arbitrated", "release_to_seller");
      break;
    case "arbitrateRefund":
      requireEscrowStatus(invoice, ["disputed"]);
      finalizeEscrowToBuyer(invoice, "arbitrated", "refund_to_buyer");
      break;
  }

  refreshInvoice(invoice);
  return {
    invoice: clonePublicInvoice(invoice),
    txid: buildTxid(),
  };
}

function requireInvoiceForSession(id: string, sessionId: string): StoredInvoice {
  const invoice = invoices.get(id);
  if (!invoice || invoice.sessionId !== sessionId) {
    throw new MockStoreError(404, "INVOICE_NOT_FOUND", "Invoice not found.");
  }

  return invoice;
}

function normalizeCartLines(raw: unknown): DerivedCartLine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new MockStoreError(
      400,
      "INVALID_CART",
      "Provide at least one cart line to create an invoice."
    );
  }

  if (raw.length > MAX_CART_LINES) {
    throw new MockStoreError(400, "INVALID_CART", "Too many cart lines in one order.");
  }

  const aggregated = new Map<string, DerivedCartLine>();
  let totalUnits = 0;

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      throw new MockStoreError(400, "INVALID_CART", "Cart lines must be objects.");
    }

    const record = item as Record<string, unknown>;
    const productId = pickProductId(record);
    const quantity = parseQuantity(record.quantity ?? record.qty ?? 1);
    const product = getStoreProduct(productId);

    if (!product) {
      throw new MockStoreError(400, "UNKNOWN_PRODUCT", `Unknown product: ${productId}`);
    }

    totalUnits += quantity;
    if (totalUnits > MAX_TOTAL_UNITS) {
      throw new MockStoreError(400, "INVALID_CART", "Cart contains too many total units.");
    }

    const existing = aggregated.get(product.id);
    if (existing) {
      existing.quantity += quantity;
      if (existing.quantity > MAX_LINE_QUANTITY) {
        throw new MockStoreError(
          400,
          "INVALID_CART",
          `Quantity must be an integer between 1 and ${MAX_LINE_QUANTITY}.`
        );
      }
      existing.lineTotal = existing.unitPrice * BigInt(existing.quantity);
      continue;
    }

    aggregated.set(product.id, {
      id: product.id,
      name: product.name,
      category: product.category,
      demoKey: product.demoKey,
      quantity,
      unitPrice: product.price,
      lineTotal: product.price * BigInt(quantity),
    });
  }

  return Array.from(aggregated.values());
}

function buildOrderDetails(lines: DerivedCartLine[]) {
  const uniqueLines = lines.length;
  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0n);
  const headline =
    uniqueLines === 1 && totalUnits === 1 ? lines[0].name : "DERO Demo Store Order";
  const summary = lines.map((line) => `${line.quantity}x ${line.name}`).join(", ");

  return {
    name: headline,
    description: summary,
    amountAtomic: total.toString(),
    metadata: {
      source: "demo-store",
      lineCount: uniqueLines,
      totalUnits,
      lines: lines.map((line) => ({
        id: line.id,
        name: line.name,
        category: line.category,
        demoKey: line.demoKey,
        quantity: line.quantity,
        unitPriceAtomic: line.unitPrice.toString(),
        lineTotalAtomic: line.lineTotal.toString(),
      })),
    } satisfies Record<string, unknown>,
  };
}

function buildEscrow(raw: unknown): InvoiceEscrow {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const feeBasisPoints = clampInteger(record.feeBasisPoints, 250, 0, MAX_ESCROW_FEE_BPS);
  const blockExpiration = clampInteger(
    record.blockExpiration,
    1_000,
    100,
    MAX_ESCROW_BLOCK_EXPIRATION
  );

  return {
    scid: buildScid(),
    deployTxid: buildTxid(),
    escrowStatus: "deploying",
    sellerAddress: DEMO_SELLER_ADDRESS,
    arbitratorAddress: DEMO_ARBITRATOR_ADDRESS,
    feeBasisPoints,
    blockExpiration,
    buyerAddress: null,
    depositHeight: null,
    disputedAt: null,
    resolution: null,
  };
}

function refreshInvoice(invoice: StoredInvoice, touch = true) {
  const now = Date.now();
  if (touch) {
    invoice.lastTouchedAtMs = now;
  }

  if (
    invoice.escrow &&
    invoice.escrow.escrowStatus === "deploying" &&
    invoice.escrowDeployReadyAtMs !== null &&
    now >= invoice.escrowDeployReadyAtMs
  ) {
    invoice.escrow.escrowStatus = "awaiting_deposit";
    invoice.escrowDeployReadyAtMs = null;
  }

  if (
    invoice.pendingCompleteAtMs !== null &&
    invoice.status === "confirming" &&
    now >= invoice.pendingCompleteAtMs
  ) {
    completeStandardInvoice(invoice);
  }

  if (shouldExpireInvoice(invoice, now)) {
    invoice.status = "expired";
    invoice.pendingCompleteAtMs = null;
  }
}

function shouldExpireInvoice(invoice: StoredInvoice, now: number) {
  if (now < invoice.expiresAtMs) {
    return false;
  }

  if (invoice.status === "completed" || invoice.status === "expired") {
    return false;
  }

  if (invoice.escrow) {
    const escrowStatus = invoice.escrow.escrowStatus;
    if (
      escrowStatus === "released" ||
      escrowStatus === "refunded" ||
      escrowStatus === "expired_claimed" ||
      escrowStatus === "arbitrated" ||
      escrowStatus === "deploy_failed"
    ) {
      return false;
    }
  }

  return true;
}

function isInvoiceExpired(invoice: StoredInvoice) {
  if (invoice.status === "completed") {
    return false;
  }

  return invoice.status === "expired" || Date.now() >= invoice.expiresAtMs;
}

function completeStandardInvoice(invoice: StoredInvoice) {
  const now = Date.now();
  invoice.status = "completed";
  invoice.completedAt = new Date(now).toISOString();
  invoice.pendingCompleteAtMs = null;

  if (invoice.payments[0]) {
    invoice.payments[0].confirmations = invoice.requiredConfirmations;
    invoice.payments[0].status = "confirmed";
  }
}

function prepareEscrowForDeposit(invoice: StoredInvoice) {
  if (!invoice.escrow) return;
  if (invoice.escrow.escrowStatus === "deploying") {
    invoice.escrow.escrowStatus = "awaiting_deposit";
    invoice.escrowDeployReadyAtMs = null;
  }
}

function depositIntoEscrow(invoice: StoredInvoice) {
  if (!invoice.escrow) return;

  const now = Date.now();
  invoice.amountReceived = invoice.amount;
  invoice.status = "confirming";
  invoice.pendingCompleteAtMs = null;
  invoice.escrow.escrowStatus = "funded";
  invoice.escrow.buyerAddress = DEMO_BUYER_ADDRESS;
  invoice.escrow.depositHeight = nextBlockHeight();
  invoice.payments = [
    {
      ...buildDetectedPayment(invoice, now),
      status: "confirmed",
      confirmations: invoice.requiredConfirmations,
    },
  ];
  invoice.lastTouchedAtMs = now;
}

function finalizeEscrowToSeller(
  invoice: StoredInvoice,
  escrowStatus: Extract<EscrowStatus, "released" | "expired_claimed" | "arbitrated">,
  resolution: string = escrowStatus === "released" ? "released_to_seller" : escrowStatus
) {
  if (!invoice.escrow) return;
  const now = Date.now();
  invoice.escrow.escrowStatus = escrowStatus;
  invoice.escrow.resolution = resolution;
  invoice.status = "completed";
  invoice.completedAt = new Date(now).toISOString();
  invoice.pendingCompleteAtMs = null;
  invoice.lastTouchedAtMs = now;
}

function finalizeEscrowToBuyer(
  invoice: StoredInvoice,
  escrowStatus: Extract<EscrowStatus, "refunded" | "arbitrated">,
  resolution: string = escrowStatus === "refunded" ? "refund_to_buyer" : escrowStatus
) {
  if (!invoice.escrow) return;
  const now = Date.now();
  invoice.escrow.escrowStatus = escrowStatus;
  invoice.escrow.resolution = resolution;
  invoice.status = "expired";
  invoice.completedAt = null;
  invoice.pendingCompleteAtMs = null;
  invoice.lastTouchedAtMs = now;
}

function requireEscrowStatus(
  invoice: StoredInvoice,
  expected: EscrowStatus[]
) {
  const current = invoice.escrow?.escrowStatus;
  if (!current || !expected.includes(current)) {
    throw new MockStoreError(
      409,
      "INVALID_ESCROW_STATE",
      `Escrow action is not allowed while status is ${current ?? "unknown"}.`
    );
  }
}

function canRunExpiredEscrowAction(action: EscrowAction, status: EscrowStatus) {
  if (action === "claimAfterExpiry" && status === "funded") {
    return true;
  }

  if ((action === "arbitrateRelease" || action === "arbitrateRefund") && status === "disputed") {
    return true;
  }

  return false;
}

function normalizeEscrowAction(raw: string): EscrowAction {
  const value = raw.trim();
  switch (value) {
    case "deposit":
    case "confirmDelivery":
    case "dispute":
    case "refundBuyer":
    case "claimAfterExpiry":
    case "arbitrateRelease":
    case "arbitrateRefund":
      return value;
    default:
      throw new MockStoreError(400, "INVALID_ESCROW_ACTION", "Unknown escrow action.");
  }
}

function buildDetectedPayment(invoice: StoredInvoice, now: number): SerializablePayment {
  return {
    txid: buildTxid(),
    amount: invoice.amount,
    height: nextBlockHeight(),
    topoHeight: mockBlockHeight,
    confirmations: 0,
    status: "detected",
    detectedAt: new Date(now).toISOString(),
    destinationPort: invoice.paymentId,
  };
}

function pruneInvoices() {
  const now = Date.now();

  for (const [id, invoice] of invoices.entries()) {
    refreshInvoice(invoice, false);

    const terminal =
      invoice.status === "completed" ||
      invoice.status === "expired" ||
      invoice.createdAtMs + MAX_ABSOLUTE_INVOICE_AGE_MS < now;
    const shouldDelete =
      invoice.createdAtMs + MAX_ABSOLUTE_INVOICE_AGE_MS < now ||
      (terminal && now - invoice.lastTouchedAtMs > TERMINAL_INVOICE_RETENTION_MS);

    if (shouldDelete) {
      invoices.delete(id);
    }
  }

  if (invoices.size <= MAX_ACTIVE_INVOICES) {
    return;
  }

  const oldest = Array.from(invoices.entries()).sort(
    (a, b) => a[1].lastTouchedAtMs - b[1].lastTouchedAtMs
  );

  while (oldest.length > 0 && invoices.size > TARGET_INVOICE_COUNT) {
    const [id] = oldest.shift()!;
    invoices.delete(id);
  }
}

function clonePublicInvoice(invoice: StoredInvoice): SerializableInvoice {
  const publicInvoice = structuredClone(invoice);
  delete (publicInvoice as Partial<StoredInvoice>).sessionId;
  delete (publicInvoice as Partial<StoredInvoice>).createdAtMs;
  delete (publicInvoice as Partial<StoredInvoice>).expiresAtMs;
  delete (publicInvoice as Partial<StoredInvoice>).lastTouchedAtMs;
  delete (publicInvoice as Partial<StoredInvoice>).pendingCompleteAtMs;
  delete (publicInvoice as Partial<StoredInvoice>).escrowDeployReadyAtMs;
  return publicInvoice;
}

function pickProductId(record: Record<string, unknown>) {
  const raw = record.id ?? record.productId ?? record.sku;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new MockStoreError(400, "INVALID_CART", "Each cart line needs a product id.");
  }

  return raw.trim();
}

function parseQuantity(raw: unknown) {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;

  if (!Number.isInteger(value) || value < 1 || value > MAX_LINE_QUANTITY) {
    throw new MockStoreError(
      400,
      "INVALID_CART",
      `Quantity must be an integer between 1 and ${MAX_LINE_QUANTITY}.`
    );
  }

  return value;
}

function clampInteger(raw: unknown, fallback: number, min: number, max: number) {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;

  if (!Number.isInteger(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function buildInvoiceId() {
  return `inv_demo_${randomBytes(12).toString("hex")}`;
}

function buildPaymentId() {
  return BigInt(`0x${randomBytes(8).toString("hex")}`).toString();
}

function buildTxid() {
  return randomBytes(32).toString("hex");
}

function buildScid() {
  return randomBytes(32).toString("hex");
}

function nextBlockHeight() {
  mockBlockHeight += 1;
  return mockBlockHeight;
}
