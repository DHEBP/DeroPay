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
  purpleGlow?: string;
};

const products: Product[] = [
  {
    title: "DeroAuth",
    tagline: "WALLET-BASED AUTHENTICATION",
    description:
      "Sign in with your DERO wallet. Schnorr signature verification, JWT sessions, React components, and Next.js middleware.",
    href: "/auth",
    image: "/images/auth.png",
    purpleGlow: "bottom left",
  },
  {
    title: "DeroPay",
    tagline: "PAYMENT PROCESSING SDK",
    description:
      "Create invoices, generate integrated addresses, monitor payments in real time. Webhooks, pluggable storage, and a merchant dashboard.",
    href: "/pay",
    image: "/images/invoice.png",
    purpleGlow: "bottom right",
  },
  {
    title: "Payment Router",
    tagline: "INSTANT ON-CHAIN SETTLEMENT",
    description:
      "Deploy once, accept unlimited payments. A single smart contract splits funds instantly between merchant and fee recipient in one transaction.",
    href: "https://deropay.derod.org/payment-router/overview",
    image: "/images/router.png",
    purpleGlow: "top right",
  },
  {
    title: "Escrow",
    tagline: "SMART CONTRACT PROTECTION",
    description:
      "One contract per transaction with arbitration, platform fees, and dispute resolution. Buyer protection backed by DERO\u2019s blockchain.",
    href: "/escrow",
    image: "/images/escrow.png",
    purpleGlow: "top left",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
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
      style={{ display: "grid", gap: "24px", gridTemplateColumns: "repeat(2, 1fr)" }}
      className="products-outer-grid"
    >
      {products.map((product) => (
        <motion.div key={product.title} variants={item}>
          <Link
            href={product.href}
            className="group flex flex-col h-full overflow-hidden rounded-2xl border border-[#1e2a24] bg-black transition-all hover:border-[#4a6356]"
          >
            <div className="relative overflow-hidden bg-[#0a0f0d] aspect-[16/10]">
              <Image
                src={product.image}
                alt={product.title}
                fill
                className="object-cover"
              />
              {product.purpleGlow && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at ${product.purpleGlow}, rgba(147,51,234,0.07) 0%, transparent 60%)`,
                  }}
                />
              )}
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#10b981]">
                {product.tagline}
              </p>
              <h3 className="mt-2 text-xl font-bold text-[#f0fdf4]">
                {product.title}
              </h3>
              <p className="mt-3 flex-1 text-sm font-medium leading-relaxed text-[#6b7f75]">
                {product.description}
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm font-bold text-[#f0fdf4] group-hover:underline">
                Learn more
                <ArrowRight size={14} />
              </div>
            </div>
          </Link>
        </motion.div>
      ))}
    </motion.div>

    <style>{`
      @media (max-width: 767px) {
        .products-outer-grid {
          grid-template-columns: 1fr !important;
        }
      }
    `}</style>
  </Section>
);
