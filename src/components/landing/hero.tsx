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
        style={{ position: "relative", zIndex: 1, maxWidth: "1200px", margin: "0 auto", padding: "56px 24px 64px", display: "grid", gridTemplateColumns: "1fr", gap: "48px", alignItems: "center" }}
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
            <Link href="/docs" className="btn-accent" style={{ fontSize: "16px", padding: "14px 28px" }}>
              Start now <ArrowRight size={18} />
            </Link>
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

        {/* Right: Dashboard Screenshot */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          style={{ position: "relative" }}
        >
          {/* Glow behind screenshot */}
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: "120%", height: "130%",
            background: "radial-gradient(ellipse, rgba(16,185,129,0.14) 0%, rgba(147,51,234,0.10) 40%, transparent 75%)",
            filter: "blur(50px)", pointerEvents: "none",
          }} />
          <div style={{ position: "relative", overflow: "hidden", borderRadius: "16px", border: "1px solid #1e2a24", boxShadow: "0 32px 80px -20px rgba(0,0,0,0.9)" }}>
            <Image
              src="/mockups/dashboard-hero.png"
              alt="DeroPay Dashboard"
              width={960}
              height={600}
              className="w-full h-auto"
              priority
            />
          </div>
        </motion.div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .hero-grid {
            grid-template-columns: 1fr 1.15fr !important;
          }
        }
      `}</style>
    </section>
  );
};
