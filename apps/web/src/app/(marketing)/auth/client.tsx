"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ShieldCheck,
  Key,
  Fingerprint,
  Globe,
  Cpu,
  ArrowRight,
  Clock,
} from "lucide-react";
import { FeatureCard } from "@/components/ui/feature-card";
import { AuthFlowDemo } from "@/components/demos/auth-flow";

const features = [
  {
    icon: <Fingerprint size={20} />,
    title: "Schnorr on BN256",
    description:
      "Pure TypeScript signature verification using @noble/curves. No wallet needed server-side — just math.",
  },
  {
    icon: <Key size={20} />,
    title: "JWT Sessions",
    description:
      "Standard token-based sessions with 24-hour expiry. Compatible with any session middleware.",
  },
  {
    icon: <Globe size={20} />,
    title: "Domain-Bound Challenges",
    description:
      "SIWE-style messages tied to your domain with nonce-based replay protection. 5-minute expiry.",
  },
  {
    icon: <ShieldCheck size={20} />,
    title: "Zero Personal Data",
    description:
      "No email, no password, no name. Just a cryptographic address that reveals nothing about on-chain activity.",
  },
  {
    icon: <Cpu size={20} />,
    title: "XSWD Protocol",
    description:
      "WebSocket connection to DERO wallets (Engram, CLI). No browser extension required.",
  },
  {
    icon: <Clock size={20} />,
    title: "Redis-Ready",
    description:
      "Atomic nonce consumption with Lua scripts for distributed deployments. In-memory for dev.",
  },
];

const codeExample = `import { SignInWithDero } from "dero-auth/react";
import { createAuthHandlers } from "dero-auth/next";

// React: Drop-in button
export function LoginPage() {
  return (
    <SignInWithDero
      onSuccess={(session) => {
        console.log("Wallet:", session.address);
        console.log("JWT:", session.token);
      }}
    />
  );
}

// Next.js: API route handlers
export const { GET, POST } = createAuthHandlers({
  jwtSecret: process.env.JWT_SECRET!,
  domain: "myapp.com",
});`;

export const AuthPageClient = () => (
  <>
    {/* Hero */}
    <section style={{ borderBottom: "1px solid #1e2a24", background: "#000", position: "relative", overflow: "hidden" }}>
      {/* Gradient orbs */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-30%", left: "20%", width: "700px", height: "700px", borderRadius: "50%", background: "radial-gradient(circle, rgba(49,223,144,0.15) 0%, transparent 65%)", filter: "blur(100px)" }} />
        <div style={{ position: "absolute", top: "-10%", right: "10%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(147,51,234,0.18) 0%, transparent 60%)", filter: "blur(100px)" }} />
      </div>
      <div className="bg-grid-pattern" style={{ position: "absolute", inset: 0, opacity: 0.1 }} />
      <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "48px 24px 56px", zIndex: 1 }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ maxWidth: "720px", margin: "0 auto", textAlign: "center" }}
        >
          <p style={{ marginBottom: "16px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#31df90" }}>
            DeroAuth
          </p>
          <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#f0fdf4" }}>
            Sign in with your<br />
            <span style={{ color: "#31df90" }}>DERO wallet</span>
          </h1>
          <p style={{ marginTop: "20px", fontSize: "18px", fontWeight: 500, lineHeight: 1.6, color: "#6b7f75", maxWidth: "560px", marginLeft: "auto", marginRight: "auto" }}>
            No email. No password. Just a cryptographic proof of wallet
            ownership. Privacy-preserving authentication that never exposes your
            transaction history.
          </p>
          <div style={{ marginTop: "28px", display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
            <a href="https://deropay.derod.org/dero-auth/quick-start" className="btn-accent">
              Get Started <ArrowRight size={16} />
            </a>
            <a href="https://github.com/DHEBP/dero-auth" target="_blank" rel="noopener noreferrer" className="btn-secondary">
              View Source
            </a>
          </div>
        </motion.div>
      </div>
    </section>

    {/* Demo */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>See it in action</h2>
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#6b7f75", maxWidth: "560px", margin: "12px auto 0" }}>
            The full authentication flow — from wallet connection to JWT session — in under 10 seconds.
          </p>
        </div>
        <div style={{ maxWidth: "480px", margin: "0 auto", position: "relative" }}>
          {/* Glow behind demo */}
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "140%", height: "140%", background: "radial-gradient(ellipse, rgba(49,223,144,0.1) 0%, rgba(147,51,234,0.05) 50%, transparent 80%)", filter: "blur(50px)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <AuthFlowDemo />
          </div>
        </div>
      </div>
    </section>

    {/* Features */}
    <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p style={{ marginBottom: "12px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#31df90" }}>Features</p>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>Built for privacy</h2>
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#6b7f75", maxWidth: "560px", margin: "12px auto 0" }}>
            Unlike Ethereum auth, authenticating with DERO doesn't expose your transaction history.
          </p>
        </div>
        <div
          style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(3, 1fr)" }}
          className="product-features-grid"
        >
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
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>A few lines of code</h2>
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#6b7f75" }}>
            Drop-in React component and Next.js API handlers. Production-ready out of the box.
          </p>
        </div>
        <div style={{ overflow: "hidden", borderRadius: "16px", border: "1px solid #1e2a24", background: "#000" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #1e2a24", background: "#0a0f0d", padding: "10px 16px" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#28c840" }} />
            </div>
            <span style={{ marginLeft: "8px", fontFamily: "monospace", fontSize: "12px", color: "#4a6356" }}>auth-example.tsx</span>
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
      }
      @media (min-width: 768px) and (max-width: 1023px) {
        .product-features-grid { grid-template-columns: repeat(2, 1fr) !important; }
      }
    `}</style>
  </>
);
