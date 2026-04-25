"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { formatDero } from "dero-pay";
import { useCart } from "@/components/cart-context";
import { StoreShell } from "@/components/store-shell";

export default function CartPage() {
  const { items, removeItem, totalPrice } = useCart();

  return (
    <StoreShell>
      <section className="px-6 pb-18 pt-10 md:px-10 md:pb-24 md:pt-14">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-8 max-w-2xl space-y-3">
            <p className="section-kicker">Cart</p>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.05em] text-white md:text-6xl">
              Review the drop before you mint the invoice.
            </h1>
            <p className="text-sm leading-7 text-[var(--text-secondary)] md:text-base">
              The cart keeps the current behavior, but the presentation now feels like part of the same flagship store.
            </p>
          </div>

          {items.length === 0 ? (
            <div className="glass-panel-strong mx-auto max-w-3xl rounded-[2rem] p-8 text-center md:p-12">
              <p className="section-kicker mb-4">Nothing queued</p>
              <h2 className="font-display text-3xl font-semibold text-white md:text-4xl">
                Your bag is still empty.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-[var(--text-secondary)]">
                Go back to the collection, add a few pieces, and then come back here to generate a DeroPay checkout session.
              </p>
              <Link
                href="/"
                className="mt-8 inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#071008] hover:bg-[var(--accent-strong)]"
              >
                Continue shopping
              </Link>
            </div>
          ) : (
            <div className="grid gap-8 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-5">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="glass-panel soft-outline grid gap-5 rounded-[2rem] p-4 md:grid-cols-[160px_1fr_auto] md:items-center"
                  >
                    <div className="relative overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-black/25">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          width={800}
                          height={800}
                          className="aspect-square w-full object-cover md:h-40"
                        />
                      ) : (
                        <div className="aspect-square bg-white/[0.04] md:h-40" />
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        {item.category ? (
                          <span className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                            {item.category}
                          </span>
                        ) : null}
                        {item.badge ? (
                          <span className="rounded-full bg-[var(--accent-dim)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                            {item.badge}
                          </span>
                        ) : null}
                      </div>

                      <div>
                        <h2 className="font-display text-2xl font-semibold text-white">
                          {item.name}
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                          Qty {item.quantity} · Line total {formatDero(item.price * BigInt(item.quantity))}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 md:flex-col md:items-end">
                      <div className="text-left md:text-right">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          Unit price
                        </p>
                        <p className="font-display text-2xl font-semibold text-white">
                          {formatDero(item.price)}
                        </p>
                      </div>

                      <button
                        onClick={() => removeItem(item.id)}
                        className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/[0.08] px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/[0.16]"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <aside className="glass-panel-strong soft-outline h-fit rounded-[2rem] p-6 md:p-7 xl:sticky xl:top-28">
                <p className="section-kicker mb-4">Order summary</p>
                <h2 className="font-display text-3xl font-semibold text-white">
                  Ready for checkout
                </h2>
                <div className="mt-8 space-y-4">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 text-sm text-[var(--text-secondary)]">
                      <span>
                        {item.quantity}× {item.name}
                      </span>
                      <span className="font-semibold text-white">
                        {formatDero(item.price * BigInt(item.quantity))}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-8 rounded-[1.5rem] border border-white/[0.08] bg-black/25 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Total
                    </span>
                    <span className="font-display text-3xl font-semibold text-white">
                      {formatDero(totalPrice)}
                    </span>
                  </div>
                </div>

                <Link
                  href="/checkout"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#071008] hover:bg-[var(--accent-strong)]"
                >
                  Proceed to checkout
                </Link>
              </aside>
            </div>
          )}
        </div>
      </section>
    </StoreShell>
  );
}
