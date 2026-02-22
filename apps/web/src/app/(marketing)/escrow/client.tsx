"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Lock, Scale, Timer, Coins, ShieldAlert, FileCode2, ArrowRight } from "lucide-react";
import { FeatureCard } from "@/components/ui/feature-card";
import { EscrowFlowDemo } from "@/components/demos/escrow-flow";

const features = [
  { icon: <Lock size={20} />, title: "On-Chain Security", description: "Funds are locked in a DERO smart contract. No one can move them without meeting the contract conditions." },
  { icon: <Scale size={20} />, title: "Arbitration", description: "Designate a neutral arbitrator who can resolve disputes. Buyer gets a refund or seller gets paid." },
  { icon: <Coins size={20} />, title: "Platform Fees", description: "Automatic fee deduction on successful transactions. Configurable percentage collected by the contract owner." },
  { icon: <Timer size={20} />, title: "Block Expiration", description: "Escrows expire after a configurable number of blocks. Seller can claim funds after the expiration window." },
  { icon: <ShieldAlert size={20} />, title: "Dispute Resolution", description: "Buyers can dispute before confirming delivery. Disputes lock funds until the arbitrator resolves them." },
  { icon: <FileCode2 size={20} />, title: "DVM-BASIC Contracts", description: "Open source smart contracts in DERO's native language. Auditable, immutable, transparent." },
];

const statusCodes = [
  { code: 0, label: "awaiting_deposit", color: "#6b7f75" },
  { code: 1, label: "funded", color: "#10b981" },
  { code: 2, label: "released", color: "#34d399" },
  { code: 3, label: "refunded", color: "#facc15" },
  { code: 4, label: "expired_claimed", color: "#f97316" },
  { code: 5, label: "disputed", color: "#ef4444" },
  { code: 6, label: "arbitrated", color: "#60a5fa" },
];

const codeExample = `import { EscrowManager } from "dero-pay/escrow";
import { deroToAtomic } from "dero-pay";

const manager = new EscrowManager({
  walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
  daemonRpcUrl: "http://127.0.0.1:10102/json_rpc",
});

const escrow = await manager.create({
  seller: "dero1qy...seller-address",
  arbitrator: "dero1qy...arbitrator-address",
  amount: deroToAtomic("100.0"),
  feeBasisPoints: 200,
  expiryBlocks: 720,
});

console.log("SCID:", escrow.scid);
manager.on("funded", (e) => console.log("Deposited:", e.amount));
manager.on("released", (e) => console.log("Released to seller"));`;

export const EscrowPageClient = () => (
  <>
    {/* Hero */}
    <section style={{ borderBottom: "1px solid #1e2a24", background: "#000", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-30%", left: "30%", width: "700px", height: "700px", borderRadius: "50%", background: "radial-gradient(circle, rgba(147,51,234,0.20) 0%, transparent 60%)", filter: "blur(100px)" }} />
        <div style={{ position: "absolute", top: "-10%", right: "20%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 65%)", filter: "blur(100px)" }} />
      </div>
      <div className="bg-grid-pattern" style={{ position: "absolute", inset: 0, opacity: 0.1 }} />
      <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "48px 24px 56px", zIndex: 1 }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ maxWidth: "720px", margin: "0 auto", textAlign: "center" }}
        >
          <p style={{ marginBottom: "16px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>Escrow</p>
          <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#f0fdf4" }}>
            Trustless payments with<br /><span style={{ color: "#10b981" }}>smart contract escrow</span>
          </h1>
          <p style={{ marginTop: "20px", fontSize: "18px", fontWeight: 500, lineHeight: 1.6, color: "#6b7f75", maxWidth: "560px", marginLeft: "auto", marginRight: "auto" }}>
            Deploy on-chain escrow contracts with arbitration, platform fees, and dispute resolution. Buyer protection backed by DERO's blockchain — not trust.
          </p>
          <div style={{ marginTop: "28px", display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
            <a href="https://deropay.derod.org/escrow/overview" className="btn-accent">Get Started <ArrowRight size={16} /></a>
            <a href="https://github.com/DHEBP/dero-pay" target="_blank" rel="noopener noreferrer" className="btn-secondary">View Contracts</a>
          </div>
        </motion.div>
      </div>
    </section>

    {/* Demo */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>The escrow lifecycle</h2>
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#6b7f75", maxWidth: "560px", margin: "12px auto 0" }}>
            Deploy, deposit, and resolve — watch the full escrow flow from contract creation to fund release.
          </p>
        </div>
        <div style={{ maxWidth: "480px", margin: "0 auto", position: "relative" }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "140%", height: "140%", background: "radial-gradient(ellipse, rgba(147,51,234,0.1) 0%, rgba(16,185,129,0.05) 50%, transparent 80%)", filter: "blur(50px)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <EscrowFlowDemo />
          </div>
        </div>
      </div>
    </section>

    {/* Status codes */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>Seven states, every path covered</h2>
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#6b7f75", maxWidth: "560px", margin: "12px auto 0" }}>
            The escrow contract tracks every possible resolution.
          </p>
        </div>
        <div style={{ maxWidth: "560px", margin: "0 auto", overflow: "hidden", borderRadius: "16px", border: "1px solid #1e2a24", background: "#000" }}>
          {statusCodes.map((status) => (
            <div key={status.code} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "12px 20px", borderBottom: "1px solid #1e2a24" }}>
              <span style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: 700, color: "#4a6356" }}>{status.code}</span>
              <span style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: 500, color: status.color }}>{status.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Features */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(3, 1fr)" }} className="product-features-grid">
          {features.map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
          ))}
        </div>
      </div>
    </section>

    {/* Code example */}
    <section style={{ background: "#000", padding: "80px 24px" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>Deploy an escrow in code</h2>
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#6b7f75" }}>The EscrowManager handles contract deployment, lifecycle polling, and event handling.</p>
        </div>
        <div style={{ overflow: "hidden", borderRadius: "16px", border: "1px solid #1e2a24", background: "#000" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #1e2a24", background: "#0a0f0d", padding: "10px 16px" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#28c840" }} />
            </div>
            <span style={{ marginLeft: "8px", fontFamily: "monospace", fontSize: "12px", color: "#4a6356" }}>escrow-example.ts</span>
          </div>
          <pre style={{ overflow: "auto", padding: "20px", fontFamily: "monospace", fontSize: "13px", lineHeight: 1.7, color: "#6b7f75" }}>
            <code>{codeExample}</code>
          </pre>
        </div>
      </div>
    </section>

    <style>{`
      @media (max-width: 767px) { .product-features-grid { grid-template-columns: 1fr !important; } }
      @media (min-width: 768px) and (max-width: 1023px) { .product-features-grid { grid-template-columns: repeat(2, 1fr) !important; } }
    `}</style>
  </>
);
