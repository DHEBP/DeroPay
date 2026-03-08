"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Copy, Check, Store, BookOpen } from "lucide-react";
import Script from "next/script";

const EMBED_CODE = `<script src="https://deropay.com/widget.js"><\/script>

<div data-deropay
  data-gateway="https://your-gateway.com"
  data-api-key="your-api-key"
  data-amount="2500000"
  data-name="Premium Plan">
</div>`;

export const PlaygroundClient = () => {
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState("2500000");
  const [name, setName] = useState("Premium Plan");
  const widgetRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(EMBED_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!widgetRef.current) return;
    const el = widgetRef.current;
    el.dataset.amount = amount;
    el.dataset.name = name;

    if (el.shadowRoot) {
      el.innerHTML = "";
      el.removeAttribute("data-deropay-init");
      const newEl = el.cloneNode(false) as HTMLElement;
      newEl.dataset.deropay = "";
      newEl.dataset.demo = "true";
      newEl.dataset.amount = amount;
      newEl.dataset.name = name;
      el.parentNode?.replaceChild(newEl, el);
      widgetRef.current = newEl as HTMLDivElement;
      (window as any).DeroPay?.init?.();
    }
  }, [amount, name]);

  return (
    <>
      <Script src="/widget.js" strategy="lazyOnload" />

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
            <p style={{ marginBottom: "16px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>Interactive Demo</p>
            <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#f0fdf4" }}>
              Try DeroPay <span style={{ color: "#10b981" }}>right now</span>
            </h1>
            <p style={{ marginTop: "20px", fontSize: "18px", fontWeight: 500, lineHeight: 1.6, color: "#6b7f75", maxWidth: "560px", marginLeft: "auto", marginRight: "auto" }}>
              Click the button below. No wallet, no backend, no setup. This is the real widget running in simulation mode.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Live Widget */}
      <section style={{ background: "#000", padding: "80px 24px", borderBottom: "1px solid #1e2a24" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "grid", gap: "48px", gridTemplateColumns: "1fr 1fr", alignItems: "start" }} className="playground-grid">
            {/* Widget side */}
            <div>
              <h2 style={{ fontSize: "24px", fontWeight: 900, color: "#f0fdf4", marginBottom: "8px" }}>Embeddable Widget</h2>
              <p style={{ fontSize: "14px", color: "#6b7f75", marginBottom: "32px", lineHeight: 1.6 }}>
                A 13KB script that renders a payment button and full checkout modal. Drop it on any website.
              </p>

              <div style={{ background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "16px", padding: "48px 32px", textAlign: "center" }}>
                <div
                  ref={widgetRef}
                  data-deropay=""
                  data-demo="true"
                  data-amount={amount}
                  data-name={name}
                />
                <p style={{ marginTop: "20px", fontSize: "12px", color: "#4a6356" }}>
                  Simulation mode — no real DERO is transferred
                </p>
              </div>

              {/* Configurator */}
              <div style={{ marginTop: "24px", display: "grid", gap: "12px", gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#6b7f75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                    Amount (atomic)
                  </label>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "8px", color: "#f0fdf4", fontFamily: "monospace", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#6b7f75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                    Invoice Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "8px", color: "#f0fdf4", fontSize: "13px" }}
                  />
                </div>
              </div>
            </div>

            {/* Code side */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <h2 style={{ fontSize: "24px", fontWeight: 900, color: "#f0fdf4" }}>Embed Code</h2>
                <button
                  onClick={handleCopy}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "transparent", border: "1px solid #1e2a24", borderRadius: "8px", color: copied ? "#10b981" : "#6b7f75", cursor: "pointer", fontSize: "12px", fontWeight: 600, transition: "all 0.15s" }}
                >
                  {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                </button>
              </div>

              <div style={{ overflow: "hidden", borderRadius: "16px", border: "1px solid #1e2a24", background: "#000" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #1e2a24", background: "#0a0f0d", padding: "10px 16px" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ff5f57" }} />
                    <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#febc2e" }} />
                    <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#28c840" }} />
                  </div>
                  <span style={{ marginLeft: "8px", fontFamily: "monospace", fontSize: "12px", color: "#4a6356" }}>index.html</span>
                </div>
                <pre style={{ overflow: "auto", padding: "20px", fontFamily: "monospace", fontSize: "13px", lineHeight: 1.7, color: "#6b7f75" }}>
                  <code>{EMBED_CODE}</code>
                </pre>
              </div>

              <p style={{ marginTop: "16px", fontSize: "13px", color: "#6b7f75", lineHeight: 1.6 }}>
                That&apos;s it. One script tag, one div. The widget handles invoice creation, QR codes, address display, status polling, and confirmation — all inside a Shadow DOM with zero style conflicts.
              </p>

              <div style={{ marginTop: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <a href="https://deropay.derod.org/guides/embeddable-widget" target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 18px", fontSize: "13px" }}>
                  <BookOpen size={14} /> Widget Docs
                </a>
                <a href="https://demo.deropay.com" target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 18px", fontSize: "13px" }}>
                  <Store size={14} /> Full Demo Store
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* More demos CTA */}
      <section style={{ background: "#000", padding: "80px 24px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4", marginBottom: "12px" }}>See the full picture</h2>
          <p style={{ fontSize: "16px", color: "#6b7f75", marginBottom: "32px", lineHeight: 1.6 }}>
            The widget is one of four distribution channels. Explore the complete demo store, hosted checkout page, and merchant dashboard.
          </p>
          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(3, 1fr)", maxWidth: "600px", margin: "0 auto" }} className="demos-grid">
            <a
              href="https://demo.deropay.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", padding: "20px 16px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "12px", textDecoration: "none", transition: "border-color 0.2s" }}
              className="demo-card"
            >
              <div style={{ display: "inline-flex", padding: "10px", borderRadius: "50%", background: "#0a1f17", marginBottom: "12px", color: "#10b981" }}>
                <Store size={22} />
              </div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#f0fdf4", marginBottom: "4px" }}>Demo Store</h3>
              <p style={{ fontSize: "12px", color: "#6b7f75" }}>Browse, cart, checkout</p>
            </a>
            <a
              href="https://checkout.deropay.com?demo=true"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", padding: "20px 16px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "12px", textDecoration: "none", transition: "border-color 0.2s" }}
              className="demo-card"
            >
              <div style={{ display: "inline-flex", padding: "10px", borderRadius: "50%", background: "#0a1f17", marginBottom: "12px", color: "#10b981" }}>
                <ArrowRight size={22} />
              </div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#f0fdf4", marginBottom: "4px" }}>Checkout Page</h3>
              <p style={{ fontSize: "12px", color: "#6b7f75" }}>Hosted payment link</p>
            </a>
            <a
              href="https://dashboard.deropay.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", padding: "20px 16px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "12px", textDecoration: "none", transition: "border-color 0.2s" }}
              className="demo-card"
            >
              <div style={{ display: "inline-flex", padding: "10px", borderRadius: "50%", background: "#0a1f17", marginBottom: "12px", color: "#10b981" }}>
                <BookOpen size={22} />
              </div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#f0fdf4", marginBottom: "4px" }}>Dashboard</h3>
              <p style={{ fontSize: "12px", color: "#6b7f75" }}>Merchant admin panel</p>
            </a>
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 767px) {
          .playground-grid { grid-template-columns: 1fr !important; }
          .demos-grid { grid-template-columns: 1fr !important; }
        }
        .demo-card:hover { border-color: #4a6356 !important; }
      `}</style>
    </>
  );
};
