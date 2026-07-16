"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";

type Product = {
  title: string;
  tagline: string;
  description: string;
  href: string;
  image: string;
};

const products: Product[] = [
  {
    title: "DeroAuth",
    tagline: "Wallet-Based Authentication",
    description:
      "Sign in with your DERO wallet. Schnorr signature verification, JWT sessions, React components, and Next.js middleware.",
    href: "/auth",
    image: "/images/auth.webp",
  },
  {
    title: "DeroPay",
    tagline: "Payment Processing SDK",
    description:
      "Create invoices, generate integrated addresses, monitor payments in real time. Webhooks, pluggable storage, and a merchant dashboard.",
    href: "/pay",
    image: "/images/invoice.webp",
  },
  {
    title: "x402",
    tagline: "Agentic Commerce Rail",
    description:
      "Internet-native payment negotiation for APIs and agents. Request → 402 challenge → pay → retry with proof → response.",
    href: "/x402",
    image: "/images/402.webp",
  },
  {
    title: "Payment Router",
    tagline: "Instant On-Chain Settlement",
    description:
      "Deploy once, accept unlimited payments. A single smart contract splits funds instantly between merchant and fee recipient in one transaction.",
    href: "https://deropay.derod.org/payment-router/overview",
    image: "/images/router.webp",
  },
  {
    title: "Escrow",
    tagline: "Smart Contract Protection",
    description:
      "One contract per transaction with arbitration, platform fees, and dispute resolution. Buyer protection backed by DERO\u2019s blockchain.",
    href: "/escrow",
    image: "/images/escrow.webp",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

export const ProductsGrid = () => (
  <Section>
    <SectionHeader
      eyebrow="Ecosystem"
      title="The DERO Stack"
      description="Everything you need to build private, decentralized commerce applications."
    />

    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-100px" }}
      className="grid grid-cols-1 gap-6 md:grid-cols-2"
    >
      {products.map((product) => (
        <motion.div key={product.title} variants={item}>
          <Link
            href={product.href}
            className="glass-panel soft-outline group flex h-full flex-col overflow-hidden rounded-[1.7rem] transition-colors hover:border-[var(--color-border-strong)]"
          >
            <div className="relative aspect-[16/10] overflow-hidden bg-[var(--color-background)]">
              <Image
                src={product.image}
                alt={product.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            </div>

            <div className="flex flex-1 flex-col p-6">
              <p className="section-kicker">{product.tagline}</p>
              <h3 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
                {product.title}
              </h3>
              <p className="mt-3 flex-1 text-pretty text-sm leading-6 text-[var(--color-text-secondary)]">
                {product.description}
              </p>
              <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-accent-strong)]">
                Learn more
                <ArrowRight
                  size={14}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </div>
            </div>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  </Section>
);
