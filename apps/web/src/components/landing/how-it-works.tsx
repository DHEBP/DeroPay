"use client";

import { motion } from "framer-motion";
import { Section, SectionHeader } from "@/components/ui/section";
import {
  AuthenticateIllustration,
  PayIllustration,
  ProtectIllustration,
} from "./how-it-works-illustrations";
import type { ReactNode } from "react";

const steps: {
  number: string;
  title: string;
  description: string;
  illustration: ReactNode;
}[] = [
  {
    number: "01",
    title: "Authenticate",
    description:
      "User signs in with their DERO wallet. A Schnorr signature proves ownership — no email, no password, no personal data exposed.",
    illustration: <AuthenticateIllustration />,
  },
  {
    number: "02",
    title: "Pay",
    description:
      "An invoice is created with a unique integrated address. The customer scans a QR code and sends DERO. The SDK monitors and confirms the payment.",
    illustration: <PayIllustration />,
  },
  {
    number: "03",
    title: "Protect",
    description:
      "For high-value transactions, funds go into an on-chain escrow smart contract. Released on delivery, refunded on dispute, or arbitrated by a neutral party.",
    illustration: <ProtectIllustration />,
  },
];

export const HowItWorks = () => (
  <Section className="border-t border-[var(--color-border-soft)] bg-[var(--color-background)]">
    <div className="pointer-events-none absolute inset-0">
      <div className="ambient-grid" />
      <div
        className="ambient-orb"
        style={{
          background: "rgba(217, 198, 163, 0.12)",
          height: "600px",
          width: "600px",
          top: "0%",
          right: "10%",
          filter: "blur(100px)",
        }}
      />
      <div
        className="ambient-orb"
        style={{
          background: "rgba(49, 223, 144, 0.10)",
          height: "600px",
          width: "600px",
          bottom: "0%",
          left: "10%",
          filter: "blur(80px)",
        }}
      />
    </div>

    <div className="relative z-10">
      <SectionHeader
        eyebrow="Workflow"
        title="How it works"
        description="Three layers. One flow. Identity, payment, and protection."
      />

      <div className="flex flex-col gap-16">
        {steps.map((step, i) => {
          const reverseOnDesktop = i % 2 !== 0;
          return (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="grid grid-cols-1 items-center gap-8 md:grid-cols-2"
            >
              <div className={reverseOnDesktop ? "md:order-2" : ""}>
                <div className="mb-5 flex items-center gap-4">
                  <span className="font-display text-4xl font-semibold tabular-nums tracking-[-0.04em] text-[var(--color-accent)] opacity-60">
                    {step.number}
                  </span>
                  <div className="h-px flex-1 bg-[var(--color-border-soft)]" />
                </div>
                <h3 className="mb-3 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] md:text-3xl">
                  {step.title}
                </h3>
                <p className="max-w-[480px] text-pretty text-base leading-7 text-[var(--color-text-secondary)] md:text-lg md:leading-8">
                  {step.description}
                </p>
              </div>

              <div
                className={`glass-panel soft-outline overflow-hidden rounded-[1.5rem] ${
                  reverseOnDesktop ? "md:order-1" : ""
                }`}
              >
                {step.illustration}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  </Section>
);
