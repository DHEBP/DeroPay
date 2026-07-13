"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { DOCS_URL } from "@/lib/site";

export const CTASection = () => (
  <section className="relative overflow-hidden border-t border-[var(--color-border-soft)] bg-[var(--color-background)]">
    <div className="pointer-events-none absolute inset-0">
      <div className="ambient-grid" />
      <div
        className="ambient-orb"
        style={{
          background: "rgba(49, 223, 144, 0.20)",
          height: "600px",
          width: "800px",
          bottom: "-30%",
          left: "50%",
          transform: "translateX(-50%)",
          filter: "blur(100px)",
        }}
      />
      <div
        className="ambient-orb"
        style={{
          background: "rgba(217, 198, 163, 0.12)",
          height: "400px",
          width: "400px",
          top: "-20%",
          right: "10%",
          filter: "blur(80px)",
        }}
      />
    </div>

    <div className="relative z-10 mx-auto max-w-[1200px] px-6 py-32 text-center lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-[800px]"
      >
        <h2 className="text-balance font-display text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-[var(--color-text-primary)]">
          Ready to <span className="text-[var(--color-accent)]">build</span>?
        </h2>

        <p className="mx-auto mt-7 max-w-[580px] text-pretty text-base leading-7 text-[var(--color-text-secondary)] md:text-lg md:leading-8">
          Join the developers building the future of private finance. Start
          accepting DERO in minutes.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <a
            href={DOCS_URL}
            className="btn btn-accent"
            style={{ padding: "14px 28px" }}
          >
            Get started now <ArrowRight size={18} />
          </a>
          <a
            href={DOCS_URL}
            className="btn btn-ghost"
            style={{ padding: "14px 28px" }}
          >
            Read the docs
          </a>
        </div>
      </motion.div>
    </div>
  </section>
);
