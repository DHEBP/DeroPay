"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Check, ArrowRight } from "lucide-react";

export const Hero = () => {
  return (
    <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid #1e2a24", background: "#000" }}>
      {/* Gradient Orbs — more visible purple */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "-25%", left: "-5%", width: "800px", height: "800px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 65%)", filter: "blur(100px)",
        }} />
        <div style={{
          position: "absolute", top: "5%", right: "-10%", width: "700px", height: "700px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(147,51,234,0.20) 0%, transparent 60%)", filter: "blur(100px)",
        }} />
        <div style={{
          position: "absolute", bottom: "-20%", left: "40%", width: "500px", height: "500px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 70%)", filter: "blur(80px)",
        }} />
      </div>

      <div className="bg-grid-pattern" style={{ position: "absolute", inset: 0, opacity: 0.08 }} />

      <div
        className="hero-grid"
        style={{ position: "relative", zIndex: 1, maxWidth: "1400px", margin: "0 auto", padding: "56px 24px 80px", display: "grid", gridTemplateColumns: "1fr", gap: "48px", alignItems: "center" }}
      >
        {/* Left: Text */}
        <div>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ marginBottom: "20px", fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: "#10b981" }}
          >
            DeroPay
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{ fontSize: "clamp(2.8rem, 6vw, 5rem)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.0, color: "#f0fdf4" }}
          >
            The fastest way<br />to accept <span style={{ color: "#10b981" }}>DERO</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            style={{ marginTop: "24px", maxWidth: "480px", fontSize: "18px", fontWeight: 500, lineHeight: 1.65, color: "#6b7f75" }}
          >
            Unlock a suite of tools to accept payments, manage{" "}
            <span style={{ color: "#f0fdf4", textDecoration: "underline", textDecorationColor: "#1e2a24", textUnderlineOffset: "4px" }}>invoices</span>,
            build{" "}
            <span style={{ color: "#f0fdf4", textDecoration: "underline", textDecorationColor: "#1e2a24", textUnderlineOffset: "4px" }}>escrow</span>{" "}
            contracts, and get real-time payment{" "}
            <span style={{ color: "#f0fdf4", textDecoration: "underline", textDecorationColor: "#1e2a24", textUnderlineOffset: "4px" }}>insights</span>.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            style={{ marginTop: "32px", display: "flex", flexWrap: "wrap", gap: "16px" }}
          >
            <a href="https://deropay.derod.org" className="btn-accent" style={{ fontSize: "16px", padding: "14px 28px" }}>
              Start now <ArrowRight size={18} />
            </a>
            <Link href="https://github.com/DHEBP" className="btn-secondary" style={{ fontSize: "16px", padding: "14px 28px" }}>
              View Source
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            style={{ marginTop: "32px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px", fontSize: "14px", fontWeight: 700, color: "#4a6356" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Check color="#10b981" size={16} />
              <span>Zero Fees</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Check color="#10b981" size={16} />
              <span>Self-Hosted</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Check color="#10b981" size={16} />
              <span>MIT License</span>
            </div>
          </motion.div>
        </div>

        {/* Right: Hero Image — large, seamlessly integrated */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="hero-image-wrapper"
          style={{
            position: "relative",
            minHeight: "min(70vh, 520px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          {/* Ambient glow behind image */}
          <div style={{
            position: "absolute", top: "50%", right: "0", transform: "translateY(-50%)",
            width: "90%", height: "120%",
            background: "radial-gradient(ellipse at 70% 50%, rgba(16,185,129,0.15) 0%, rgba(147,51,234,0.08) 35%, transparent 70%)",
            filter: "blur(60px)", pointerEvents: "none",
          }} />
          {/* Image container — no border, edge fades blend into page */}
          <div
            className="hero-image-container"
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "3/2",
              overflow: "hidden",
            }}
          >
            <Image
              src="/images/hero_img.png"
              alt="DeroPay Dashboard"
              width={3072}
              height={2048}
              className="hero-image"
              priority
              style={{ objectFit: "cover", objectPosition: "center" }}
            />
            {/* Gradient overlays — fade edges into page background for seamless blend */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `
                  linear-gradient(to right, #000 0%, transparent 18%),
                  linear-gradient(to bottom, transparent 60%, #000 100%),
                  linear-gradient(to right, transparent 85%, #000 100%)
                `,
                pointerEvents: "none",
              }}
            />
            {/* Subtle emerald tint overlay for brand cohesion */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, transparent 50%)",
                pointerEvents: "none",
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
