"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Section, SectionHeader } from "@/components/ui/section";

const steps = [
  {
    number: "01",
    title: "Authenticate",
    description:
      "User signs in with their DERO wallet. A Schnorr signature proves ownership — no email, no password, no personal data exposed.",
    image: "/mockups/security.png",
  },
  {
    number: "02",
    title: "Pay",
    description:
      "An invoice is created with a unique integrated address. The customer scans a QR code and sends DERO. The SDK monitors and confirms the payment.",
    image: "/mockups/insights.png",
  },
  {
    number: "03",
    title: "Protect",
    description:
      "For high-value transactions, funds go into an on-chain escrow smart contract. Released on delivery, refunded on dispute, or arbitrated by a neutral party.",
    image: "/mockups/radar.png",
  },
];

export const HowItWorks = () => (
  <Section className="bg-black border-t border-[#1e2a24]" style={{ position: "relative", overflow: "hidden" }}>
    {/* Ambient gradient */}
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: "0%", right: "10%", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, rgba(147,51,234,0.16) 0%, transparent 60%)", filter: "blur(100px)" }} />
      <div style={{ position: "absolute", bottom: "0%", left: "10%", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 65%)", filter: "blur(80px)" }} />
    </div>
    <SectionHeader
      eyebrow="Workflow"
      title="HOW IT WORKS"
      description="Three layers. One flow. Identity, payment, and protection."
    />

    <div style={{ display: "flex", flexDirection: "column", gap: "64px" }}>
      {steps.map((step, i) => (
        <motion.div
          key={step.number}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className={`how-it-works-row how-it-works-row-${i}`}
          style={{
            display: "grid",
            gap: "32px",
            gridTemplateColumns: "1fr",
            alignItems: "center",
          }}
        >
          {/* Text */}
          <div style={{ order: i % 2 === 0 ? 1 : 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
              <span className="text-4xl font-black text-[#10b981]" style={{ opacity: 0.4 }}>
                {step.number}
              </span>
              <div style={{ height: "1px", flex: 1, background: "#1e2a24" }} />
            </div>
            <h3 className="text-2xl font-bold text-[#f0fdf4]" style={{ marginBottom: "12px" }}>
              {step.title}
            </h3>
            <p className="text-base font-medium text-[#6b7f75]" style={{ lineHeight: 1.7, maxWidth: "480px" }}>
              {step.description}
            </p>
          </div>

          {/* Image - constrained */}
          <div
            className="overflow-hidden rounded-2xl border border-[#1e2a24]"
            style={{ order: i % 2 === 0 ? 2 : 1, maxHeight: "320px" }}
          >
            <Image
              src={step.image}
              alt={step.title}
              width={500}
              height={320}
              className="w-full h-full object-cover"
            />
          </div>
        </motion.div>
      ))}
    </div>

    <style>{`
      @media (min-width: 768px) {
        .how-it-works-row {
          grid-template-columns: 1fr 1fr !important;
        }
      }
    `}</style>
  </Section>
);
