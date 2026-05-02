"use client";

import { motion } from "framer-motion";
import {
  Shield,
  Server,
  Code2,
  Eye,
  ArrowRight,
  Github,
} from "lucide-react";

const principles = [
  {
    icon: <Shield size={22} />,
    title: "No Custody, Ever",
    description:
      "DeroPay never touches your funds. Payments flow directly from customer to merchant via the DERO blockchain. No intermediary, no temporary holding, no counterparty risk.",
  },
  {
    icon: <Server size={22} />,
    title: "Self-Hosted by Design",
    description:
      "You run the gateway on your infrastructure, connected to your wallet. Your keys, your data, your rules. This is the BTCPay Server model applied to DERO.",
  },
  {
    icon: <Code2 size={22} />,
    title: "Open Source (MIT License)",
    description:
      "Every line of code is publicly available for review, audit, and contribution. Trust in payment software depends on public verifiability, not promises.",
  },
  {
    icon: <Eye size={22} />,
    title: "Privacy as Default",
    description:
      "Built for DERO — a blockchain where every transaction is encrypted by default. No transparent chain, no on-chain surveillance. Privacy isn't a feature, it's the foundation.",
  },
];

export const AboutPageClient = () => (
  <>
    {/* Hero */}
    <section style={{ borderBottom: "1px solid #1e2a24", background: "#000", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-30%", right: "20%", width: "700px", height: "700px", borderRadius: "50%", background: "radial-gradient(circle, rgba(49,223,144,0.12) 0%, transparent 65%)", filter: "blur(100px)" }} />
        <div style={{ position: "absolute", top: "-10%", left: "10%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(147,51,234,0.15) 0%, transparent 60%)", filter: "blur(100px)" }} />
      </div>
      <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "48px 24px 56px", zIndex: 1 }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ maxWidth: "720px", margin: "0 auto", textAlign: "center" }}
        >
          <p style={{ marginBottom: "16px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#31df90" }}>About</p>
          <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#f0fdf4" }}>
            Payment infrastructure<br />
            <span style={{ color: "#31df90" }}>that respects privacy</span>
          </h1>
          <p style={{ marginTop: "20px", fontSize: "18px", fontWeight: 500, lineHeight: 1.6, color: "#6b7f75", maxWidth: "560px", marginLeft: "auto", marginRight: "auto" }}>
            DeroPay is free, open-source, self-hosted payment infrastructure for DERO.
            Like BTCPay Server, but for the only blockchain with default encryption.
          </p>
        </motion.div>
      </div>
    </section>

    {/* What is DeroPay */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "28px", fontWeight: 900, color: "#f0fdf4", marginBottom: "24px" }}>What is DeroPay?</h2>
        <div style={{ fontSize: "16px", lineHeight: 1.8, color: "#6b7f75" }}>
          <p style={{ marginBottom: "16px" }}>
            DeroPay is a complete payment stack for accepting DERO — invoices, real-time payment monitoring, HMAC-signed webhooks, smart contract escrow, and ecommerce plugins. It ships as an SDK, a standalone gateway server, and a set of distribution channels (WooCommerce, Medusa.js, embeddable widget, payment links).
          </p>
          <p style={{ marginBottom: "16px" }}>
            The architecture follows BTCPay Server: the gateway is open-source software that merchants deploy on their own infrastructure, connected to their own DERO wallet. No third-party custody, no intermediary, no dependency on any hosted service.
          </p>
          <p>
            DeroPay also includes DeroAuth — wallet-based authentication for DERO. Users prove they own a DERO address via a Schnorr signature. No email, no password, no personal data. Like Sign-In With Ethereum, but for a privacy blockchain.
          </p>
        </div>
      </div>
    </section>

    {/* Principles */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p style={{ marginBottom: "12px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#31df90" }}>Principles</p>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>How we build</h2>
        </div>
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(2, 1fr)" }} className="about-principles-grid">
          {principles.map((p) => (
            <div
              key={p.title}
              style={{ padding: "24px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "12px" }}
            >
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#0a1f17", display: "flex", alignItems: "center", justifyContent: "center", color: "#31df90", marginBottom: "14px" }}>
                {p.icon}
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f0fdf4", marginBottom: "8px" }}>{p.title}</h3>
              <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#6b7f75" }}>{p.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Who Built This */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "28px", fontWeight: 900, color: "#f0fdf4", marginBottom: "24px" }}>Who builds DeroPay?</h2>
        <div style={{ fontSize: "16px", lineHeight: 1.8, color: "#6b7f75" }}>
          <p style={{ marginBottom: "16px" }}>
            DeroPay is built by <strong style={{ color: "#f0fdf4" }}>DHEBP</strong> — an independent software organization focused on privacy infrastructure for the DERO ecosystem.
          </p>
          <p style={{ marginBottom: "16px" }}>
            DHEBP publishes software. DHEBP does not operate payment processing services, does not transmit or custody funds, and does not act as a money transmitter or financial institution.
          </p>
          <p>
            DHEBP is not affiliated with, endorsed by, or representative of the DERO Project or DERO core developers. &ldquo;DERO&rdquo; is used to describe compatibility with the DERO blockchain protocol.
          </p>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section style={{ background: "#000", padding: "80px 24px" }}>
      <div style={{ maxWidth: "560px", margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "28px", fontWeight: 900, color: "#f0fdf4", marginBottom: "16px" }}>Start accepting DERO</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.6, color: "#6b7f75", marginBottom: "28px" }}>
          Deploy the gateway server, install a plugin, or drop a widget on your site. Everything is open source and free.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
          <a href="https://deropay.derod.org/guides/gateway-server" className="btn-accent">
            Get Started <ArrowRight size={16} />
          </a>
          <a href="https://github.com/DHEBP" target="_blank" rel="noopener noreferrer" className="btn-secondary">
            <Github size={16} /> View Source
          </a>
        </div>
      </div>
    </section>

    <style>{`
      @media (max-width: 767px) {
        .about-principles-grid { grid-template-columns: 1fr !important; }
      }
    `}</style>
  </>
);
