"use client";

import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { formatDero } from "dero-pay";
import { DemoExperience } from "@/components/demo-showcase";
import {
  clearActiveCheckoutSession,
  createProductCheckoutDraft,
  writePendingCheckoutDraft,
} from "@/lib/checkout-session";
import type { StoreProduct } from "@/lib/store-catalog";

export function ProductQuickView({
  product,
  onClose,
  onAdd,
}: {
  product: StoreProduct | null;
  onClose: () => void;
  onAdd: (product: StoreProduct) => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!product) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, product]);

  const openCheckout = () => {
    if (!product) {
      return;
    }

    clearActiveCheckoutSession();
    writePendingCheckoutDraft(createProductCheckoutDraft(product));
    onClose();
    router.push("/checkout");
  };

  return (
    <AnimatePresence>
      {product ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-md md:px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="glass-panel-strong soft-outline relative w-full max-w-7xl rounded-[2.25rem]"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-5 top-5 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-black/[0.28] text-[var(--text-secondary)] hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="grid gap-0 xl:grid-cols-[0.44fr_0.56fr]">
              <div className="border-b border-white/[0.08] p-6 xl:border-b-0 xl:border-r xl:p-7">
                <div className="relative overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-black/[0.24]">
                  <Image
                    src={product.image}
                    alt={product.name}
                    width={1200}
                    height={1200}
                    className="aspect-square w-full object-cover"
                  />
                </div>

                <div className="mt-6 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      {product.category}
                    </span>
                    <span className="rounded-full bg-[var(--accent-dim)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                      {product.badge}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--warm)]">
                      {product.eyebrow}
                    </p>
                    <h2 className="mt-2 font-display text-4xl font-semibold tracking-[-0.05em] text-white">
                      {product.name}
                    </h2>
                    <p className="mt-3 text-base leading-8 text-[var(--text-secondary)]">
                      {product.detail}
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.04] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Why this matters
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                      {product.demoReason}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {product.storyPoints.map((point) => (
                      <div
                        key={point}
                        className="rounded-[1.25rem] border border-white/[0.08] bg-black/[0.22] px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]"
                      >
                        {point}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-end justify-between gap-5 rounded-[1.6rem] border border-white/[0.08] bg-black/[0.22] p-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Price
                      </p>
                      <p className="mt-2 font-display text-4xl font-semibold text-white">
                        {formatDero(product.price)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => onAdd(product)}
                        className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#071008] hover:bg-[var(--accent-strong)]"
                      >
                        Add to cart
                      </button>
                      <button
                        type="button"
                        onClick={openCheckout}
                        className="rounded-full border border-white/[0.08] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white hover:border-[var(--border-strong)] hover:bg-[var(--accent-dim)]"
                      >
                        Open checkout
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 xl:p-7">
                <DemoExperience
                  key={`${product.id}-${product.demoKey}`}
                  demoKey={product.demoKey}
                  compact
                  context={product.demoReason}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
