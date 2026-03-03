"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  CreditCard,
  Receipt,
  BarChart3,
  Webhook,
  Database,
  QrCode,
  ArrowRight,
  ShoppingCart,
  Code2,
  Link2,
  Store,
} from "lucide-react";
import { FeatureCard } from "@/components/ui/feature-card";
import { PaymentFlowDemo } from "@/components/demos/payment-flow";

const features = [
  { icon: <Receipt size={20} />, title: "Invoice Engine", description: "Create invoices with unique integrated addresses. Automatic TTL expiry, partial payment handling, and full state machine lifecycle." },
  { icon: <QrCode size={20} />, title: "QR Code Payments", description: "Customers scan a QR code with their wallet. Integrated addresses embed payment IDs — no manual input needed." },
  { icon: <BarChart3 size={20} />, title: "Real-Time Monitoring", description: "Polling-based payment detection with configurable confirmation depth. DAG-aware with STABLE_LIMIT = 8 blocks." },
  { icon: <Webhook size={20} />, title: "HMAC Webhooks", description: "Stripe-style signed HTTP POST notifications on every state change. Retry with exponential backoff." },
  { icon: <Database size={20} />, title: "Pluggable Storage", description: "In-memory for development, SQLite for production, or bring your own. Simple InvoiceStore interface." },
  { icon: <CreditCard size={20} />, title: "Merchant Dashboard", description: "Self-hosted admin UI for invoice management, payment history, wallet status, and escrow operations." },
];

const codeExample = `import { InvoiceEngine } from "dero-pay/server";
import { deroToAtomic } from "dero-pay";

const engine = new InvoiceEngine({
  walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
  daemonRpcUrl: "http://127.0.0.1:10102/json_rpc",
  store: new SqliteInvoiceStore("./payments.db"),
  webhook: {
    url: "https://mystore.com/api/webhook",
    secret: process.env.WEBHOOK_SECRET!,
  },
});

const invoice = await engine.createInvoice({
  name: "Premium Plan",
  amount: deroToAtomic("25.0"),
  ttl: 900,
});

engine.start();`;

export const PayPageClient = () => (
  <>
    {/* Hero */}
    <section style={{ borderBottom: "1px solid #1e2a24", background: "#000", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-30%", right: "20%", width: "700px", height: "700px", borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 65%)", filter: "blur(100px)" }} />
        <div style={{ position: "absolute", top: "-10%", left: "10%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(147,51,234,0.18) 0%, transparent 60%)", filter: "blur(100px)" }} />
      </div>
      <div className="bg-grid-pattern" style={{ position: "absolute", inset: 0, opacity: 0.1 }} />
      <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "48px 24px 56px", zIndex: 1 }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ maxWidth: "720px", margin: "0 auto", textAlign: "center" }}
        >
          <p style={{ marginBottom: "16px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>DeroPay</p>
          <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#f0fdf4" }}>
            Accept DERO payments<br /><span style={{ color: "#10b981" }}>in minutes</span>
          </h1>
          <p style={{ marginTop: "20px", fontSize: "18px", fontWeight: 500, lineHeight: 1.6, color: "#6b7f75", maxWidth: "560px", marginLeft: "auto", marginRight: "auto" }}>
            Invoices, real-time payment monitoring, HMAC-signed webhooks, and a self-hosted merchant dashboard. Everything runs on your infrastructure.
          </p>
          <div style={{ marginTop: "28px", display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
            <a href="https://deropay.derod.org/dero-pay/quick-start" className="btn-accent">Get Started <ArrowRight size={16} /></a>
            <a href="https://github.com/DHEBP/dero-pay" target="_blank" rel="noopener noreferrer" className="btn-secondary">View Source</a>
          </div>
        </motion.div>
      </div>
    </section>

    {/* Demo */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>Invoice to confirmation</h2>
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#6b7f75", maxWidth: "560px", margin: "12px auto 0" }}>
            Watch the complete payment lifecycle — invoice creation, QR code, payment detection, and DAG confirmations.
          </p>
        </div>
        <div style={{ maxWidth: "480px", margin: "0 auto", position: "relative" }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "140%", height: "140%", background: "radial-gradient(ellipse, rgba(16,185,129,0.1) 0%, rgba(147,51,234,0.05) 50%, transparent 80%)", filter: "blur(50px)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <PaymentFlowDemo />
          </div>
        </div>
      </div>
    </section>

    {/* Features */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p style={{ marginBottom: "12px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>Features</p>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>Everything a merchant needs</h2>
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#6b7f75", maxWidth: "560px", margin: "12px auto 0" }}>
            From invoice creation to webhook delivery. No third-party services, no API keys, no external dependencies.
          </p>
        </div>
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(3, 1fr)" }} className="product-features-grid">
          {features.map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
          ))}
        </div>
      </div>
    </section>

    {/* Distribution Channels */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p style={{ marginBottom: "12px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>Accept DERO Everywhere</p>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>Four ways to get paid</h2>
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#6b7f75", maxWidth: "560px", margin: "12px auto 0" }}>
            One gateway server, multiple distribution channels. Pick the one that fits your business — or use them all.
          </p>
        </div>
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(2, 1fr)" }} className="channels-grid">
          {[
            {
              icon: <Link2 size={20} />,
              title: "Payment Links",
              description: "No website needed. Create an invoice, get a link, share it anywhere — email, social media, QR poster, text message. The hosted checkout page handles the rest.",
              href: "https://deropay.derod.org/guides/payment-links",
            },
            {
              icon: <Code2 size={20} />,
              title: "Embeddable Widget",
              description: "Drop a single <script> tag on any website. A 13KB JavaScript file renders a \"Pay with DERO\" button with a full payment modal. Zero dependencies.",
              href: "https://deropay.derod.org/guides/embeddable-widget",
            },
            {
              icon: <ShoppingCart size={20} />,
              title: "WooCommerce Plugin",
              description: "Accept DERO in the world's largest ecommerce platform. Thin PHP adapter connects your WooCommerce checkout to the gateway's REST API.",
              href: "https://deropay.derod.org/guides/woocommerce",
            },
            {
              icon: <Store size={20} />,
              title: "Medusa.js Plugin",
              description: "TypeScript-native payment provider for Medusa v2. Extends AbstractPaymentProvider with automatic fiat-to-DERO conversion and webhook handling.",
              href: "https://deropay.derod.org/guides/medusa-plugin",
            },
          ].map((channel) => (
            <a
              key={channel.title}
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                padding: "24px",
                background: "#0a0f0d",
                border: "1px solid #1e2a24",
                borderRadius: "12px",
                textDecoration: "none",
                transition: "border-color 0.2s, transform 0.2s",
              }}
              className="channel-card"
            >
              <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(16,185,129,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981", marginBottom: "16px" }}>
                {channel.icon}
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f0fdf4", marginBottom: "8px" }}>{channel.title}</h3>
              <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#6b7f75" }}>{channel.description}</p>
            </a>
          ))}
        </div>
      </div>
    </section>

    {/* Code example */}
    <section style={{ background: "#000", padding: "80px 24px" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>Five minutes to first payment</h2>
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#6b7f75" }}>Configure your wallet RPC, create an invoice, and start monitoring.</p>
        </div>
        <div style={{ overflow: "hidden", borderRadius: "16px", border: "1px solid #1e2a24", background: "#000" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #1e2a24", background: "#0a0f0d", padding: "10px 16px" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#28c840" }} />
            </div>
            <span style={{ marginLeft: "8px", fontFamily: "monospace", fontSize: "12px", color: "#4a6356" }}>server.ts</span>
          </div>
          <pre style={{ overflow: "auto", padding: "20px", fontFamily: "monospace", fontSize: "13px", lineHeight: 1.7, color: "#6b7f75" }}>
            <code>{codeExample}</code>
          </pre>
        </div>
      </div>
    </section>

    <style>{`
      @media (max-width: 767px) {
        .product-features-grid { grid-template-columns: 1fr !important; }
        .channels-grid { grid-template-columns: 1fr !important; }
      }
      @media (min-width: 768px) and (max-width: 1023px) {
        .product-features-grid { grid-template-columns: repeat(2, 1fr) !important; }
      }
      .channel-card:hover {
        border-color: #4a6356 !important;
        transform: translateY(-2px);
      }
    `}</style>
  </>
);
