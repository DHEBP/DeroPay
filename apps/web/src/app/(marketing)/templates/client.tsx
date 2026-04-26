"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Github,
  ShoppingBag,
  Store,
  Package,
  Users,
  Shield,
  Zap,
} from "lucide-react";

type Template = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  features: string[];
  stack: string[];
  github: string;
  icon: React.ReactNode;
};

const templates: Template[] = [
  {
    id: "hologram-store",
    title: "Hologram Store",
    tagline: "MEDUSA V2 + VITE/REACT",
    description:
      "A streetwear storefront with a Vite + React frontend and Medusa v2 backend. Pre-configured with the medusa-payment-deropay plugin for accepting DERO payments alongside Stripe.",
    features: [
      "Product catalog with variants and images",
      "Cart and checkout flow",
      "DeroPay + Stripe payment providers",
      "Admin dashboard via Medusa",
      "Seed script with sample products",
    ],
    stack: ["Medusa v2", "React", "Vite", "TypeScript", "medusa-payment-deropay"],
    github: "https://github.com/DHEBP/DeroPay/tree/main/templates/hologram-store",
    icon: <ShoppingBag size={24} />,
  },
  {
    id: "marketplace",
    title: "DERO Marketplace",
    tagline: "NEXT.JS + SQLITE",
    description:
      "A multi-vendor marketplace with buyer/seller flows, escrow checkout, and dispute resolution. Server-backed listings, invoices, and webhook processing with SQLite persistence.",
    features: [
      "Multi-vendor storefronts",
      "Buyer cart and checkout",
      "Seller listing management",
      "Invoice, router, and escrow rails",
      "Webhook simulation for development",
      "Dispute and resolution flows",
    ],
    stack: ["Next.js 16", "React 19", "SQLite", "TypeScript", "Tailwind CSS"],
    github: "https://github.com/DHEBP/DeroPay/tree/main/templates/marketplace",
    icon: <Store size={24} />,
  },
];

const benefits = [
  {
    icon: <Zap size={20} />,
    title: "Production-Ready",
    description: "Not toy examples. Real application architecture with auth, state management, and error handling.",
  },
  {
    icon: <Package size={20} />,
    title: "Self-Contained",
    description: "Each template is a complete project. Clone, install dependencies, configure environment, run.",
  },
  {
    icon: <Shield size={20} />,
    title: "Best Practices",
    description: "TypeScript, proper separation of concerns, environment-based configuration, and test coverage.",
  },
  {
    icon: <Users size={20} />,
    title: "Community Maintained",
    description: "Open source under MIT license. Contributions welcome. Built by developers, for developers.",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export const TemplatesPageClient = () => (
  <>
    {/* Hero */}
    <section style={{ borderBottom: "1px solid #1e2a24", background: "#000", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-30%", right: "20%", width: "700px", height: "700px", borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 65%)", filter: "blur(100px)" }} />
        <div style={{ position: "absolute", top: "-10%", left: "10%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(147,51,234,0.15) 0%, transparent 60%)", filter: "blur(100px)" }} />
      </div>
      <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "48px 24px 56px", zIndex: 1 }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ maxWidth: "720px", margin: "0 auto", textAlign: "center" }}
        >
          <p style={{ marginBottom: "16px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>
            Starter Templates
          </p>
          <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#f0fdf4" }}>
            Clone, configure,<br />
            <span style={{ color: "#10b981" }}>start selling</span>
          </h1>
          <p style={{ marginTop: "20px", fontSize: "18px", fontWeight: 500, lineHeight: 1.6, color: "#6b7f75", maxWidth: "560px", marginLeft: "auto", marginRight: "auto" }}>
            Production-ready starter templates for building DERO commerce applications. 
            Skip the boilerplate and focus on your product.
          </p>
        </motion.div>
      </div>
    </section>

    {/* Templates Grid */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          style={{ display: "grid", gap: "32px", gridTemplateColumns: "repeat(2, 1fr)" }}
          className="templates-grid"
        >
          {templates.map((template) => (
            <motion.div key={template.id} variants={item}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  padding: "32px",
                  background: "#0a0f0d",
                  border: "1px solid #1e2a24",
                  borderRadius: "16px",
                  transition: "border-color 0.2s",
                }}
                className="template-card"
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "20px" }}>
                  <div style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: "#0a1f17",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#10b981",
                    flexShrink: 0,
                  }}>
                    {template.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#10b981", marginBottom: "4px" }}>
                      {template.tagline}
                    </p>
                    <h3 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4" }}>
                      {template.title}
                    </h3>
                  </div>
                </div>

                {/* Description */}
                <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#6b7f75", marginBottom: "24px" }}>
                  {template.description}
                </p>

                {/* Features */}
                <div style={{ marginBottom: "24px" }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a6356", marginBottom: "12px" }}>
                    What&apos;s included
                  </p>
                  <ul style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {template.features.map((feature) => (
                      <li key={feature} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "14px", color: "#9ca3af" }}>
                        <span style={{ color: "#10b981", marginTop: "2px" }}>•</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Stack */}
                <div style={{ marginBottom: "28px" }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a6356", marginBottom: "12px" }}>
                    Tech Stack
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {template.stack.map((tech) => (
                      <span
                        key={tech}
                        style={{
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#9ca3af",
                          background: "#111916",
                          borderRadius: "6px",
                          border: "1px solid #1e2a24",
                        }}
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ marginTop: "auto", display: "flex", gap: "12px" }}>
                  <a
                    href={template.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-accent"
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    <Github size={16} /> Clone Template
                  </a>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>

    {/* Benefits */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p style={{ marginBottom: "12px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>
            Why Templates
          </p>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>
            Skip months of boilerplate
          </h2>
        </div>
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(4, 1fr)" }} className="benefits-grid">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              style={{
                padding: "24px",
                background: "#0a0f0d",
                border: "1px solid #1e2a24",
                borderRadius: "12px",
              }}
            >
              <div style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "#0a1f17",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#10b981",
                marginBottom: "14px",
              }}>
                {benefit.icon}
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f0fdf4", marginBottom: "8px" }}>
                {benefit.title}
              </h3>
              <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#6b7f75" }}>
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* How to Use */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "28px", fontWeight: 900, color: "#f0fdf4", marginBottom: "32px" }}>
          How to use a template
        </h2>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ padding: "24px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#10b981", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700 }}>1</span>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f0fdf4" }}>Clone the template</h3>
            </div>
            <pre style={{ padding: "16px", background: "#111916", borderRadius: "8px", fontSize: "14px", color: "#9ca3af", overflow: "auto" }}>
              <code>npx degit DHEBP/deropay/templates/hologram-store my-store</code>
            </pre>
          </div>

          <div style={{ padding: "24px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#10b981", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700 }}>2</span>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f0fdf4" }}>Configure environment</h3>
            </div>
            <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#6b7f75" }}>
              Copy <code style={{ padding: "2px 6px", background: "#111916", borderRadius: "4px", fontSize: "13px" }}>.env.example</code> to <code style={{ padding: "2px 6px", background: "#111916", borderRadius: "4px", fontSize: "13px" }}>.env</code> and 
              set your DeroPay gateway URL, API key, and webhook secret. Point to your self-hosted gateway or use the demo server for testing.
            </p>
          </div>

          <div style={{ padding: "24px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#10b981", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700 }}>3</span>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f0fdf4" }}>Start building</h3>
            </div>
            <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#6b7f75" }}>
              Install dependencies and run the development server. Each template includes seed data, 
              mock payment modes, and developer tools to help you iterate quickly.
            </p>
          </div>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section style={{ background: "#000", padding: "80px 24px" }}>
      <div style={{ maxWidth: "560px", margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "28px", fontWeight: 900, color: "#f0fdf4", marginBottom: "16px" }}>
          Build something new?
        </h2>
        <p style={{ fontSize: "16px", lineHeight: 1.6, color: "#6b7f75", marginBottom: "28px" }}>
          Want to contribute a template? We welcome submissions from the community. 
          Check the contributing guide to get started.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
          <a href="https://github.com/DHEBP/deropay" target="_blank" rel="noopener noreferrer" className="btn-accent">
            View on GitHub <ArrowRight size={16} />
          </a>
          <a href="https://deropay.derod.org" target="_blank" rel="noopener noreferrer" className="btn-secondary">
            Read the Docs
          </a>
        </div>
      </div>
    </section>

    <style>{`
      .template-card:hover {
        border-color: #4a6356 !important;
      }
      @media (max-width: 900px) {
        .templates-grid { grid-template-columns: 1fr !important; }
      }
      @media (max-width: 767px) {
        .benefits-grid { grid-template-columns: 1fr !important; }
      }
      @media (min-width: 768px) and (max-width: 1023px) {
        .benefits-grid { grid-template-columns: repeat(2, 1fr) !important; }
      }
    `}</style>
  </>
);
