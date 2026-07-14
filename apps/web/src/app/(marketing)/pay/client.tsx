"use client";

import Link from "next/link";
import { NPM_URL, DOCS_URL, DEMO_URL, CHECKOUT_URL } from "@/lib/site";

const features = [
  {
    title: "Invoice Engine",
    description:
      "Unique integrated addresses, automatic TTL expiry, partial-payment handling, and a full state-machine lifecycle.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 2h12l4 4v16H4z" />
        <path d="M8 7h6M8 11h8M8 15h5" />
      </svg>
    ),
  },
  {
    title: "QR Code Payments",
    description:
      "Customers scan with their wallet. Integrated addresses embed payment IDs — no manual input needed.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <path d="M14 14h3v3M20 20v.01M14 20v.01" />
      </svg>
    ),
  },
  {
    title: "Real-Time Monitoring",
    description:
      "Polling detection with configurable confirmation depth using daemon topo height vs. the transfer’s inclusion height.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 3 3 5-6" />
      </svg>
    ),
  },
  {
    title: "HMAC Webhooks",
    description:
      "Stripe-style signed HTTP POST on every state change, with exponential-backoff retry.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8a3 3 0 1 0-2.83-4M6 16a3 3 0 1 0 2.83 4M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" />
      </svg>
    ),
  },
  {
    title: "Pluggable Storage",
    description:
      "In-memory for dev, SQLite for production, or bring your own via a simple InvoiceStore interface.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
      </svg>
    ),
  },
  {
    title: "Merchant Dashboard",
    description:
      "Self-hosted admin UI for invoices, payment history, wallet status, and escrow operations.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
];

const channels = [
  {
    title: "Payment Links",
    description:
      "No website needed. Create an invoice, get a link, share it anywhere — email, social, QR poster, text. The hosted checkout page handles the rest.",
    docHref: `${DOCS_URL}/guides/payment-links`,
    demoHref: CHECKOUT_URL,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
        <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
      </svg>
    ),
  },
  {
    title: "Embeddable Widget",
    description:
      "Drop a single <script> tag on any website. A 14 KB file renders a “Pay with DERO” button with a full payment modal. Zero dependencies.",
    docHref: `${DOCS_URL}/guides/embeddable-widget`,
    demoHref: DEMO_URL,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m18 16 4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16" />
      </svg>
    ),
  },
  {
    title: "WooCommerce Plugin",
    description:
      "Accept DERO in the world’s largest ecommerce platform. A thin PHP adapter connects your WooCommerce checkout to the gateway’s REST API.",
    docHref: `${DOCS_URL}/guides/woocommerce`,
    demoHref: null,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
      </svg>
    ),
  },
  {
    title: "Medusa.js Plugin",
    description:
      "TypeScript-native payment provider for Medusa v2. Extends AbstractPaymentProvider with automatic fiat-to-DERO conversion and webhook handling.",
    docHref: `${DOCS_URL}/guides/medusa-plugin`,
    demoHref: null,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-6 9 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M9 22V12h6v10" />
      </svg>
    ),
  },
];

export const PayPageClient = () => (
  <>
    {/* HERO */}
    <section className="pad">
      <div className="grid-bg" />
      <div className="orb" style={{ width: "720px", height: "720px", top: "-32%", left: "-10%", background: "rgba(49,223,144,.15)" }} />
      <div className="orb" style={{ width: "560px", height: "560px", top: "-6%", right: "-12%", background: "rgba(217,198,163,.09)" }} />
      <div className="wrap">
        <div className="hero-grid">
          <div className="hero">
            <span className="eyebrow dot">DeroPay</span>
            <h1>
              Accept DERO payments <span className="g">in minutes</span>.
            </h1>
            <p className="lead">
              Invoices, real-time payment monitoring, HMAC-signed webhooks, and a
              self-hosted merchant dashboard. Everything runs on your infrastructure.
            </p>
            <div className="btns">
              <Link className="btn btn-accent" href="/playground">
                Get started
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <a className="btn btn-ghost" href={NPM_URL} target="_blank" rel="noopener noreferrer">
                View on npm
              </a>
            </div>
            <div className="checks">
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Zero platform fees
              </span>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Self-hosted
              </span>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                MIT licensed
              </span>
            </div>
          </div>

          {/* invoice card */}
          <div style={{ position: "relative" }}>
            <div className="halo" />
            <div className="glass inv" style={{ position: "relative" }}>
              <div className="top">
                <div className="merch">
                  <span className="mk">◇</span>
                  <span>
                    <b>Aurora Store</b>
                    <small>invoice #DP-2048</small>
                  </span>
                </div>
                <span className="pill">
                  <span className="d" />
                  Awaiting payment
                </span>
              </div>
              <div className="amt tnum">
                25.00000<span className="u">DERO</span>
              </div>
              <div className="amt-sub tnum">≈ expires in 14:58</div>
              <div className="qr-row">
                <div className="qr">
                  <svg viewBox="0 0 116 116" shapeRendering="crispEdges" fill="#060806">
                    <rect x="0" y="0" width="34" height="34" />
                    <rect x="6" y="6" width="22" height="22" fill="#fff" />
                    <rect x="12" y="12" width="10" height="10" />
                    <rect x="82" y="0" width="34" height="34" />
                    <rect x="88" y="6" width="22" height="22" fill="#fff" />
                    <rect x="94" y="12" width="10" height="10" />
                    <rect x="0" y="82" width="34" height="34" />
                    <rect x="6" y="88" width="22" height="22" fill="#fff" />
                    <rect x="12" y="94" width="10" height="10" />
                    <g>
                      <rect x="42" y="6" width="8" height="8" />
                      <rect x="58" y="6" width="8" height="8" />
                      <rect x="66" y="14" width="8" height="8" />
                      <rect x="42" y="22" width="8" height="8" />
                      <rect x="50" y="30" width="8" height="8" />
                      <rect x="66" y="30" width="8" height="8" />
                      <rect x="6" y="42" width="8" height="8" />
                      <rect x="22" y="42" width="8" height="8" />
                      <rect x="38" y="42" width="8" height="8" />
                      <rect x="54" y="42" width="8" height="8" />
                      <rect x="70" y="42" width="8" height="8" />
                      <rect x="86" y="42" width="8" height="8" />
                      <rect x="102" y="42" width="8" height="8" />
                      <rect x="14" y="50" width="8" height="8" />
                      <rect x="46" y="50" width="8" height="8" />
                      <rect x="78" y="50" width="8" height="8" />
                      <rect x="94" y="50" width="8" height="8" />
                      <rect x="6" y="58" width="8" height="8" />
                      <rect x="30" y="58" width="8" height="8" />
                      <rect x="62" y="58" width="8" height="8" />
                      <rect x="86" y="58" width="8" height="8" />
                      <rect x="102" y="58" width="8" height="8" />
                      <rect x="42" y="58" width="8" height="8" />
                      <rect x="22" y="66" width="8" height="8" />
                      <rect x="54" y="66" width="8" height="8" />
                      <rect x="70" y="66" width="8" height="8" />
                      <rect x="94" y="66" width="8" height="8" />
                      <rect x="42" y="74" width="8" height="8" />
                      <rect x="58" y="82" width="8" height="8" />
                      <rect x="74" y="82" width="8" height="8" />
                      <rect x="90" y="82" width="8" height="8" />
                      <rect x="106" y="82" width="8" height="8" />
                      <rect x="50" y="90" width="8" height="8" />
                      <rect x="66" y="90" width="8" height="8" />
                      <rect x="82" y="98" width="8" height="8" />
                      <rect x="98" y="98" width="8" height="8" />
                      <rect x="42" y="106" width="8" height="8" />
                      <rect x="58" y="106" width="8" height="8" />
                      <rect x="74" y="106" width="8" height="8" />
                      <rect x="106" y="106" width="8" height="8" />
                    </g>
                  </svg>
                </div>
                <div className="scan">
                  <b>Scan to pay</b>
                  <br />
                  Point any DERO wallet at the code. The integrated address embeds the
                  payment ID — no memo to copy.
                </div>
              </div>
              <div className="field">
                <span className="lbl">Integrated address</span>
                <span className="val">dero1qy…8f3a2c</span>
              </div>
              <div className="conf">
                <i className="on" />
                <i className="on" />
                <i className="on" />
                <i />
                <i />
                <span className="tnum">3 / 5 confirmations</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* LIFECYCLE */}
    <section className="pad-sm" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Lifecycle</span>
          <h2>Invoice to confirmation</h2>
          <p>
            The complete payment lifecycle — creation, QR, detection, and chain
            confirmations — handled by the engine.
          </p>
        </div>
        <div className="flow">
          <div className="card step">
            <div className="n">01</div>
            <h4>Create invoice</h4>
            <p>Unique integrated address with TTL expiry and full state-machine lifecycle.</p>
          </div>
          <div className="card step">
            <div className="n">02</div>
            <h4>Customer pays</h4>
            <p>They scan the QR from any wallet. No payment ID to copy by hand.</p>
          </div>
          <div className="card step">
            <div className="n">03</div>
            <h4>Detect payment</h4>
            <p>Polling detection at your configured confirmation depth via daemon topo height.</p>
          </div>
          <div className="card step">
            <div className="n">04</div>
            <h4>Webhook fires</h4>
            <p>HMAC-signed POST on every state change, with exponential-backoff retries.</p>
          </div>
        </div>
      </div>
    </section>

    {/* FEATURES */}
    <section className="pad">
      <div className="orb" style={{ width: "540px", height: "540px", top: "20%", left: "-12%", background: "rgba(49,223,144,.09)" }} />
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Features</span>
          <h2>Everything a merchant needs</h2>
          <p>
            From invoice creation to webhook delivery. No third-party services, no API
            keys, no external dependencies.
          </p>
        </div>
        <div className="grid3">
          {features.map((f) => (
            <div className="card" key={f.title}>
              <div className="ibadge">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* CHANNELS */}
    <section className="pad" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Accept DERO everywhere</span>
          <h2>Four ways to get paid</h2>
          <p>
            One gateway server, multiple distribution channels. Pick the one that fits
            your business — or use them all.
          </p>
        </div>
        <div className="grid2">
          {channels.map((c) => (
            <div className="card" key={c.title}>
              <div className="ibadge">{c.icon}</div>
              <h3>{c.title}</h3>
              <p>{c.description}</p>
              <div className="chan-links">
                <a className="doc" href={c.docHref} target="_blank" rel="noopener noreferrer">
                  Docs →
                </a>
                {c.demoHref && (
                  <a className="demo" href={c.demoHref} target="_blank" rel="noopener noreferrer">
                    Try demo →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* CODE */}
    <section className="pad" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div className="orb" style={{ width: "520px", height: "520px", bottom: "-20%", right: "-10%", background: "rgba(49,223,144,.08)" }} />
      <div className="wrap" style={{ maxWidth: "760px", position: "relative", zIndex: 1 }}>
        <div className="head">
          <span className="eyebrow">Quick start</span>
          <h2>Five minutes to first payment</h2>
          <p>Configure your wallet RPC, create an invoice, and start monitoring.</p>
        </div>
        <div className="code">
          <div className="bar">
            <i style={{ background: "#ff5f57" }} />
            <i style={{ background: "#febc2e" }} />
            <i style={{ background: "#28c840" }} />
            <span className="fname">server.ts</span>
          </div>
          <pre>
            <span className="k">import</span> {"{ InvoiceEngine } "}
            <span className="k">from</span> <span className="s">&quot;dero-pay/server&quot;</span>;{"\n"}
            <span className="k">import</span> {"{ deroToAtomic } "}
            <span className="k">from</span> <span className="s">&quot;dero-pay&quot;</span>;{"\n"}
            {"\n"}
            <span className="k">const</span> <span className="f">engine</span> ={" "}
            <span className="k">new</span> <span className="f">InvoiceEngine</span>({"{"}
            {"\n"}
            {"  "}walletRpcUrl:{" "}
            <span className="s">&quot;http://127.0.0.1:10103/json_rpc&quot;</span>,{"\n"}
            {"  "}daemonRpcUrl:{" "}
            <span className="s">&quot;http://127.0.0.1:10102/json_rpc&quot;</span>,{"\n"}
            {"  "}store: <span className="k">new</span>{" "}
            <span className="f">SqliteInvoiceStore</span>(
            <span className="s">&quot;./payments.db&quot;</span>),{"\n"}
            {"  "}webhook: {"{"}
            {"\n"}
            {"    "}url:{" "}
            <span className="s">&quot;https://mystore.com/api/webhook&quot;</span>,{"\n"}
            {"    "}secret: process.env.<span className="f">WEBHOOK_SECRET</span>!,{"\n"}
            {"  }"},{"\n"}
            {"}"});{"\n"}
            {"\n"}
            <span className="k">const</span> invoice = <span className="k">await</span>{" "}
            engine.<span className="f">createInvoice</span>({"{"}
            {"\n"}
            {"  "}name: <span className="s">&quot;Premium Plan&quot;</span>,{"\n"}
            {"  "}amount: <span className="f">deroToAtomic</span>(
            <span className="s">&quot;25.0&quot;</span>),{"   "}
            <span className="c">// 25.00000 DERO</span>
            {"\n"}
            {"  "}ttl: <span className="n">900</span>,{"                    "}
            <span className="c">// 15 minutes</span>
            {"\n"}
            {"}"});{"\n"}
            {"\n"}
            engine.<span className="f">start</span>();
          </pre>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="pad">
      <div className="orb" style={{ width: "820px", height: "520px", bottom: "-40%", left: "50%", transform: "translateX(-50%)", background: "rgba(49,223,144,.18)" }} />
      <div className="wrap">
        <div className="cta-band">
          <h2>
            Ready to accept <span className="g">DERO</span>?
          </h2>
          <p>
            Start accepting private payments in minutes. Self-hosted, zero platform
            fees, fully open source.
          </p>
          <div className="btns" style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
            <Link className="btn btn-accent" href="/playground">
              Get started
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <a className="btn btn-ghost" href={DOCS_URL} target="_blank" rel="noopener noreferrer">
              Read the docs
            </a>
          </div>
        </div>
      </div>
    </section>

    <style>{`
      .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;position:relative;z-index:1}
      @media(max-width:960px){.hero-grid{grid-template-columns:1fr;gap:40px}}
      .hero h1{font-family:var(--display);font-weight:800;font-size:clamp(2.6rem,5.2vw,4.2rem);line-height:1.04;letter-spacing:-.04em;max-width:15ch}
      .hero h1 .g{color:var(--accent)}
      .hero .lead{margin-top:22px;font-size:18px;line-height:1.65;color:var(--ts);max-width:48ch}
      .hero .btns{margin-top:30px;display:flex;gap:14px;flex-wrap:wrap}
      .checks{margin-top:28px;display:flex;gap:20px;flex-wrap:wrap;font-weight:600;font-size:13px;color:var(--tt)}
      .checks span{display:inline-flex;align-items:center;gap:7px}
      .checks svg{width:15px;height:15px;color:var(--accent)}

      /* invoice card */
      .inv{padding:24px;position:relative}
      .inv .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
      .inv .merch{display:flex;align-items:center;gap:10px}
      .inv .merch .mk{width:32px;height:32px;border-radius:9px;background:var(--accent-dim);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800}
      .inv .merch b{font-family:var(--display);font-weight:600;font-size:15px}
      .inv .merch small{display:block;color:var(--tt);font-size:11.5px;font-weight:500}
      .pill{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:600;color:#ffce54;
        background:rgba(255,206,84,.1);border:1px solid rgba(255,206,84,.22);padding:5px 11px;border-radius:999px}
      .pill .d{width:7px;height:7px;border-radius:50%;background:#ffce54;animation:pulse 1.6s infinite}
      .inv .amt{font-family:var(--display);font-weight:700;font-size:38px;letter-spacing:-.02em;color:var(--tp)}
      .inv .amt .u{font-size:16px;color:var(--accent-strong);margin-left:7px;font-weight:600}
      .inv .amt-sub{color:var(--tt);font-size:12.5px;margin-top:2px}
      .qr-row{display:flex;gap:18px;align-items:center;margin:22px 0 18px}
      .qr{width:118px;height:118px;border-radius:14px;background:#fff;padding:11px;flex:none}
      .qr svg{display:block;width:100%;height:100%}
      .scan{font-size:13px;color:var(--ts);line-height:1.55}
      .scan b{color:var(--tp);font-weight:600;font-family:var(--display)}
      .field{border-top:1px solid var(--border-soft);padding-top:14px;display:flex;align-items:center;justify-content:space-between;gap:12px}
      .field .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--tt);font-weight:600}
      .field .val{font-family:var(--mono);font-size:12.5px;color:var(--ts)}
      .conf{display:flex;align-items:center;gap:6px;margin-top:14px}
      .conf i{width:100%;height:4px;border-radius:2px;background:var(--border);flex:1}
      .conf i.on{background:var(--accent)}
      .conf span{font-size:11px;color:var(--tt);margin-left:8px;white-space:nowrap;font-weight:500}
      .hero .halo{position:absolute;inset:-8% -6%;background:radial-gradient(ellipse at 70% 45%,rgba(49,223,144,.16),transparent 62%);filter:blur(50px);z-index:0;pointer-events:none}
      .halo{position:absolute;inset:-8% -6%;background:radial-gradient(ellipse at 70% 45%,rgba(49,223,144,.16),transparent 62%);filter:blur(50px);z-index:0;pointer-events:none}

      /* lifecycle */
      .flow{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;position:relative;z-index:1}
      @media(max-width:820px){.flow{grid-template-columns:1fr 1fr}}
      .step{padding:22px}
      .step .n{font-family:var(--mono);font-size:12px;color:var(--accent);font-weight:500}
      .step h4{font-family:var(--display);font-weight:600;font-size:15.5px;margin:10px 0 6px;letter-spacing:-.01em}
      .step p{font-size:13px;color:var(--ts);line-height:1.55}

      /* cta */
      .cta-band{text-align:center;position:relative;z-index:1;max-width:680px;margin:0 auto}
      .cta-band h2{font-family:var(--display);font-weight:700;font-size:clamp(2rem,4.5vw,3.2rem);letter-spacing:-.04em;line-height:1.05}
      .cta-band h2 .g{color:var(--accent)}
      .cta-band p{margin:16px auto 30px;font-size:17px;color:var(--ts);max-width:44ch}

      /* channel links */
      .chan-links{display:flex;gap:14px;margin-top:16px}
      .chan-links a{font-size:13px;font-weight:600}
      .chan-links .doc{color:var(--ts)}
      .chan-links .doc:hover{color:var(--tp)}
      .chan-links .demo{color:var(--accent)}
    `}</style>
  </>
);
