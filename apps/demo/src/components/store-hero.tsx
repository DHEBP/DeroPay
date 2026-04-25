"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { featuredProduct, heroFacts } from "@/lib/store-catalog";
import { formatDero } from "dero-pay";

export function StoreHero() {
  return (
    <section className="relative overflow-hidden px-6 pb-10 pt-10 md:px-10 md:pb-16 md:pt-14">
      <div className="mx-auto grid w-full max-w-7xl gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="glass-panel-strong soft-outline rounded-[2rem] p-7 md:p-9"
        >
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[var(--border-strong)] bg-[var(--accent-dim)] px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-[var(--accent-strong)] uppercase">
              Demo Collection
            </span>
          </div>

          <div className="space-y-5">
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-[-0.04em] text-white md:text-7xl text-balance">
              Private payments, ready for real commerce.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[var(--text-secondary)] md:text-lg text-pretty">
              Add products, open your cart, and generate a DeroPay invoice. Every step runs
              against the live DeroPay flow — wallet auth, payment detection, and escrow
              actions included.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
              <Link
              href="#collection"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#071008] hover:translate-y-[-1px] hover:bg-[var(--accent-strong)]"
            >
              Shop the collection
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#demo-experience"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white hover:border-[var(--border-strong)] hover:bg-[var(--accent-dim)]"
            >
              See how it works
            </Link>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {heroFacts.map((fact) => (
              <div
                key={fact}
                className="rounded-[1.3rem] border border-white/[0.08] bg-white/[0.04] p-4 text-sm leading-6 text-[var(--text-secondary)] text-pretty"
              >
                {fact}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, delay: 0.1, ease: "easeOut" }}
          className="grid gap-6"
        >
          <div className="glass-panel-strong soft-outline relative overflow-hidden rounded-[2rem] p-5">
            <div className="absolute right-[-72px] top-[-72px] h-48 w-48 rounded-full bg-[var(--accent-glow)] blur-3xl" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]">
              <Image
                src={featuredProduct.image}
                alt={featuredProduct.name}
                width={1200}
                height={1200}
                className="aspect-square w-full object-cover"
                priority
              />
            </div>
            <div className="relative mt-5 flex items-end justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.16em] text-[var(--text-muted)] uppercase">
                  {featuredProduct.badge}
                </p>
                <h2 className="font-display text-2xl font-semibold text-white">
                  {featuredProduct.name}
                </h2>
                <p className="max-w-sm text-sm leading-6 text-[var(--text-secondary)] text-pretty">
                  {featuredProduct.highlight}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-white/[0.08] bg-black/[0.35] px-4 py-3 text-right">
                <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                  Price
                </p>
                <p className="font-display text-2xl font-semibold text-white">
                  {formatDero(featuredProduct.price)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass-panel rounded-[1.7rem] p-5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-dim)] text-[var(--accent-strong)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-display text-xl font-semibold text-white">
                Wallet-native checkout
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)] text-pretty">
                Auth, invoice generation, live status polling, and escrow actions all run
                inside a retail-grade shell.
              </p>
            </div>

            <div className="glass-panel rounded-[1.7rem] p-5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06] text-[var(--warm)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="font-display text-xl font-semibold text-white">
                Explainers in context
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)] text-pretty">
                Every product card opens a quick view with the relevant DeroPay flow
                embedded, so the merch and the mechanics sell each other.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
