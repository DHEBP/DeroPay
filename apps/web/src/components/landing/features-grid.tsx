"use client";

import { motion } from "framer-motion";
import {
  EyeOff,
  Server,
  Code2,
  Component,
  FileCode2,
  Webhook,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";

const features = [
  {
    icon: <EyeOff size={22} />,
    title: "Privacy-Preserving",
    description: "Built for DERO's encrypted blockchain. Payments are confidential by default.",
  },
  {
    icon: <Server size={22} />,
    title: "Self-Hosted",
    description: "No third-party services. Everything runs on your infrastructure.",
  },
  {
    icon: <Code2 size={22} />,
    title: "TypeScript-Native",
    description: "Full type safety from wallet RPC to React component props.",
  },
  {
    icon: <Component size={22} />,
    title: "React & Next.js Ready",
    description: "Drop-in components, context providers, and hooks out of the box.",
  },
  {
    icon: <FileCode2 size={22} />,
    title: "Smart Contract Escrow",
    description: "On-chain escrow with arbitration, fees, and dispute resolution.",
  },
  {
    icon: <Webhook size={22} />,
    title: "Webhook-First",
    description: "HMAC-signed notifications on every payment state change.",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export const FeaturesGrid = () => (
  <Section className="bg-black" style={{ position: "relative", overflow: "hidden" }}>
    {/* Ambient gradient */}
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: "20%", left: "-10%", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 65%)", filter: "blur(80px)" }} />
      <div style={{ position: "absolute", bottom: "10%", right: "-5%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(147,51,234,0.15) 0%, transparent 65%)", filter: "blur(80px)" }} />
    </div>
    <SectionHeader
      eyebrow="Features"
      title="BUILT FOR SCALE"
      description="Every design decision optimizes for privacy, self-sovereignty, and developer experience."
    />

    {/* Feature Cards */}
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(3, 1fr)" }}
      className="features-cards-grid"
    >
      {features.map((feature) => (
        <motion.div
          key={feature.title}
          variants={item}
          className="group rounded-2xl border border-[#1e2a24] bg-black p-6 transition-all hover:border-[#4a6356]"
        >
          <div
            className="text-[#10b981]"
            style={{
              display: "inline-flex",
              padding: "10px",
              borderRadius: "50%",
              background: "#0a1f17",
              marginBottom: "14px",
            }}
          >
            {feature.icon}
          </div>
          <h3 className="text-base font-bold text-[#f0fdf4]" style={{ marginBottom: "6px" }}>
            {feature.title}
          </h3>
          <p className="text-sm font-medium text-[#6b7f75]" style={{ lineHeight: 1.6 }}>
            {feature.description}
          </p>
        </motion.div>
      ))}
    </motion.div>

    <style>{`
      @media (max-width: 767px) {
        .features-cards-grid {
          grid-template-columns: 1fr !important;
        }
      }
      @media (min-width: 768px) and (max-width: 1023px) {
        .features-cards-grid {
          grid-template-columns: repeat(2, 1fr) !important;
        }
      }
    `}</style>
  </Section>
);
