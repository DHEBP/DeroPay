"use client";

import { DeroIcon } from "@/components/icons/dero-icon";
import { DOCS_URL } from "@/lib/site";

export const DashboardPageClient = () => (
  <>
    <section className="pad">
      <div className="grid-bg" />
      <div
        className="orb"
        style={{ width: "700px", height: "700px", top: "-30%", left: "14%", background: "rgba(49,223,144,.13)" }}
      />
      <div className="wrap">
        <div className="hero-c">
          <span className="eyebrow dot">Self-Hosted</span>
          <h1 style={{ marginTop: "16px" }}>
            Merchant <span className="g">Dashboard</span>.
          </h1>
          <p className="lead">
            A self-hosted admin UI for managing invoices, payments, escrow operations, and wallet status. Runs on
            your infrastructure.
          </p>
        </div>
      </div>
    </section>

    <section className="pad-sm" style={{ borderTop: "1px solid var(--color-border-soft)" }}>
      <div className="wrap">
        <div className="glass dash">
          <div className="dash-lay">
            <div className="dash-side">
              <div className="lg">
                <DeroIcon size={18} className="text-[var(--color-accent-strong)]" />DeroPay
              </div>
              <a className="on">Dashboard</a>
              <a>Invoices</a>
              <a>Escrow</a>
              <a>Settings</a>
            </div>
            <div className="dash-main">
              <div className="dash-top">
                <div>
                  <h3>Dashboard</h3>
                  <div className="sub">Welcome back · Wallet connected</div>
                </div>
                <div className="dash-sync">
                  <span className="d" />
                  Synced
                </div>
              </div>
              <div className="stats">
                <div className="stat">
                  <div className="l">Balance</div>
                  <div className="v">1,247.5 DERO</div>
                </div>
                <div className="stat">
                  <div className="l">Invoices</div>
                  <div className="v">342</div>
                </div>
                <div className="stat">
                  <div className="l">Revenue (30d)</div>
                  <div className="v">89.2 DERO</div>
                </div>
                <div className="stat">
                  <div className="l">Active escrows</div>
                  <div className="v">7</div>
                </div>
              </div>
              <div className="invs">
                <div className="h">Recent invoices</div>
                <div className="r">
                  <span className="id">INV-0342</span>
                  <span className="am">5.0 DERO</span>
                  <span style={{ color: "#34d399" }}>completed</span>
                </div>
                <div className="r">
                  <span className="id">INV-0341</span>
                  <span className="am">25.0 DERO</span>
                  <span style={{ color: "var(--color-accent)" }}>confirming</span>
                </div>
                <div className="r">
                  <span className="id">INV-0340</span>
                  <span className="am">12.5 DERO</span>
                  <span style={{ color: "#facc15" }}>pending</span>
                </div>
                <div className="r">
                  <span className="id">INV-0339</span>
                  <span className="am">100.0 DERO</span>
                  <span style={{ color: "var(--color-text-tertiary)" }}>expired</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="pad" style={{ borderTop: "1px solid var(--color-border-soft)" }}>
      <div
        className="orb"
        style={{ width: "540px", height: "540px", top: "16%", right: "-12%", background: "rgba(49,223,144,.09)" }}
      />
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Features</span>
          <h2>Everything in one panel</h2>
        </div>
        <div className="grid3">
          <div className="card">
            <div className="ibadge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 2h12l4 4v16H4z" />
                <path d="M8 7h6M8 11h8M8 15h5" />
              </svg>
            </div>
            <h3>Invoice Management</h3>
            <p>Create, filter, and view invoice details with full lifecycle tracking.</p>
          </div>
          <div className="card">
            <div className="ibadge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3>Escrow Operations</h3>
            <p>Deploy contracts, monitor status, and perform escrow actions from the UI.</p>
          </div>
          <div className="card">
            <div className="ibadge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 7h20v10H2zM16 12h.01" />
              </svg>
            </div>
            <h3>Wallet Status</h3>
            <p>Live balance, connection status, and RPC health monitoring.</p>
          </div>
          <div className="card">
            <div className="ibadge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <h3>Payment History</h3>
            <p>Full transaction log with confirmation tracking and webhook delivery status.</p>
          </div>
          <div className="card">
            <div className="ibadge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
            </div>
            <h3>Statistics</h3>
            <p>Revenue totals, payment counts, success rates, and average confirmation times.</p>
          </div>
          <div className="card">
            <div className="ibadge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.3 1a7 7 0 0 0-1.7-1L16.5 2h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.5L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5a7 7 0 0 0 .1-1Z" />
              </svg>
            </div>
            <h3>Configuration</h3>
            <p>Wallet RPC URLs, webhook settings, TTL defaults, and polling intervals.</p>
          </div>
        </div>
      </div>
    </section>

    <section className="pad">
      <div className="wrap">
        <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
          <p style={{ fontSize: "16px", color: "var(--color-text-secondary)" }}>
            The dashboard ships in the{" "}
            <span className="mono" style={{ color: "var(--color-accent-strong)" }}>
              dero-pay
            </span>{" "}
            package and runs as a standalone Next.js app.
          </p>
          <div style={{ marginTop: "22px", display: "flex", justifyContent: "center" }}>
            <a className="btn btn-accent" href={`${DOCS_URL}/guides/merchant-dashboard`}>
              Setup guide{" "}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>

    <style>{`
      .hero-c { max-width: 720px; margin: 0 auto; text-align: center; position: relative; z-index: 1; }
      .hero-c h1 { font-family: var(--font-display); font-weight: 800; font-size: clamp(2.4rem, 5.2vw, 3.8rem); line-height: 1.05; letter-spacing: -.04em; }
      .hero-c h1 .g { color: var(--color-accent); }
      .hero-c .lead { margin: 22px auto 0; font-size: 18px; line-height: 1.65; color: var(--color-text-secondary); max-width: 52ch; }

      /* mock dashboard */
      .dash { max-width: 940px; margin: 0 auto; overflow: hidden; padding: 0; position: relative; z-index: 1; }
      .dash-lay { display: flex; min-height: 440px; }
      .dash-side { width: 196px; border-right: 1px solid var(--color-border-soft); background: rgba(9,11,10,.5); padding: 18px; flex: none; }
      .dash-side .lg { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; font-family: var(--font-display); font-weight: 700; font-size: 14px; }
      .dash-side .lg .mk { width: 20px; height: 20px; border-radius: 6px; background: var(--color-accent); color: #051008; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; }
      .dash-side a { display: block; padding: 8px 12px; border-radius: 8px; font-size: 12.5px; font-weight: 500; color: var(--color-text-secondary); margin-bottom: 3px; }
      .dash-side a.on { background: var(--color-accent-dim); color: var(--color-accent); }
      .dash-main { flex: 1; padding: 24px; }
      .dash-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
      .dash-top h3 { font-family: var(--font-display); font-weight: 700; font-size: 18px; }
      .dash-top .sub { font-size: 12px; color: var(--color-text-tertiary); }
      .dash-sync { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--color-text-secondary); }
      .dash-sync .d { width: 8px; height: 8px; border-radius: 50%; background: var(--color-accent); }
      .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
      .stat { border: 1px solid var(--color-border-soft); border-radius: 12px; background: rgba(9,11,10,.5); padding: 14px; }
      .stat .l { font-size: 10px; color: var(--color-text-tertiary); }
      .stat .v { margin-top: 5px; font-family: var(--font-mono); font-size: 14px; font-weight: 600; color: var(--color-accent); font-variant-numeric: tabular-nums; }
      .invs { border: 1px solid var(--color-border-soft); border-radius: 12px; background: rgba(9,11,10,.5); overflow: hidden; }
      .invs .h { padding: 11px 16px; border-bottom: 1px solid var(--color-border-soft); font-size: 12px; color: var(--color-text-secondary); }
      .invs .r { display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; border-bottom: 1px solid rgba(30,42,36,.5); font-family: var(--font-mono); font-size: 12px; }
      .invs .r:last-child { border-bottom: 0; }
      .invs .id { color: var(--color-text-secondary); }
      .invs .am { color: var(--color-text-primary); }

      @media (max-width: 760px) {
        .dash-side { display: none; }
        .stats { grid-template-columns: repeat(2, 1fr); }
      }
    `}</style>
  </>
);
