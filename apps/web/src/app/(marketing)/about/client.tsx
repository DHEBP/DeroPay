"use client";

import { REPO_URL, DOCS_URL } from "@/lib/site";

const principles = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      </svg>
    ),
    title: "No Custody, Ever",
    description:
      "DeroPay never touches your funds. Payments flow directly from customer to merchant on DERO. No intermediary, no holding, no counterparty risk.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M2 9h20" />
      </svg>
    ),
    title: "Self-Hosted by Design",
    description:
      "You run the gateway on your infrastructure, connected to your wallet. Your keys, your data, your rules — the BTCPay model applied to DERO.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m18 16 4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16" />
      </svg>
    ),
    title: "Open Source (MIT)",
    description:
      "Every line is publicly available for review, audit, and contribution. Trust in payment software depends on public verifiability, not promises.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    title: "Privacy as Default",
    description:
      "Built for DERO — a chain where every transaction is encrypted by default. No transparent ledger, no on-chain surveillance. The foundation, not a feature.",
  },
];

export const AboutPageClient = () => (
  <>
    {/* Hero */}
    <section className="pad">
      <div className="grid-bg" />
      <div
        className="orb"
        style={{ width: "720px", height: "720px", top: "-32%", right: "18%", background: "rgba(49,223,144,.13)" }}
      />
      <div className="wrap">
        <div className="hero-c">
          <span className="eyebrow dot">About</span>
          <h1 style={{ marginTop: "16px" }}>
            Payment infrastructure <span className="g">that respects privacy</span>.
          </h1>
          <p className="lead">
            DeroPay is free, open-source, self-hosted payment infrastructure for DERO. Like BTCPay Server, but
            for the only blockchain with default encryption.
          </p>
        </div>
      </div>
    </section>

    {/* What is DeroPay */}
    <section className="pad-sm" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div className="wrap">
        <div className="prose">
          <h2>What is DeroPay?</h2>
          <p>
            DeroPay is a complete payment stack for accepting DERO — invoices, real-time payment monitoring,
            HMAC-signed webhooks, smart-contract escrow, and ecommerce plugins. It ships as an SDK, a standalone
            gateway server, and a set of distribution channels (WooCommerce, Medusa.js, embeddable widget,
            payment links).
          </p>
          <p>
            The architecture follows BTCPay Server: the gateway is open-source software merchants deploy on their
            own infrastructure, connected to their own DERO wallet. No third-party custody, no intermediary, no
            dependency on any hosted service.
          </p>
          <p>
            DeroPay also includes DeroAuth — wallet-based authentication for DERO. Users prove they own a DERO
            address via a Schnorr signature. No email, no password, no personal data. Like Sign-In With Ethereum,
            but for a privacy blockchain.
          </p>
        </div>
      </div>
    </section>

    {/* Principles */}
    <section className="pad" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div
        className="orb"
        style={{ width: "540px", height: "540px", top: "16%", left: "-12%", background: "rgba(49,223,144,.09)" }}
      />
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Principles</span>
          <h2>How we build</h2>
        </div>
        <div className="grid2">
          {principles.map((p) => (
            <div key={p.title} className="card">
              <div className="ibadge">{p.icon}</div>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Who builds DeroPay */}
    <section className="pad" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div className="wrap">
        <div className="prose">
          <h2>Who builds DeroPay?</h2>
          <p>
            DeroPay is built by <b>DHEBP</b> — an independent software organization focused on privacy
            infrastructure for the DERO ecosystem.
          </p>
          <p>
            DHEBP publishes software. DHEBP does not operate payment processing services, does not transmit or
            custody funds, and does not act as a money transmitter or financial institution.
          </p>
          <p>
            DHEBP is not affiliated with, endorsed by, or representative of the DERO Project or DERO core
            developers. &ldquo;DERO&rdquo; is used to describe compatibility with the DERO blockchain protocol.
          </p>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="pad">
      <div
        className="orb"
        style={{
          width: "820px",
          height: "520px",
          bottom: "-40%",
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(49,223,144,.18)",
        }}
      />
      <div className="wrap">
        <div className="cta-band">
          <h2>Start accepting DERO</h2>
          <p>Deploy the gateway, install a plugin, or drop a widget on your site. Everything is open source and free.</p>
          <div className="btns" style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
            <a className="btn btn-accent" href={DOCS_URL} target="_blank" rel="noopener noreferrer">
              Get started{" "}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <a className="btn btn-ghost" href={REPO_URL} target="_blank" rel="noopener noreferrer">
              View source
            </a>
          </div>
        </div>
      </div>
    </section>

    <style>{`
      .hero-c{max-width:720px;margin:0 auto;text-align:center;position:relative;z-index:1}
      .hero-c h1{font-family:var(--display);font-weight:800;font-size:clamp(2.4rem,5.2vw,3.8rem);line-height:1.05;letter-spacing:-.04em}
      .hero-c h1 .g{color:var(--accent)}
      .hero-c .lead{margin:22px auto 0;font-size:18px;line-height:1.65;color:var(--ts);max-width:54ch}
      .prose{max-width:720px;margin:0 auto}
      .prose h2{font-family:var(--display);font-weight:700;font-size:26px;letter-spacing:-.02em;margin-bottom:18px}
      .prose p{font-size:16px;line-height:1.8;color:var(--ts);margin-bottom:16px}
      .prose p:last-child{margin-bottom:0}
      .prose b{color:var(--tp);font-weight:600}
      .cta-band{text-align:center;max-width:560px;margin:0 auto;position:relative;z-index:1}
      .cta-band h2{font-family:var(--display);font-weight:700;font-size:clamp(1.9rem,4vw,2.8rem);letter-spacing:-.03em}
      .cta-band p{margin:14px auto 28px;font-size:16px;color:var(--ts);max-width:44ch}
    `}</style>
  </>
);
