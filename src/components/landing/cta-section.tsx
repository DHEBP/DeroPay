"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const CTASection = () => (
  <section style={{ position: "relative", overflow: "hidden", borderTop: "1px solid #1e2a24", background: "#000" }}>
    {/* Gradient backdrop */}
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* Large emerald glow — center bottom */}
      <div style={{
        position: "absolute",
        bottom: "-30%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "800px",
        height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(16,185,129,0.20) 0%, transparent 60%)",
        filter: "blur(100px)",
      }} />
      {/* Purple accent — top right */}
      <div style={{
        position: "absolute",
        top: "-20%",
        right: "10%",
        width: "400px",
        height: "400px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(147,51,234,0.20) 0%, transparent 65%)",
        filter: "blur(80px)",
      }} />
    </div>

    <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "128px 24px", textAlign: "center", zIndex: 1 }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        style={{ maxWidth: "800px", margin: "0 auto" }}
      >
        <h2 style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.05, color: "#f0fdf4" }}>
          READY TO <span style={{ color: "#10b981" }}>BUILD?</span>
        </h2>
        
        <p style={{ marginTop: "32px", fontSize: "20px", fontWeight: 500, lineHeight: 1.6, color: "#6b7f75", maxWidth: "560px", marginLeft: "auto", marginRight: "auto" }}>
          Join the developers building the future of private finance.
          Start accepting DERO in minutes.
        </p>

        <div style={{ marginTop: "48px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "24px" }}>
          <Link href="/docs" className="btn-accent" style={{ fontSize: "18px", padding: "16px 32px" }}>
            Get Started Now
          </Link>
          <Link href="/pay" className="btn-secondary" style={{ fontSize: "18px", padding: "16px 32px" }}>
            View Documentation
          </Link>
        </div>
      </motion.div>
    </div>
  </section>
);
