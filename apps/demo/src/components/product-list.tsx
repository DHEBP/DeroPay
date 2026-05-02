"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { formatDero } from "dero-pay";
import { useCart } from "./cart-context";
import { useToast } from "./toast";
import { ProductQuickView } from "@/components/product-quick-view";
import { getStoreProduct, storeProducts, type StoreProduct } from "@/lib/store-catalog";

export function ProductList() {
  const { addItem } = useCart();
  const { success } = useToast();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const selectedProduct = selectedProductId ? getStoreProduct(selectedProductId) ?? null : null;

  const handleAdd = (product: StoreProduct) => {
    addItem(product);
    success(`${product.name} added`, "Item is in your cart.");
    setAddedIds((prev) => new Set(prev).add(product.id));

    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }, 1800);
  };

  const openQuickView = (productId: string) => {
    setSelectedProductId(productId);
  };

  return (
    <>
      <section id="collection" className="px-6 pb-20 md:px-10 md:pb-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="section-kicker">Collection</p>
              <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-white md:text-5xl text-balance">
                Six products, six ways to show DeroPay in action.
              </h2>
              <p className="text-sm leading-7 text-[var(--text-secondary)] md:text-base text-pretty">
                Click any card to open a quick view with the DeroPay flow best suited to
                that product — payment, wallet sign-in, or escrow.
              </p>
            </div>
          </div>

          <div className="grid auto-rows-fr gap-6 md:grid-cols-2 xl:grid-cols-3">
            {storeProducts.map((product) => {
              const added = addedIds.has(product.id);

              return (
                <article
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${product.name} details`}
                  onClick={() => openQuickView(product.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openQuickView(product.id);
                    }
                  }}
                  className="glass-panel soft-outline group flex cursor-pointer flex-col overflow-hidden rounded-[2rem] p-5 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-bg)]"
                >
                  <div className="relative overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-black/25">
                    <Image
                      src={product.image}
                      alt={product.name}
                      width={1200}
                      height={1200}
                      className="aspect-square w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                  </div>

                  <div className="flex flex-1 flex-col gap-4 pt-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        {product.category}
                      </span>
                      <span className="rounded-full bg-[var(--accent-dim)] px-3 py-1 text-[11px] font-semibold text-[var(--accent-strong)]">
                        {product.badge}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-display text-2xl font-semibold tracking-[-0.03em] text-white">
                        {product.name}
                      </h3>
                      <p className="line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">
                        {product.description}
                      </p>
                    </div>

                    <p className="text-xs text-[var(--text-muted)]">
                      Preview how {product.demoKey === "payment" ? "payment" : product.demoKey === "auth" ? "wallet sign-in" : "escrow"} fits this product.
                    </p>

                    <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                          Price
                        </p>
                        <p className="whitespace-nowrap font-display text-2xl font-semibold tabular-nums tracking-[-0.03em] text-white">
                          {formatDero(product.price)}
                        </p>
                      </div>

                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleAdd(product);
                        }}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                          added
                            ? "bg-[var(--accent)] text-[#051008]"
                            : "border border-white/10 bg-white/[0.04] text-white hover:border-[var(--border-strong)] hover:bg-[var(--accent-dim)]"
                        }`}
                      >
                        {added ? (
                          <>
                            <Check className="h-4 w-4" />
                            Added
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Add to cart
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <ProductQuickView
        product={selectedProduct}
        onClose={() => setSelectedProductId(null)}
        onAdd={handleAdd}
      />
    </>
  );
}
