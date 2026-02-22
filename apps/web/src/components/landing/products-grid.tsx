"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";

const products = [
  {
    title: "DeroAuth",
    tagline: "WALLET-BASED AUTHENTICATION",
    description:
      "Sign in with your DERO wallet. Schnorr signature verification, JWT sessions, React components, and Next.js middleware.",
    href: "/auth",
    image: "/images/auth.png",
  },
  {
    title: "DeroPay",
    tagline: "PAYMENT PROCESSING SDK",
    description:
      "Create invoices, generate integrated addresses, monitor payments in real time. Webhooks, pluggable storage, and a merchant dashboard.",
    href: "/pay",
    image: "/images/invoice.png",
  },
  {
    title: "Escrow",
    tagline: "SMART CONTRACT PROTECTION",
    description:
      "On-chain escrow with arbitration and platform fees. Deploy contracts, manage lifecycles, and resolve disputes through the SDK.",
    href: "/escrow",
    image: "/images/escrow.png",
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
      style={{ display: "grid", gap: "24px", gridTemplateColumns: "repeat(3, 1fr)" }}
      className="products-outer-grid"
    >
      {products.map((product) => (
        <motion.div key={product.title} variants={item}>
          <Link
            href={product.href}
            className="group flex flex-col h-full overflow-hidden rounded-2xl border border-[#1e2a24] bg-black transition-all hover:border-[#4a6356]"
          >
            {/* Image - fixed height, contained */}
            <div className="relative overflow-hidden bg-[#0a0f0d]" style={{ height: "200px" }}>
              <Image
                src={product.image}
                alt={product.title}
                width={400}
                height={250}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
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
