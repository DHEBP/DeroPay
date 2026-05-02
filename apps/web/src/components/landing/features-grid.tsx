"use client";

import { motion } from "framer-motion";
import {
  EyeOff,
  Server,
  Code2,
  Link2,
  FileCode2,
  ShoppingCart,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";

const features = [
  {
    icon: <EyeOff size={22} />,
    title: "Private by Default",
    description:
      "Built for DERO's encrypted blockchain. Every transaction is confidential. No on-chain surveillance possible.",
  },
  {
    icon: <Server size={22} />,
    title: "Self-Hosted Gateway",
    description:
      "BTCPay Server model — you run the gateway, you control the wallet. No third-party custody, no intermediaries.",
  },
  {
    icon: <Link2 size={22} />,
    title: "Payment Links",
    description:
      "No website needed. Create an invoice, share a link via email, social, or QR poster. Customers pay from any device.",
  },
  {
    icon: <Code2 size={22} />,
    title: "Embeddable Widget",
    description:
      "One script tag, any website. A 13KB JavaScript file adds a “Pay with DERO” button with full checkout modal.",
  },
  {
    icon: <ShoppingCart size={22} />,
    title: "Ecommerce Plugins",
    description:
      "WooCommerce and Medusa.js plugins ready to go. Thin adapters that connect your store to the gateway's REST API.",
  },
  {
    icon: <FileCode2 size={22} />,
    title: "Smart Contract Escrow",
    description:
      "On-chain escrow with arbitration, fee splitting, and dispute resolution. Mainnet tested.",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export const FeaturesGrid = () => (
  <Section className="bg-[var(--color-background)]">
    <div className="pointer-events-none absolute inset-0">
      <div className="ambient-grid" />
      <div
        className="ambient-orb"
        style={{
          background: "rgba(49, 223, 144, 0.12)",
          height: "600px",
          width: "600px",
          top: "20%",
          left: "-10%",
          filter: "blur(80px)",
        }}
      />
      <div
        className="ambient-orb"
        style={{
          background: "rgba(217, 198, 163, 0.10)",
          height: "500px",
          width: "500px",
          bottom: "10%",
          right: "-5%",
          filter: "blur(80px)",
        }}
      />
    </div>

    <div className="relative z-10">
      <SectionHeader
        eyebrow="Features"
        title="Built for scale"
        description="Every design decision optimizes for privacy, self-sovereignty, and developer experience."
      />

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {features.map((feature) => (
          <motion.div
            key={feature.title}
            variants={item}
            className="glass-panel soft-outline group rounded-[1.5rem] p-6 transition-colors hover:border-[var(--color-border-hover)]"
          >
            <div className="mb-3.5 inline-flex items-center justify-center rounded-full bg-[var(--color-accent-dim)] p-2.5 text-[var(--color-accent)]">
              {feature.icon}
            </div>
            <h3 className="mb-1.5 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
              {feature.title}
            </h3>
            <p className="text-pretty text-sm leading-6 text-[var(--color-text-secondary)]">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </Section>
);
