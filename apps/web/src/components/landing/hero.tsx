"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Check, ArrowRight } from "lucide-react";

export const Hero = () => {
  return (
    <section className="relative overflow-hidden border-b border-[var(--color-border-soft)] bg-[var(--color-background)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="ambient-grid" />
        <div
          className="ambient-orb"
          style={{
            background: "rgba(49, 223, 144, 0.18)",
            height: "800px",
            width: "800px",
            top: "-25%",
            left: "-5%",
            filter: "blur(100px)",
          }}
        />
        <div
          className="ambient-orb"
          style={{
            background: "rgba(217, 198, 163, 0.12)",
            height: "700px",
            width: "700px",
            top: "5%",
            right: "-10%",
            filter: "blur(100px)",
          }}
        />
        <div
          className="ambient-orb"
          style={{
            background: "rgba(49, 223, 144, 0.10)",
            height: "500px",
            width: "500px",
            bottom: "-20%",
            left: "40%",
            filter: "blur(80px)",
          }}
        />
      </div>

      <div className="hero-grid relative z-10 mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-12 px-6 py-14 md:py-20">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="section-kicker mb-5"
          >
            DeroPay
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-balance font-display text-[clamp(3rem,7vw,5.5rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-[var(--color-text-primary)]"
          >
            The fastest way to accept{" "}
            <span className="text-[var(--color-accent)]">DERO</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-7 max-w-[520px] text-pretty text-base leading-7 text-[var(--color-text-secondary)] md:text-lg md:leading-8"
          >
            Unlock a suite of tools to accept payments, manage{" "}
            <span className="text-[var(--color-text-primary)] underline decoration-[var(--color-border-soft)] underline-offset-4">
              invoices
            </span>
            , build{" "}
            <span className="text-[var(--color-text-primary)] underline decoration-[var(--color-border-soft)] underline-offset-4">
              escrow
            </span>{" "}
            contracts, and get real-time payment{" "}
            <span className="text-[var(--color-text-primary)] underline decoration-[var(--color-border-soft)] underline-offset-4">
              insights
            </span>
            .
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 flex flex-wrap gap-4"
          >
            <Link
              href="/playground"
              className="btn-accent text-base"
              style={{ padding: "14px 28px" }}
            >
              Try it now <ArrowRight size={18} />
            </Link>
            <a
              href="https://deropay.derod.org"
              className="btn-secondary text-base"
              style={{ padding: "14px 28px" }}
            >
              Documentation
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-8 flex flex-wrap items-center gap-5 text-sm font-bold text-[var(--color-text-tertiary)]"
          >
            <div className="flex items-center gap-2">
              <Check className="text-[var(--color-accent)]" size={16} />
              <span>Zero Fees</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="text-[var(--color-accent)]" size={16} />
              <span>Self-Hosted</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="text-[var(--color-accent)]" size={16} />
              <span>MIT License</span>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="hero-image-wrapper relative flex items-center justify-end"
          style={{ minHeight: "min(70vh, 520px)" }}
        >
          <div
            className="pointer-events-none absolute"
            style={{
              top: "50%",
              right: "0",
              transform: "translateY(-50%)",
              width: "90%",
              height: "120%",
              background:
                "radial-gradient(ellipse at 70% 50%, rgba(49,223,144,0.16) 0%, rgba(49,223,144,0.06) 35%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
          <div className="relative aspect-[3/2] w-full overflow-hidden">
            <Image
              src="/images/hero_img.png"
              alt="DeroPay Dashboard"
              width={3072}
              height={2048}
              className="hero-image"
              priority
              style={{ objectFit: "cover", objectPosition: "center" }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `
                  linear-gradient(to right, var(--color-background) 0%, transparent 12%),
                  linear-gradient(to bottom, transparent 60%, var(--color-background) 100%),
                  linear-gradient(to right, transparent 85%, var(--color-background) 100%)
                `,
              }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, rgba(49,223,144,0.06) 0%, transparent 50%)",
              }}
            />
          </div>
        </motion.div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .hero-grid {
            grid-template-columns: 1fr 1.4fr !important;
            gap: 64px !important;
          }
        }
        @media (min-width: 1024px) {
          .hero-grid {
            grid-template-columns: 1fr 1.6fr !important;
          }
        }
        .hero-image {
          width: 100%;
          height: 100%;
        }
      `}</style>
    </section>
  );
};
