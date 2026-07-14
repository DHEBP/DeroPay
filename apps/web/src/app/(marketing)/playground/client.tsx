"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Copy, Check, Store, LayoutDashboard } from "lucide-react";
import Script from "next/script";
import { DEMO_URL, CHECKOUT_URL, DASHBOARD_URL } from "@/lib/site";

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
      (window as unknown as { DeroPay?: { init?: () => void } }).DeroPay?.init?.();
    }
  }, [amount, name]);

  return (
    <>
      <Script src="/widget.js" strategy="lazyOnload" />

      {/* Hero */}
      <section className="pad">
        <div className="grid-bg" />
        <div
          className="orb"
          style={{ width: "700px", height: "700px", top: "-30%", right: "16%", background: "rgba(49,223,144,.14)" }}
        />
        <div className="wrap">
          <div className="hero-c">
            <span className="eyebrow dot">Interactive demo</span>
            <h1 style={{ marginTop: "16px" }}>
              Try DeroPay <span className="g">right now</span>.
            </h1>
            <p className="lead">
              Click the button. No wallet, no backend, no setup. This is the real widget running in
              simulation mode.
            </p>
          </div>
        </div>
      </section>

      {/* Live widget + embed code */}
      <section className="pad-sm" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="wrap">
          <div className="pg">
            {/* Widget side */}
            <div>
              <h2>Embeddable widget</h2>
              <p className="sub">
                A 14 KB script that renders a payment button and full checkout modal. Drop it on any
                website.
              </p>
              <div className="glass widget-stage">
                <div
                  ref={widgetRef}
                  data-deropay=""
                  data-demo="true"
                  data-amount={amount}
                  data-name={name}
                />
                <div className="note">Simulation mode — no real DERO is transferred</div>
              </div>
              <div className="cfg">
                <div>
                  <label>Amount (atomic)</label>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div>
                  <label>Invoice name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ fontFamily: "var(--body)" }}
                  />
                </div>
              </div>
            </div>

            {/* Code side */}
            <div>
              <div className="copybar">
                <h2 style={{ margin: 0 }}>Embed code</h2>
                <button className="copybtn" onClick={handleCopy} style={copied ? { color: "var(--accent)" } : undefined}>
                  {copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="code">
                <div className="bar">
                  <i style={{ background: "#ff5f57" }} />
                  <i style={{ background: "#febc2e" }} />
                  <i style={{ background: "#28c840" }} />
                  <span className="fname">index.html</span>
                </div>
                <pre>
                  {"<"}
                  <span className="k">script</span> <span className="f">src</span>=
                  <span className="s">&quot;https://deropay.com/widget.js&quot;</span>
                  {"></"}
                  <span className="k">script</span>
                  {">"}
                  {"\n\n"}
                  {"<"}
                  <span className="k">div</span> <span className="f">data-deropay</span>
                  {"\n  "}
                  <span className="f">data-gateway</span>=
                  <span className="s">&quot;https://your-gateway.com&quot;</span>
                  {"\n  "}
                  <span className="f">data-api-key</span>=
                  <span className="s">&quot;your-api-key&quot;</span>
                  {"\n  "}
                  <span className="f">data-amount</span>=
                  <span className="s">&quot;2500000&quot;</span>
                  {"\n  "}
                  <span className="f">data-name</span>=
                  <span className="s">&quot;Premium Plan&quot;</span>
                  {">"}
                  {"\n"}
                  {"</"}
                  <span className="k">div</span>
                  {">"}
                </pre>
              </div>
              <p className="sub" style={{ marginTop: "16px", marginBottom: 0 }}>
                One script tag, one div. The widget handles invoice creation, QR codes, address
                display, status polling, and confirmation — all inside a Shadow DOM with zero style
                conflicts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* See the full picture */}
      <section className="pad" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div
          className="orb"
          style={{ width: "540px", height: "540px", bottom: "-10%", left: "-12%", background: "rgba(49,223,144,.09)" }}
        />
        <div className="wrap">
          <div className="head">
            <span className="eyebrow">More to explore</span>
            <h2>See the full picture</h2>
            <p>
              The widget is one of four distribution channels. Explore the demo store, hosted
              checkout, and merchant dashboard.
            </p>
          </div>
          <div className="demos">
            <a
              className="glass dcard"
              href={DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="ic">
                <Store width={22} height={22} />
              </span>
              <h3>Demo Store</h3>
              <p>Browse, cart, checkout</p>
            </a>
            <a
              className="glass dcard"
              href={CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="ic">
                <ArrowRight width={22} height={22} />
              </span>
              <h3>Checkout Page</h3>
              <p>Hosted payment link</p>
            </a>
            <a
              className="glass dcard"
              href={DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="ic">
                <LayoutDashboard width={22} height={22} />
              </span>
              <h3>Dashboard</h3>
              <p>Merchant admin panel</p>
            </a>
          </div>
        </div>
      </section>

      <style>{`
        .hero-c{max-width:720px;margin:0 auto;text-align:center;position:relative;z-index:1}
        .hero-c h1{font-family:var(--display);font-weight:800;font-size:clamp(2.4rem,5.2vw,3.8rem);line-height:1.05;letter-spacing:-.04em}
        .hero-c h1 .g{color:var(--accent)}
        .hero-c .lead{margin:22px auto 0;font-size:18px;line-height:1.65;color:var(--ts);max-width:52ch}
        .pg{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}
        @media(max-width:860px){.pg{grid-template-columns:1fr}}
        .pg h2{font-family:var(--display);font-weight:700;font-size:22px;letter-spacing:-.02em;margin-bottom:8px}
        .pg .sub{font-size:14px;color:var(--ts);margin-bottom:24px;line-height:1.6}
        .widget-stage{border-radius:16px;padding:44px 32px;text-align:center}
        .paybtn{display:inline-flex;align-items:center;gap:10px;background:var(--accent);color:#051008;font-family:var(--body);font-weight:700;font-size:16px;border-radius:12px;padding:15px 28px;cursor:pointer;box-shadow:0 12px 32px -12px var(--accent-glow)}
        .widget-stage .note{margin-top:18px;font-size:12px;color:var(--tt)}
        .cfg{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .cfg label{display:block;font-size:11px;font-weight:600;color:var(--ts);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
        .cfg input{width:100%;padding:10px 12px;background:rgba(9,11,10,.6);border:1px solid var(--border-soft);border-radius:9px;color:var(--tp);font-family:var(--mono);font-size:13px}
        .copybar{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
        .copybtn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:transparent;border:1px solid var(--border-soft);border-radius:8px;color:var(--ts);font-size:12px;font-weight:600;cursor:pointer;transition:.15s}
        .demos{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:640px;margin:0 auto}
        @media(max-width:640px){.demos{grid-template-columns:1fr}}
        .dcard{padding:22px 18px;text-align:center;display:block;transition:.25s}
        .dcard:hover{border-color:var(--border-strong);transform:translateY(-3px)}
        .dcard .ic{display:inline-flex;padding:11px;border-radius:50%;background:var(--accent-dim);color:var(--accent);margin-bottom:12px}
        .dcard h3{font-family:var(--display);font-weight:600;font-size:15px;margin-bottom:4px}
        .dcard p{font-size:12.5px;color:var(--ts)}
      `}</style>
    </>
  );
};
