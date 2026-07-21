"use client";

import { DOCS_URL, NPM_URL } from "@/lib/site";

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const loopSteps = [
  {
    tag: "GET",
    tagClass: "req",
    title: "Client requests a paid resource",
    body: (
      <>
        <code>GET /api/inference</code> — no payment yet
      </>
    ),
  },
  {
    tag: "402",
    tagClass: "chal",
    title: "Server returns a payment challenge",
    body: (
      <>
        Machine-readable: amount <code>0.10 DERO</code>, resource, invoice id
      </>
    ),
  },
  {
    tag: "PAY",
    tagClass: "pay",
    title: "Agent pays on DERO",
    body: <>On-chain DERO payment settled via the x402 contract</>,
  },
  {
    tag: "RETRY",
    tagClass: "req",
    title: "Client retries with proof",
    body: (
      <>
        <code>Authorization: X402 proof…</code> — signed, optional single-use
      </>
    ),
  },
  {
    tag: "200",
    tagClass: "ok",
    title: "Server verifies and responds",
    body: <>Signed receipt issued; resource delivered</>,
  },
];

const pillars = [
  {
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="4" y="8" width="16" height="12" rx="2" />
        <path d="M12 8V4M9 2h6M9 14h.01M15 14h.01" />
      </svg>
    ),
    title: "Agent-Ready by Design",
    body: "Machine-readable 402 challenges let clients, bots, and agents negotiate payment without human checkout flows.",
  },
  {
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    ),
    title: "Deterministic Request Loop",
    body: "Request → 402 → pay → retry with proof → response. Same HTTP mental model, now with value exchange.",
  },
  {
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
    title: "Production Security",
    body: "Signed receipts, optional single-use replay protection, key rotation, and auditable events make payment-gated endpoints safe to operate. Note: x402 payments are not sender-anonymous — the payer's address is recorded on public chain state (see SECURITY.md).",
  },
  {
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M12 3a9 9 0 1 0 9 9M12 12l5-3M12 12V7" />
      </svg>
    ),
    title: "Operational Controls",
    body: "Enforce quotas and dynamic pricing policies per route — no separate billing system to bolt on.",
  },
];

export const X402PageClient = () => (
  <>
    {/* Hero */}
    <section className="pad">
      <div className="grid-bg" />
      <div
        className="orb"
        style={{ width: 760, height: 760, top: "-34%", right: "20%", background: "rgba(49,223,144,.14)" }}
      />
      <div
        className="orb"
        style={{ width: 520, height: 520, top: "-6%", left: "12%", background: "rgba(217,198,163,.09)" }}
      />
      <div className="wrap">
        <div className="hero-c">
          <span className="eyebrow dot">x402 + DERO</span>
          <h1 style={{ marginTop: 16 }}>
            The internet-native payment rail
            <br />
            for <span className="g">agentic commerce</span>.
          </h1>
          <p className="lead">
            DeroPay implements x402 as a DERO-native protocol loop, so APIs can monetize per request with
            machine-readable payment challenges and proof-based retries.
          </p>
          <div className="btns">
            <a className="btn btn-accent" href={DOCS_URL} target="_blank" rel="noopener noreferrer">
              Integrate x402 <ArrowRight />
            </a>
            <a className="btn btn-ghost" href={NPM_URL} target="_blank" rel="noopener noreferrer">
              npm package
            </a>
          </div>
        </div>
      </div>
    </section>

    {/* Request loop */}
    <section className="pad-sm" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Request loop</span>
          <h2>See it negotiate payment</h2>
          <p>A complete x402 exchange — request, challenge, settlement, proof, delivery — on the wire.</p>
        </div>
        <div className="glass loop">
          {loopSteps.map((step, i) => (
            <div className="l" key={i}>
              <span className={`tag ${step.tagClass}`}>{step.tag}</span>
              <div className="body">
                <b>{step.title}</b>
                <span>{step.body}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Why x402 — pillars */}
    <section className="pad" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div
        className="orb"
        style={{ width: 540, height: 540, top: "16%", left: "-12%", background: "rgba(49,223,144,.09)" }}
      />
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Why x402</span>
          <h2>Protocol-level pricing for the API economy</h2>
        </div>
        <div className="grid2">
          {pillars.map((pillar) => (
            <div className="card" key={pillar.title}>
              <div className="ibadge">{pillar.icon}</div>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Developer flow — route guard */}
    <section className="pad" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div className="wrap" style={{ maxWidth: 840, position: "relative", zIndex: 1 }}>
        <div className="head">
          <span className="eyebrow">Developer flow</span>
          <h2>Add x402 in a few lines</h2>
        </div>
        <div className="code">
          <div className="bar">
            <i style={{ background: "#ff5f57" }} />
            <i style={{ background: "#febc2e" }} />
            <i style={{ background: "#28c840" }} />
            <span className="fname">x402-guard.ts</span>
          </div>
          <pre>
            {/* prettier-ignore */}
            <code>
              <span className="k">import</span>{" { createX402RouteGuard } "}<span className="k">from</span>{" "}<span className="s">&quot;dero-pay/next&quot;</span>{";\n\n"}
              <span className="k">export const</span>{" x402Guard = "}<span className="f">createX402RouteGuard</span>{"({\n"}
              {"  getEngine: paymentHandlers.getEngine,\n"}
              {"  receiptSecret: process.env."}<span className="f">DEROPAY_RECEIPT_SECRET</span>{"!,\n"}
              {"  policy: {\n"}
              {"    name: "}<span className="s">&quot;Agent Inference&quot;</span>{",\n"}
              {"    amountAtomic: "}<span className="f">deroToAtomic</span>{"("}<span className="s">&quot;0.10&quot;</span>{"),\n"}
              {"    resource: "}<span className="s">&quot;/api/protected/inference&quot;</span>{",\n"}
              {"  },\n"}
              {"});"}
            </code>
          </pre>
        </div>
      </div>
    </section>

    {/* CTA band */}
    <section className="pad">
      <div
        className="orb"
        style={{
          width: 820,
          height: 520,
          bottom: "-40%",
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(49,223,144,.18)",
        }}
      />
      <div className="wrap">
        <div className="cta-band">
          <h2>
            Monetize your API <span className="g">per request</span>.
          </h2>
          <p>Give agents and bots a native way to pay — machine-readable challenges, proof-based retries.</p>
          <div className="btns" style={{ display: "flex", gap: 14, justifyContent: "center" }}>
            <a className="btn btn-accent" href={DOCS_URL} target="_blank" rel="noopener noreferrer">
              Integrate x402 <ArrowRight />
            </a>
            <a className="btn btn-ghost" href={DOCS_URL} target="_blank" rel="noopener noreferrer">
              Read the docs
            </a>
          </div>
        </div>
      </div>
    </section>

    <style>{`
      .hero-c { max-width: 800px; margin: 0 auto; text-align: center; position: relative; z-index: 1; }
      .hero-c h1 { font-family: var(--display); font-weight: 800; font-size: clamp(2.5rem, 5.6vw, 4.2rem); line-height: 1.04; letter-spacing: -.04em; }
      .hero-c h1 .g { color: var(--accent); }
      .hero-c .lead { margin: 22px auto 0; font-size: 18px; line-height: 1.65; color: var(--ts); max-width: 60ch; }
      .hero-c .btns { margin-top: 30px; display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
      /* request loop */
      .loop { max-width: 760px; margin: 0 auto; overflow: hidden; padding: 0; }
      .loop .l { display: flex; align-items: flex-start; gap: 16px; padding: 18px 22px; border-bottom: 1px solid var(--border-soft); }
      .loop .l:last-child { border-bottom: 0; }
      .loop .tag { font-family: var(--mono); font-size: 11px; font-weight: 600; padding: 4px 9px; border-radius: 7px; flex: none; margin-top: 2px; min-width: 74px; text-align: center; }
      .loop .req { background: rgba(127,212,255,.1); color: #7fd4ff; border: 1px solid rgba(127,212,255,.22); }
      .loop .chal { background: rgba(255,206,84,.1); color: #ffce54; border: 1px solid rgba(255,206,84,.22); }
      .loop .pay { background: var(--accent-dim); color: var(--accent); border: 1px solid var(--border-strong); }
      .loop .ok { background: rgba(52,211,153,.1); color: #34d399; border: 1px solid rgba(52,211,153,.24); }
      .loop .body b { font-family: var(--display); font-weight: 600; font-size: 14.5px; display: block; margin-bottom: 2px; }
      .loop .body span { font-size: 13px; color: var(--ts); }
      .loop .body code { font-family: var(--mono); font-size: 12px; color: var(--accent-strong); }
      .cta-band { text-align: center; position: relative; z-index: 1; max-width: 680px; margin: 0 auto; }
      .cta-band h2 { font-family: var(--display); font-weight: 700; font-size: clamp(2rem, 4.5vw, 3.2rem); letter-spacing: -.04em; line-height: 1.05; }
      .cta-band h2 .g { color: var(--accent); }
      .cta-band p { margin: 16px auto 30px; font-size: 17px; color: var(--ts); max-width: 46ch; }
    `}</style>
  </>
);
