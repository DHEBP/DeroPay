"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { LayoutDashboard, Receipt, Lock, Settings, Wallet, Activity, ArrowRight, TrendingUp } from "lucide-react";
import { FeatureCard } from "@/components/ui/feature-card";

const dashboardFeatures = [
  { icon: <Receipt size={18} />, title: "Invoice Management", description: "Create, filter, and view invoice details with full lifecycle tracking." },
  { icon: <Lock size={18} />, title: "Escrow Operations", description: "Deploy contracts, monitor status, and perform escrow actions from the UI." },
  { icon: <Wallet size={18} />, title: "Wallet Status", description: "Live balance, connection status, and RPC health monitoring." },
  { icon: <Activity size={18} />, title: "Payment History", description: "Full transaction log with confirmation tracking and webhook delivery status." },
  { icon: <TrendingUp size={18} />, title: "Statistics", description: "Revenue totals, payment counts, success rates, and average confirmation times." },
  { icon: <Settings size={18} />, title: "Configuration", description: "Wallet RPC URLs, webhook settings, TTL defaults, and polling intervals." },
];

const MockDashboard = () => (
  <div style={{ maxWidth: "900px", margin: "0 auto", overflow: "hidden", borderRadius: "16px", border: "1px solid #1e2a24", background: "#000" }}>
    <div className="mock-dashboard-layout" style={{ display: "flex", minHeight: "420px" }}>
      {/* Sidebar */}
      <div style={{ width: "180px", borderRight: "1px solid #1e2a24", background: "#0a0f0d", padding: "16px", flexShrink: 0 }} className="mock-sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
          <LayoutDashboard size={16} color="#10b981" />
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#f0fdf4" }}>DeroPay</span>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {["Dashboard", "Invoices", "Escrow", "Settings"].map((item, i) => (
            <div key={item} style={{ borderRadius: "8px", padding: "8px 12px", fontSize: "12px", fontWeight: 500, background: i === 0 ? "rgba(16,185,129,0.1)" : "transparent", color: i === 0 ? "#10b981" : "#6b7f75" }}>
              {item}
            </div>
          ))}
        </nav>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#f0fdf4" }}>Dashboard</h3>
            <p style={{ fontSize: "12px", color: "#4a6356" }}>Welcome back &middot; Wallet connected</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
            <span style={{ fontSize: "12px", color: "#6b7f75" }}>Synced</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }} className="dashboard-stats-grid">
          {[
            { label: "Balance", value: "1,247.5 DERO" },
            { label: "Invoices", value: "342" },
            { label: "Revenue (30d)", value: "89.2 DERO" },
            { label: "Active Escrows", value: "7" },
          ].map((stat) => (
            <div key={stat.label} style={{ borderRadius: "8px", border: "1px solid #1e2a24", background: "#0a0f0d", padding: "12px" }}>
              <p style={{ fontSize: "10px", color: "#4a6356" }}>{stat.label}</p>
              <p style={{ marginTop: "4px", fontFamily: "monospace", fontSize: "14px", fontWeight: 700, color: "#10b981" }}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Recent invoices */}
        <div style={{ borderRadius: "8px", border: "1px solid #1e2a24", background: "#0a0f0d" }}>
          <div style={{ borderBottom: "1px solid #1e2a24", padding: "10px 16px" }}>
            <span style={{ fontSize: "12px", fontWeight: 500, color: "#6b7f75" }}>Recent Invoices</span>
          </div>
          {[
            { id: "INV-0342", amount: "5.0", status: "completed", color: "#34d399" },
            { id: "INV-0341", amount: "25.0", status: "confirming", color: "#10b981" },
            { id: "INV-0340", amount: "12.5", status: "pending", color: "#facc15" },
            { id: "INV-0339", amount: "100.0", status: "expired", color: "#4a6356" },
          ].map((inv) => (
            <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid rgba(30,42,36,0.5)" }}>
              <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#6b7f75" }}>{inv.id}</span>
              <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#f0fdf4" }}>{inv.amount} DERO</span>
              <span style={{ fontSize: "12px", fontWeight: 500, color: inv.color }}>{inv.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    <style>{`
      @media (max-width: 767px) {
        .mock-sidebar { display: none !important; }
        .dashboard-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
      }
    `}</style>
  </div>
);

export const DashboardPageClient = () => (
  <>
    {/* Hero */}
    <section style={{ borderBottom: "1px solid #1e2a24", background: "#000", position: "relative", overflow: "hidden" }}>
      <div className="bg-grid-pattern" style={{ position: "absolute", inset: 0, opacity: 0.15 }} />
      <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "48px 24px 56px" }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ maxWidth: "720px", margin: "0 auto", textAlign: "center" }}
        >
          <p style={{ marginBottom: "16px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>Self-Hosted</p>
          <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#f0fdf4" }}>
            Merchant <span style={{ color: "#10b981" }}>Dashboard</span>
          </h1>
          <p style={{ marginTop: "20px", fontSize: "18px", fontWeight: 500, lineHeight: 1.6, color: "#6b7f75", maxWidth: "560px", marginLeft: "auto", marginRight: "auto" }}>
            A self-hosted admin UI for managing invoices, payments, escrow operations, and wallet status. Runs on your infrastructure.
          </p>
        </motion.div>
      </div>
    </section>

    {/* Dashboard preview */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <MockDashboard />
      </div>
    </section>

    {/* Features */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(3, 1fr)" }} className="product-features-grid">
          {dashboardFeatures.map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
          ))}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section style={{ background: "#000", padding: "80px 24px" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "16px", color: "#6b7f75" }}>The dashboard is included in the dero-pay package and runs as a standalone Next.js app.</p>
        <div style={{ marginTop: "24px", display: "flex", justifyContent: "center" }}>
          <a href="https://deropay.derod.org/guides/merchant-dashboard" className="btn-accent">Setup Guide <ArrowRight size={16} /></a>
        </div>
      </div>
    </section>

    <style>{`
      @media (max-width: 767px) { .product-features-grid { grid-template-columns: 1fr !important; } }
      @media (min-width: 768px) and (max-width: 1023px) { .product-features-grid { grid-template-columns: repeat(2, 1fr) !important; } }
    `}</style>
  </>
);
