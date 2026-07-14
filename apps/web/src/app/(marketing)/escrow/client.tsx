"use client";

import Link from "next/link";
import { REPO_URL, DOCS_URL } from "@/lib/site";

const statusCodes = [
  { code: 0, label: "awaiting_deposit", color: "var(--ts)", dot: "var(--tt)" },
  { code: 1, label: "funded", color: "var(--accent)", dot: "var(--accent)" },
  { code: 2, label: "released", color: "#34d399", dot: "#34d399" },
  { code: 3, label: "refunded", color: "#facc15", dot: "#facc15" },
  { code: 4, label: "expired_claimed", color: "#f59e0b", dot: "#f59e0b" },
  { code: 5, label: "disputed", color: "#ef4444", dot: "#ef4444" },
  { code: 6, label: "arbitrated", color: "#60a5fa", dot: "#60a5fa" },
];

const features = [
  {
    title: "On-Chain Security",
    description:
      "Funds are locked in a DERO smart contract. No one moves them without meeting the contract conditions.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    title: "Arbitration",
    description:
      "Designate a neutral arbitrator who resolves disputes. Buyer gets a refund or seller gets paid.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18M5 7l7-4 7 4M3 11h6l-3 6a3 3 0 0 1-6 0Zm12 0h6l-3 6a3 3 0 0 1-6 0Z" />
      </svg>
    ),
  },
  {
    title: "Platform Fees",
    description:
      "Automatic fee deduction on successful transactions. Configurable percentage collected by the contract owner.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M9 9.5a3 3 0 0 1 6 0M9 14.5a3 3 0 0 0 6 0" />
      </svg>
    ),
  },
  {
    title: "Block Expiration",
    description:
      "Escrows expire after a configurable number of blocks. Seller can claim funds after the window.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  {
    title: "Dispute Resolution",
    description:
      "Buyers can dispute before confirming delivery. Disputes lock funds until the arbitrator resolves them.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2 4 6v6c0 5 8 8 8 8s8-3 8-8V6z" />
        <path d="M12 8v4M12 16v.01" />
      </svg>
    ),
  },
  {
    title: "DVM-BASIC Contracts",
    description:
      "Open-source smart contracts in DERO’s native language. Auditable, immutable, transparent.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 2h12l4 4v16H4z" />
        <path d="m8 13 2 2 4-4" />
      </svg>
    ),
  },
];

const arrow = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const EscrowPageClient = () => (
  <>
    {/* HERO */}
    <section className="pad">
      <div className="grid-bg" />
      <div className="orb" style={{ width: "760px", height: "760px", top: "-34%", left: "30%", background: "rgba(49,223,144,.14)" }} />
      <div className="orb" style={{ width: "520px", height: "520px", top: "-6%", right: "12%", background: "rgba(217,198,163,.09)" }} />
      <div className="wrap">
        <div className="hero-c">
          <span className="eyebrow dot">Escrow</span>
          <h1 style={{ marginTop: "16px" }}>
            Trustless payments with <span className="g">smart-contract escrow</span>.
          </h1>
          <p className="lead">
            Each transaction deploys a fresh smart contract — isolated state, buyer protection,
            arbitration, and dispute resolution. One contract per deal, no shared risk.
          </p>
          <div className="btns">
            <Link className="btn btn-accent" href="/playground">
              Get started {arrow}
            </Link>
            <a
              className="btn btn-ghost"
              href={`${REPO_URL}/blob/main/packages/dero-pay/contracts/escrow.bas`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View contracts
            </a>
          </div>
        </div>
      </div>
    </section>

    {/* CONTRACT STATES — 7-state ledger */}
    <section className="pad-sm" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Contract states</span>
          <h2>Seven states, every path covered</h2>
          <p>
            The escrow contract tracks every possible resolution — release, refund, expiry, or
            arbitration.
          </p>
        </div>
        <div className="glass ledger">
          {statusCodes.map((s) => (
            <div className="r" key={s.code}>
              <span className="c tnum">{s.code}</span>
              <span className="s" style={{ color: s.color }}>
                {s.label}
              </span>
              <span className="dot" style={{ background: s.dot }} />
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* FEATURES */}
    <section className="pad" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div className="orb" style={{ width: "540px", height: "540px", top: "16%", right: "-12%", background: "rgba(49,223,144,.09)" }} />
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Features</span>
          <h2>Buyer protection, on-chain</h2>
          <p>Isolated contract per deal, backed by DERO’s blockchain.</p>
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

    {/* CODE */}
    <section className="pad" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div className="wrap" style={{ maxWidth: "760px", position: "relative", zIndex: 1 }}>
        <div className="head">
          <span className="eyebrow">Quick start</span>
          <h2>Deploy an escrow in code</h2>
          <p>The EscrowManager handles deployment, lifecycle polling, and event handling.</p>
        </div>
        <div className="code">
          <div className="bar">
            <i style={{ background: "#ff5f57" }} />
            <i style={{ background: "#febc2e" }} />
            <i style={{ background: "#28c840" }} />
            <span className="fname">escrow-example.ts</span>
          </div>
          <pre>
            <span className="k">import</span> {"{ EscrowManager } "}
            <span className="k">from</span> <span className="s">&quot;dero-pay/escrow&quot;</span>;{"\n"}
            <span className="k">import</span> {"{ deroToAtomic } "}
            <span className="k">from</span> <span className="s">&quot;dero-pay&quot;</span>;{"\n"}
            {"\n"}
            <span className="k">const</span> manager ={" "}
            <span className="k">new</span> <span className="f">EscrowManager</span>({"{"}
            {"\n"}
            {"  "}walletRpcUrl:{" "}
            <span className="s">&quot;http://127.0.0.1:10103/json_rpc&quot;</span>,{"\n"}
            {"}"});{"\n"}
            {"\n"}
            <span className="k">const</span> escrow = <span className="k">await</span>{" "}
            manager.<span className="f">create</span>({"{"}
            {"\n"}
            {"  "}seller: <span className="s">&quot;dero1qy…seller&quot;</span>,{"\n"}
            {"  "}arbitrator: <span className="s">&quot;dero1qy…arbitrator&quot;</span>,{"\n"}
            {"  "}amount: <span className="f">deroToAtomic</span>(
            <span className="s">&quot;100.0&quot;</span>),{"\n"}
            {"  "}feeBasisPoints: <span className="n">200</span>,{"      "}
            <span className="c">// 2%</span>
            {"\n"}
            {"  "}expiryBlocks: <span className="n">720</span>,{"\n"}
            {"}"});{"\n"}
            {"\n"}
            console.<span className="f">log</span>(<span className="s">&quot;SCID:&quot;</span>,
            {" "}escrow.scid);{"\n"}
            manager.<span className="f">on</span>(<span className="s">&quot;funded&quot;</span>, (e) =&gt;
            {" "}console.<span className="f">log</span>(
            <span className="s">&quot;Deposited:&quot;</span>, e.amount));
          </pre>
        </div>
      </div>
    </section>

    {/* ESCROW vs. PAYMENT ROUTER callout */}
    <section className="pad-sm">
      <div className="wrap">
        <div className="glass callout">
          <span className="eyebrow">Need faster payments?</span>
          <h3>Escrow vs. Payment Router</h3>
          <p>
            Escrow deploys a fresh contract per transaction for buyer protection. The Payment Router
            deploys once and handles unlimited instant payments. Use both, or pick the one that fits.
          </p>
          <Link className="btn btn-ghost btn-sm" href="/pay">
            Compare the two {arrow}
          </Link>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="pad">
      <div className="orb" style={{ width: "820px", height: "520px", bottom: "-40%", left: "50%", transform: "translateX(-50%)", background: "rgba(49,223,144,.18)" }} />
      <div className="wrap">
        <div className="cta-band">
          <h2>
            Ship <span className="g">trustless</span> deals.
          </h2>
          <p>
            Deploy per-transaction escrow with arbitration and dispute resolution, backed by DERO.
          </p>
          <div className="btns" style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
            <Link className="btn btn-accent" href="/playground">
              Get started {arrow}
            </Link>
            <a
              className="btn btn-ghost"
              href={`${REPO_URL}/blob/main/packages/dero-pay/contracts/escrow.bas`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View contracts
            </a>
          </div>
        </div>
      </div>
    </section>

    <style>{`
      .hero-c{max-width:760px;margin:0 auto;text-align:center;position:relative;z-index:1}
      .hero-c h1{font-family:var(--display);font-weight:800;font-size:clamp(2.5rem,5.4vw,4rem);line-height:1.05;letter-spacing:-.04em}
      .hero-c h1 .g{color:var(--accent)}
      .hero-c .lead{margin:22px auto 0;font-size:18px;line-height:1.65;color:var(--ts);max-width:56ch}
      .hero-c .btns{margin-top:30px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap}

      /* status ledger */
      .ledger{max-width:560px;margin:0 auto;overflow:hidden}
      .ledger .r{display:flex;align-items:center;gap:16px;padding:13px 20px;border-bottom:1px solid var(--border-soft)}
      .ledger .r:last-child{border-bottom:0}
      .ledger .c{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--tt);width:16px}
      .ledger .s{font-family:var(--mono);font-size:13.5px;font-weight:500}
      .ledger .dot{width:8px;height:8px;border-radius:50%;margin-left:auto}

      /* callout */
      .callout{max-width:720px;margin:0 auto;text-align:center;padding:34px 28px}
      .callout h3{font-family:var(--display);font-weight:700;font-size:22px;letter-spacing:-.02em;margin:12px 0}
      .callout p{font-size:15px;line-height:1.6;color:var(--ts);max-width:500px;margin:0 auto 20px}

      /* cta */
      .cta-band{text-align:center;position:relative;z-index:1;max-width:680px;margin:0 auto}
      .cta-band h2{font-family:var(--display);font-weight:700;font-size:clamp(2rem,4.5vw,3.2rem);letter-spacing:-.04em;line-height:1.05}
      .cta-band h2 .g{color:var(--accent)}
      .cta-band p{margin:16px auto 30px;font-size:17px;color:var(--ts);max-width:44ch}
    `}</style>
  </>
);
