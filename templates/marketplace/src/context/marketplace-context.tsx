"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { calculateCartSummary, mergeCartItem, updateCartQuantity } from "@/lib/cart";
import { listings as baseListings, sellers as baseSellers } from "@/lib/marketplace-data";
import { createSellerListing, type ListingInput } from "@/lib/listing-input";
import {
  recordRecentlyViewedListingId,
  toggleCompareListingId,
  toggleWatchedListingId,
} from "@/lib/watchlist";
import type {
  CartItem,
  CartSummary,
  CheckoutDetails,
  DeroPayWebhookEvent,
  Listing,
  MarketplaceSnapshot,
  Order,
  PaymentIntent,
  PaymentRail,
  Seller,
} from "@/lib/types";

type LocalState = {
  cart: CartItem[];
  customListings: Listing[];
  watchedListingIds: string[];
  recentlyViewedListingIds: string[];
  compareListingIds: string[];
  buyerDefaults: CheckoutDetails;
};

type MarketplaceContextValue = MarketplaceSnapshot &
  LocalState & {
    listings: Listing[];
    sellers: Seller[];
    cartSummary: CartSummary;
    cartCount: number;
    serverError: string;
    buyerDefaults: CheckoutDetails;
    addToCart: (listingId: string) => void;
    toggleWatchListing: (listingId: string) => void;
    isListingWatched: (listingId: string) => boolean;
    trackRecentlyViewedListing: (listingId: string) => void;
    toggleCompareListing: (listingId: string) => void;
    isListingCompared: (listingId: string) => boolean;
    saveBuyerDefaults: (details: CheckoutDetails) => void;
    updateQuantity: (listingId: string, quantity: number) => void;
    clearCart: () => void;
    refreshOrders: () => Promise<void>;
    createCheckout: (
      rail: PaymentRail,
      checkoutDetails: CheckoutDetails
    ) => Promise<Order | null>;
    simulatePaymentDetected: (orderId: string) => Promise<void>;
    simulatePaymentConfirming: (orderId: string) => Promise<void>;
    simulatePaymentCompleted: (orderId: string) => Promise<void>;
    simulatePartialPayment: (orderId: string) => Promise<void>;
    simulateInvoiceExpired: (orderId: string) => Promise<void>;
    pollInvoiceStatus: (invoiceId: string) => Promise<void>;
    sellerAdvanceOrder: (orderId: string) => Promise<void>;
    sellerSubmitEvidence: (
      orderId: string,
      evidence: { kind: "seller_note" | "tracking" | "digital_delivery"; summary: string }
    ) => Promise<void>;
    respondToDispute: (orderId: string, response: string) => Promise<void>;
    resolveDispute: (orderId: string, resolution: "refund" | "release") => Promise<void>;
    releaseOrder: (orderId: string) => Promise<void>;
    openDispute: (orderId: string, reason: string) => Promise<void>;
    createListing: (input: ListingInput) => Promise<Listing>;
  };

const STORAGE_KEY = "dero-marketplace-local-v4";

const defaultBuyerDefaults: CheckoutDetails = {
  buyerAlias: "demo-buyer",
  contactHandle: "@demo-buyer",
  deliveryType: "physical",
  deliveryDestination: "Demo shipping address or delivery contact",
  orderNote: "",
};

const localSeller: Seller = {
  id: "sel_local",
  slug: "my-dero-store",
  name: "My DERO Store",
  location: "Local seller",
  tier: "new",
  rating: 0,
  reviewCount: 0,
  sales: 0,
  responseTime: "Not measured",
  joined: "2026",
  bio: "Draft seller workspace for testing listings, orders, and DERO checkout.",
  policies: ["DeroPay invoice default", "Manual fulfillment", "Message trail"],
};

const initialLocalState: LocalState = {
  cart: [],
  customListings: [],
  watchedListingIds: [],
  recentlyViewedListingIds: [],
  compareListingIds: [],
  buyerDefaults: defaultBuyerDefaults,
};

const initialServerState: MarketplaceSnapshot = {
  serverListings: [],
  orders: [],
  paymentIntents: [],
  webhookEvents: [],
  disputes: [],
  fulfillmentEvidence: [],
  auditEvents: [],
};

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

function readLocalState(): LocalState {
  if (typeof window === "undefined") return initialLocalState;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialLocalState;
  try {
    return { ...initialLocalState, ...(JSON.parse(raw) as Partial<LocalState>) };
  } catch {
    return initialLocalState;
  }
}

function uniqueListings(rows: Listing[]): Listing[] {
  const seen = new Set<string>();
  return rows.filter((listing) => {
    if (seen.has(listing.id)) return false;
    seen.add(listing.id);
    return true;
  });
}

function actorHeaders(
  role: "buyer" | "seller" | "dev",
  options: { buyerAlias?: string; sellerId?: string } = {}
): Record<string, string> {
  const actorId =
    role === "seller" ? options.sellerId ?? "sel_local" : role === "dev" ? "dev" : options.buyerAlias ?? "demo-buyer";
  return {
    "x-marketplace-role": role,
    "x-marketplace-actor-id": actorId,
    ...(options.buyerAlias ? { "x-marketplace-buyer": options.buyerAlias } : {}),
    ...(options.sellerId ? { "x-marketplace-seller": options.sellerId } : {}),
  };
}

function readHeaders(buyerAlias: string): Record<string, string> {
  if (typeof window !== "undefined") {
    if (window.location.pathname.startsWith("/dev")) return actorHeaders("dev");
    if (window.location.pathname.startsWith("/sell")) {
      return actorHeaders("seller", { sellerId: "sel_local" });
    }
  }
  return actorHeaders("buyer", { buyerAlias });
}

function sellerActionHeaders(): Record<string, string> {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/dev")) {
    return actorHeaders("dev");
  }
  return actorHeaders("seller", { sellerId: "sel_local" });
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with HTTP ${response.status}`);
  }
  return payload;
}

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [localState, setLocalState] = useState<LocalState>(initialLocalState);
  const [serverState, setServerState] = useState<MarketplaceSnapshot>(initialServerState);
  const [serverError, setServerError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setLocalState(readLocalState());
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
  }, [hydrated, localState]);

  const refreshOrders = useCallback(async () => {
    try {
      const snapshot = await readJson<MarketplaceSnapshot>(
        await fetch("/api/orders", {
          headers: readHeaders(localState.buyerDefaults.buyerAlias),
        })
      );
      setServerState(snapshot);
      setServerError("");
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Could not load orders");
    }
  }, [localState.buyerDefaults.buyerAlias]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshOrders();
    });
  }, [refreshOrders]);

  const listings = useMemo(
    () =>
      uniqueListings([
        ...baseListings,
        ...serverState.serverListings,
        ...localState.customListings,
      ]),
    [localState.customListings, serverState.serverListings]
  );
  const sellers = useMemo(() => [...baseSellers, localSeller], []);
  const cartSummary = useMemo(
    () => calculateCartSummary(localState.cart, listings),
    [localState.cart, listings]
  );
  const cartCount = useMemo(
    () => localState.cart.reduce((sum, item) => sum + item.quantity, 0),
    [localState.cart]
  );

  const addToCart = useCallback((listingId: string) => {
    setLocalState((current) => ({
      ...current,
      cart: mergeCartItem(current.cart, listingId),
    }));
  }, []);

  const toggleWatchListing = useCallback((listingId: string) => {
    setLocalState((current) => {
      return {
        ...current,
        watchedListingIds: toggleWatchedListingId(current.watchedListingIds, listingId),
      };
    });
  }, []);

  const isListingWatched = useCallback(
    (listingId: string) => localState.watchedListingIds.includes(listingId),
    [localState.watchedListingIds]
  );

  const trackRecentlyViewedListing = useCallback((listingId: string) => {
    setLocalState((current) => ({
      ...current,
      recentlyViewedListingIds: recordRecentlyViewedListingId(
        current.recentlyViewedListingIds,
        listingId
      ),
    }));
  }, []);

  const toggleCompareListing = useCallback((listingId: string) => {
    setLocalState((current) => ({
      ...current,
      compareListingIds: toggleCompareListingId(current.compareListingIds, listingId),
    }));
  }, []);

  const isListingCompared = useCallback(
    (listingId: string) => localState.compareListingIds.includes(listingId),
    [localState.compareListingIds]
  );

  const saveBuyerDefaults = useCallback((details: CheckoutDetails) => {
    setLocalState((current) => ({ ...current, buyerDefaults: details }));
  }, []);

  const updateQuantity = useCallback((listingId: string, quantity: number) => {
    setLocalState((current) => ({
      ...current,
      cart: updateCartQuantity(current.cart, listingId, quantity),
    }));
  }, []);

  const clearCart = useCallback(() => {
    setLocalState((current) => ({ ...current, cart: [] }));
  }, []);

  const createCheckout = useCallback(
    async (rail: PaymentRail, checkoutDetails: CheckoutDetails) => {
      if (cartSummary.lines.length === 0) return null;
      try {
        const result = await readJson<{
          order: Order;
          invoice: PaymentIntent;
          snapshot: MarketplaceSnapshot;
        }>(
          await fetch("/api/checkout", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...actorHeaders("buyer", { buyerAlias: checkoutDetails.buyerAlias }),
            },
            body: JSON.stringify({
              buyerAlias: checkoutDetails.buyerAlias,
              checkoutDetails,
              rail,
              items: localState.cart,
            }),
          })
        );
        setLocalState((current) => ({
          ...current,
          cart: [],
          buyerDefaults: checkoutDetails,
        }));
        setServerState(result.snapshot);
        setServerError("");
        return result.order;
      } catch (error) {
        setServerError(error instanceof Error ? error.message : "Checkout failed");
        return null;
      }
    },
    [cartSummary.lines.length, localState.cart]
  );

  const postSnapshot = useCallback(async (
    url: string,
    body?: unknown,
    headers: Record<string, string> = readHeaders(localState.buyerDefaults.buyerAlias)
  ) => {
    try {
      const snapshot = await readJson<MarketplaceSnapshot>(
        await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      );
      setServerState(snapshot);
      setServerError("");
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Order update failed");
    }
  }, [localState.buyerDefaults.buyerAlias]);

  const simulateWebhook = useCallback(
    async (orderId: string, type: DeroPayWebhookEvent["type"]) => {
      await postSnapshot(`/api/dev/orders/${orderId}/webhook`, { type }, actorHeaders("dev"));
    },
    [postSnapshot]
  );

  const simulatePaymentDetected = useCallback(
    async (orderId: string) => {
      await simulateWebhook(orderId, "payment.detected");
    },
    [simulateWebhook]
  );

  const simulatePaymentConfirming = useCallback(
    async (orderId: string) => {
      await simulateWebhook(orderId, "payment.confirming");
    },
    [simulateWebhook]
  );

  const simulatePaymentCompleted = useCallback(
    async (orderId: string) => {
      await simulateWebhook(orderId, "payment.completed");
    },
    [simulateWebhook]
  );

  const simulatePartialPayment = useCallback(
    async (orderId: string) => {
      await simulateWebhook(orderId, "payment.partial");
    },
    [simulateWebhook]
  );

  const simulateInvoiceExpired = useCallback(
    async (orderId: string) => {
      await simulateWebhook(orderId, "invoice.expired");
    },
    [simulateWebhook]
  );

  const pollInvoiceStatus = useCallback(async (invoiceId: string) => {
    try {
      const snapshot = await readJson<MarketplaceSnapshot>(
        await fetch(`/api/invoices/${invoiceId}/reconcile`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...actorHeaders("buyer", { buyerAlias: localState.buyerDefaults.buyerAlias }),
          },
        })
      );
      setServerState(snapshot);
      setServerError("");
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Invoice poll failed");
    }
  }, [localState.buyerDefaults.buyerAlias]);

  const sellerAdvanceOrder = useCallback(
    async (orderId: string) => {
      await postSnapshot(
        `/api/orders/${orderId}/fulfillment`,
        undefined,
        sellerActionHeaders()
      );
    },
    [postSnapshot]
  );

  const sellerSubmitEvidence = useCallback(
    async (
      orderId: string,
      evidence: { kind: "seller_note" | "tracking" | "digital_delivery"; summary: string }
    ) => {
      await postSnapshot(
        `/api/orders/${orderId}/fulfillment`,
        evidence,
        sellerActionHeaders()
      );
    },
    [postSnapshot]
  );

  const respondToDispute = useCallback(
    async (orderId: string, response: string) => {
      await postSnapshot(
        `/api/orders/${orderId}/dispute/respond`,
        { response },
        actorHeaders("seller", { sellerId: "sel_local" })
      );
    },
    [postSnapshot]
  );

  const resolveDispute = useCallback(
    async (orderId: string, resolution: "refund" | "release") => {
      await postSnapshot(
        `/api/orders/${orderId}/dispute/resolve`,
        { resolution },
        actorHeaders("dev")
      );
    },
    [postSnapshot]
  );

  const releaseOrder = useCallback(
    async (orderId: string) => {
      await postSnapshot(
        `/api/orders/${orderId}/release`,
        undefined,
        actorHeaders("buyer", { buyerAlias: localState.buyerDefaults.buyerAlias })
      );
    },
    [localState.buyerDefaults.buyerAlias, postSnapshot]
  );

  const openDispute = useCallback(
    async (orderId: string, reason: string) => {
      await postSnapshot(
        `/api/orders/${orderId}/dispute`,
        { reason },
        actorHeaders("buyer", { buyerAlias: localState.buyerDefaults.buyerAlias })
      );
    },
    [localState.buyerDefaults.buyerAlias, postSnapshot]
  );

  const createListing = useCallback(async (input: ListingInput) => {
    try {
      const result = await readJson<{
        listing: Listing;
        snapshot: MarketplaceSnapshot;
      }>(
        await fetch("/api/listings", {
            method: "POST",
          headers: {
            "content-type": "application/json",
            ...actorHeaders("seller", { sellerId: "sel_local" }),
          },
          body: JSON.stringify(input),
        })
      );
      setServerState(result.snapshot);
      setServerError("");
      return result.listing;
    } catch (error) {
      const listing = createSellerListing(input);
      setLocalState((current) => ({
        ...current,
        customListings: [listing, ...current.customListings],
      }));
      setServerError(error instanceof Error ? error.message : "Listing saved locally");
      return listing;
    }
  }, []);

  const value = useMemo<MarketplaceContextValue>(
    () => ({
      ...localState,
      ...serverState,
      listings,
      sellers,
      cartSummary,
      cartCount,
      serverError,
      buyerDefaults: localState.buyerDefaults,
      addToCart,
      toggleWatchListing,
      isListingWatched,
      trackRecentlyViewedListing,
      toggleCompareListing,
      isListingCompared,
      saveBuyerDefaults,
      updateQuantity,
      clearCart,
      refreshOrders,
      createCheckout,
      simulatePaymentDetected,
      simulatePaymentConfirming,
      simulatePaymentCompleted,
      simulatePartialPayment,
      simulateInvoiceExpired,
      pollInvoiceStatus,
      sellerAdvanceOrder,
      sellerSubmitEvidence,
      respondToDispute,
      resolveDispute,
      releaseOrder,
      openDispute,
      createListing,
    }),
    [
      localState,
      serverState,
      listings,
      sellers,
      cartSummary,
      cartCount,
      serverError,
      addToCart,
      toggleWatchListing,
      isListingWatched,
      trackRecentlyViewedListing,
      toggleCompareListing,
      isListingCompared,
      saveBuyerDefaults,
      updateQuantity,
      clearCart,
      refreshOrders,
      createCheckout,
      simulatePaymentDetected,
      simulatePaymentConfirming,
      simulatePaymentCompleted,
      simulatePartialPayment,
      simulateInvoiceExpired,
      pollInvoiceStatus,
      sellerAdvanceOrder,
      sellerSubmitEvidence,
      respondToDispute,
      resolveDispute,
      releaseOrder,
      openDispute,
      createListing,
    ]
  );

  return (
    <MarketplaceContext.Provider value={value}>
      {children}
    </MarketplaceContext.Provider>
  );
}

export function useMarketplace() {
  const context = useContext(MarketplaceContext);
  if (!context) {
    throw new Error("useMarketplace must be used inside MarketplaceProvider");
  }
  return context;
}
