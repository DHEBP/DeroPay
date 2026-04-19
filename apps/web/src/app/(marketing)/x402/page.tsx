import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, ShieldCheck, Zap, Repeat, Gauge } from "lucide-react";
import { X402FlowDemo } from "@/components/demos/x402-flow";

export const metadata: Metadata = {
  title: "x402 for Agentic Commerce",
  description:
    "x402 in DeroPay brings internet-native payment negotiation to DERO: request, 402 challenge, payment, proof retry, response.",
};

const pillars = [
  {
    icon: <Bot size={20} />,
    title: "Agent-Ready by Design",
    description:
      "Machine-readable 402 challenges let clients, bots, and agents negotiate payment without human checkout flows.",
  },
  {
    icon: <Repeat size={20} />,
    title: "Deterministic Request Loop",
    description:
      "Request -> 402 challenge -> pay -> retry with proof -> response. Same HTTP mental model, now with value exchange.",
  },
  {
    icon: <ShieldCheck size={20} />,
    title: "Production Security",
    description:
      "Signed receipts, replay protection, key rotation, and auditable events make payment-gated endpoints safe to operate.",
  },
  {
    icon: <Gauge size={20} />,
    title: "Operational Controls",
    description:
      "Enforce quotas and dynamic pricing policies per route without bolting on a separate billing system.",
  },
];

const snippet = `import { createX402RouteGuard } from "dero-pay/next";

export const x402Guard = createX402RouteGuard({
  getEngine: paymentHandlers.getEngine,
  receiptSecret: process.env.DEROPAY_RECEIPT_SECRET!,
  policy: {
    name: "Agent Inference",
    amountAtomic: deroToAtomic("0.10"),
    resource: "/api/protected/inference",
  },
});`;

export default function X402Page() {
  return (
    <>
      <section style={{ borderBottom: "1px solid #1e2a24", background: "#000", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: "-30%", right: "20%", width: "700px", height: "700px", borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 65%)", filter: "blur(100px)" }} />
          <div style={{ position: "absolute", top: "-10%", left: "10%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(147,51,234,0.15) 0%, transparent 60%)", filter: "blur(100px)" }} />
        </div>
        <div className="bg-grid-pattern" style={{ position: "absolute", inset: 0, opacity: 0.1 }} />
        <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "56px 24px 72px", zIndex: 1 }}>
          <div style={{ maxWidth: "760px", margin: "0 auto", textAlign: "center" }}>
            <p style={{ marginBottom: "16px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>
              x402 + DERO
            </p>
            <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#f0fdf4" }}>
              The internet-native payment rail<br />
              <span style={{ color: "#10b981" }}>for agentic commerce</span>
            </h1>
            <p style={{ marginTop: "20px", fontSize: "18px", fontWeight: 500, lineHeight: 1.6, color: "#6b7f75", maxWidth: "620px", marginLeft: "auto", marginRight: "auto" }}>
              DeroPay implements x402 as a DERO-native protocol loop so APIs can monetize per request with machine-readable payment challenges and proof-based retries.
            </p>
            <div style={{ marginTop: "28px", display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
              <a href="https://deropay.derod.org/dero-pay/nextjs" className="btn-accent">
                Integrate x402 <ArrowRight size={16} />
              </a>
              <a href="https://www.npmjs.com/package/dero-pay" target="_blank" rel="noopener noreferrer" className="btn-secondary">
                npm package
              </a>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "#000", padding: "72px 24px", borderBottom: "1px solid #1e2a24" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <p style={{ marginBottom: "12px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>
              Request Loop
            </p>
            <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>
              See it negotiate payment
            </h2>
            <p style={{ marginTop: "12px", fontSize: "15px", color: "#6b7f75", maxWidth: "520px", marginLeft: "auto", marginRight: "auto" }}>
              A complete x402 exchange — request, challenge, settlement, proof, and delivery — as it happens on the wire.
            </p>
          </div>
          <X402FlowDemo />
        </div>
      </section>

      <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <p style={{ marginBottom: "12px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>
              Why x402
            </p>
            <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>
              Protocol-level pricing for the API economy
            </h2>
          </div>
          <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(2, 1fr)" }} className="x402-pillars-grid">
            {pillars.map((pillar) => (
              <div key={pillar.title} style={{ padding: "24px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "12px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(16,185,129,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981", marginBottom: "14px" }}>
                  {pillar.icon}
                </div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#f0fdf4", marginBottom: "8px" }}>{pillar.title}</h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#6b7f75" }}>{pillar.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "#000", padding: "80px 24px" }}>
        <div style={{ maxWidth: "840px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "36px" }}>
            <p style={{ marginBottom: "12px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>
              Developer Flow
            </p>
            <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}>
              Add x402 in a few lines
            </h2>
          </div>

          <div style={{ border: "1px solid #1e2a24", borderRadius: "16px", overflow: "hidden", background: "#000" }}>
            <div style={{ borderBottom: "1px solid #1e2a24", background: "#0a0f0d", padding: "10px 16px", fontSize: "12px", color: "#4a6356", fontFamily: "monospace" }}>
              x402-guard.ts
            </div>
            <pre style={{ margin: 0, padding: "20px", overflow: "auto", fontFamily: "monospace", fontSize: "13px", lineHeight: 1.7, color: "#6b7f75" }}>
              <code>{snippet}</code>
            </pre>
          </div>

          <div style={{ marginTop: "24px", display: "flex", justifyContent: "center" }}>
            <Link href="/pay" className="btn-secondary">
              See full payment stack <Zap size={16} />
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 767px) {
          .x402-pillars-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
