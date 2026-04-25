"use client";

import type { CartItem } from "@/components/cart-context";
import type { StoreProduct } from "@/lib/store-catalog";

const ACTIVE_CHECKOUT_SESSION_KEY = "demo.active-checkout-session";
const PENDING_CHECKOUT_DRAFT_KEY = "demo.pending-checkout-draft";

export type CheckoutSnapshotItem = {
  id: string;
  name: string;
  priceAtomic: string;
  quantity: number;
  image?: string;
  category?: string;
  badge?: string;
};

export type CheckoutDraft = {
  source: "cart" | "product";
  invoiceName: string;
  invoiceDescription: string;
  totalAtomic: string;
  items: CheckoutSnapshotItem[];
};

export type ActiveCheckoutSession = {
  invoiceId: string;
  useEscrow: boolean;
  order: CheckoutDraft;
};

type CheckoutStorageShape = {
  invoiceId: string;
  useEscrow: boolean;
  order: CheckoutDraft;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function removeKey(key: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(key);
}

export function getCheckoutItemCount(items: CheckoutSnapshotItem[]) {
  return items.reduce((count, item) => count + item.quantity, 0);
}

export function snapshotCartItems(items: CartItem[]): CheckoutSnapshotItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    priceAtomic: item.price.toString(),
    quantity: item.quantity,
    image: item.image,
    category: item.category,
    badge: item.badge,
  }));
}

export function createCartCheckoutDraft(items: CartItem[]): CheckoutDraft {
  const snapshotItems = snapshotCartItems(items);
  const unitCount = getCheckoutItemCount(snapshotItems);
  const totalAtomic = snapshotItems
    .reduce((sum, item) => sum + BigInt(item.priceAtomic) * BigInt(item.quantity), 0n)
    .toString();

  return {
    source: "cart",
    invoiceName: "Demo Store Order",
    invoiceDescription: `Order containing ${unitCount} item${unitCount === 1 ? "" : "s"}`,
    totalAtomic,
    items: snapshotItems,
  };
}

export function createProductCheckoutDraft(product: StoreProduct): CheckoutDraft {
  return {
    source: "product",
    invoiceName: product.name,
    invoiceDescription: `Buy now checkout for ${product.name}`,
    totalAtomic: product.price.toString(),
    items: [
      {
        id: product.id,
        name: product.name,
        priceAtomic: product.price.toString(),
        quantity: 1,
        image: product.image,
        category: product.category,
        badge: product.badge,
      },
    ],
  };
}

export function readActiveCheckoutSession(): ActiveCheckoutSession | null {
  const session = readJson<CheckoutStorageShape>(ACTIVE_CHECKOUT_SESSION_KEY);
  if (!session?.invoiceId || !session.order) {
    return null;
  }
  return session;
}

export function writeActiveCheckoutSession(session: ActiveCheckoutSession | null) {
  if (!session) {
    removeKey(ACTIVE_CHECKOUT_SESSION_KEY);
    return;
  }

  writeJson(ACTIVE_CHECKOUT_SESSION_KEY, session);
}

export function clearActiveCheckoutSession() {
  removeKey(ACTIVE_CHECKOUT_SESSION_KEY);
}

export function readPendingCheckoutDraft(): CheckoutDraft | null {
  const draft = readJson<CheckoutDraft>(PENDING_CHECKOUT_DRAFT_KEY);
  if (!draft?.items?.length || !draft.totalAtomic) {
    return null;
  }
  return draft;
}

export function writePendingCheckoutDraft(draft: CheckoutDraft | null) {
  if (!draft) {
    removeKey(PENDING_CHECKOUT_DRAFT_KEY);
    return;
  }

  writeJson(PENDING_CHECKOUT_DRAFT_KEY, draft);
}

export function consumePendingCheckoutDraft(): CheckoutDraft | null {
  const draft = readPendingCheckoutDraft();
  removeKey(PENDING_CHECKOUT_DRAFT_KEY);
  return draft;
}
