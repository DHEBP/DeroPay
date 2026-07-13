"use client";

import Link from "next/link";
import { REPO_URL, DOCS_URL } from "@/lib/site";

const features = [
  {
    title: "Schnorr on BN256",
    description:
      "Pure-TypeScript signature verification via @noble/curves. No wallet needed server-side — just math.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
      </svg>
    ),
  },
  {
    title: "JWT Sessions",
    description:
      "Standard token sessions with 24-hour expiry. Compatible with any session middleware.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="8" cy="15" r="4" />
        <path d="m10.85 12.15 7-7M18 5l2 2M15 8l2 2" />
      </svg>
    ),
  },
  {
    title: "Domain-Bound Challenges",
    description:
      "SIWE-style messages tied to your domain with nonce-based replay protection. 5-minute expiry.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" />
      </svg>
    ),
  },
  {
    title: "Zero Personal Data",
    description:
      "No email, no password, no name. Just a cryptographic address that reveals nothing about on-chain activity.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "XSWD Protocol",
    description:
      "WebSocket connection to DERO wallets (Engram, CLI). No browser extension required.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 9h6v6H9z" />
      </svg>
    ),
  },
  {
    title: "Redis-Ready",
    description:
      "Atomic nonce consumption with Lua scripts for distributed deployments. In-memory for dev.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      </svg>
    ),
  },
];

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const TickIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const AuthPageClient = () => (
  <div className="auth-page">
    {/* HERO */}
    <section className="pad">
      <div className="grid-bg" />
      <div className="orb" style={{ width: "720px", height: "720px", top: "-32%", left: "12%", background: "rgba(49,223,144,.15)" }} />
      <div className="orb" style={{ width: "560px", height: "560px", top: "-6%", right: "-12%", background: "rgba(217,198,163,.09)" }} />
      <div className="wrap">
        <div className="hero-grid">
          <div className="hero">
            <span className="eyebrow dot">DeroAuth</span>
            <h1>
              Sign in with your <span className="g">DERO wallet</span>.
            </h1>
            <p className="lead">
              No email. No password. Just a cryptographic proof of wallet
              ownership — privacy-preserving auth that never exposes your
              transaction history.
            </p>
            <div className="btns">
              <Link className="btn btn-accent" href="/playground">
                Get started
                <ArrowIcon />
              </Link>
              <a className="btn btn-ghost" href={REPO_URL} target="_blank" rel="noopener noreferrer">
                View source
              </a>
            </div>
            <div className="checks">
              <span>
                <CheckIcon />
                Zero personal data
              </span>
              <span>
                <CheckIcon />
                Pure TypeScript
              </span>
              <span>
                <CheckIcon />
                JWT sessions
              </span>
            </div>
          </div>

          {/* auth flow card */}
          <div style={{ position: "relative" }}>
            <div className="halo" />
            <div className="glass authcard" style={{ position: "relative" }}>
              <div className="row done">
                <span className="st">01</span>
                <div>
                  <div className="lb">Connect wallet</div>
                  <div className="sb">XSWD to Engram / CLI — no extension</div>
                </div>
                <span className="tick">
                  <TickIcon />
                </span>
              </div>
              <div className="row done">
                <span className="st">02</span>
                <div>
                  <div className="lb">Sign challenge</div>
                  <div className="sb">Domain-bound message · nonce · 5-min expiry</div>
                </div>
                <span className="tick">
                  <TickIcon />
                </span>
              </div>
              <div className="row now">
                <span className="st">03</span>
                <div>
                  <div className="lb">Verify signature</div>
                  <div className="sb">Schnorr on BN256 · @noble/curves</div>
                </div>
              </div>
              <div className="row wait">
                <span className="st">04</span>
                <div>
                  <div className="lb">Issue JWT session</div>
                  <div className="sb">24-hour token, any session middleware</div>
                </div>
              </div>
              <div className="jwt">session.token = eyJhbGciOiJIUzI1NiIs…9f · address: dero1qy…8f3a2c</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* FEATURES */}
    <section className="pad-sm" style={{ borderTop: "1px solid var(--color-border-soft)" }}>
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Features</span>
          <h2>Built for privacy</h2>
          <p>
            Unlike Ethereum auth, signing in with DERO doesn&rsquo;t expose your
            transaction history.
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

    {/* QUICK START */}
    <section className="pad" style={{ borderTop: "1px solid var(--color-border-soft)" }}>
      <div className="orb" style={{ width: "520px", height: "520px", bottom: "-20%", left: "-10%", background: "rgba(49,223,144,.08)" }} />
      <div className="wrap" style={{ maxWidth: "760px", position: "relative", zIndex: 1 }}>
        <div className="head">
          <span className="eyebrow">Quick start</span>
          <h2>A few lines of code</h2>
          <p>Drop-in React component and Next.js API handlers. Production-ready out of the box.</p>
        </div>
        <div className="code">
          <div className="bar">
            <i style={{ background: "#ff5f57" }} />
            <i style={{ background: "#febc2e" }} />
            <i style={{ background: "#28c840" }} />
            <span className="fname">auth-example.tsx</span>
          </div>
          <pre>
            <span className="k">import</span> {"{ SignInWithDero } "}
            <span className="k">from</span> <span className="s">&quot;dero-auth/react&quot;</span>;{"\n"}
            <span className="k">import</span> {"{ createAuthHandlers } "}
            <span className="k">from</span> <span className="s">&quot;dero-auth/next&quot;</span>;{"\n"}
            {"\n"}
            <span className="c">// React: drop-in button</span>
            {"\n"}
            <span className="k">export function</span> <span className="f">LoginPage</span>() {"{"}
            {"\n"}
            {"  "}<span className="k">return</span> {"<"}
            <span className="f">SignInWithDero</span> onSuccess={"{"}(s) =&gt; console.
            <span className="f">log</span>(s.address){"}"} /&gt;;{"\n"}
            {"}"}
            {"\n"}
            {"\n"}
            <span className="c">// Next.js: API route handlers</span>
            {"\n"}
            <span className="k">export const</span> {"{ GET, POST } "}={" "}
            <span className="f">createAuthHandlers</span>({"{"}
            {"\n"}
            {"  "}jwtSecret: process.env.<span className="f">JWT_SECRET</span>!,{"\n"}
            {"  "}domain: <span className="s">&quot;myapp.com&quot;</span>,{"\n"}
            {"}"});
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
            Ship <span className="g">private</span> auth today.
          </h2>
          <p>Add wallet login in a few lines — no email, no password, no personal data.</p>
          <div className="btns" style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
            <Link className="btn btn-accent" href="/playground">
              Get started
              <ArrowIcon />
            </Link>
            <a className="btn btn-ghost" href={DOCS_URL} target="_blank" rel="noopener noreferrer">
              Read the docs
            </a>
          </div>
        </div>
      </div>
    </section>

    <style>{`
      .auth-page{
        --accent:var(--color-accent);
        --accent-strong:var(--color-accent-strong);
        --accent-dim:var(--color-accent-dim);
        --ts:var(--color-text-secondary);
        --tt:var(--color-text-tertiary);
        --border-soft:var(--color-border-soft);
        --border-strong:var(--color-border-strong);
        --display:var(--font-display);
        --body:var(--font-sans);
        --mono:var(--font-mono);
      }
      .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;position:relative;z-index:1}
      @media(max-width:960px){.hero-grid{grid-template-columns:1fr;gap:40px}}
      .hero h1{font-family:var(--display);font-weight:800;font-size:clamp(2.6rem,5.2vw,4.2rem);line-height:1.04;letter-spacing:-.04em;max-width:14ch}
      .hero h1 .g{color:var(--accent)}
      .hero .lead{margin-top:22px;font-size:18px;line-height:1.65;color:var(--ts);max-width:46ch}
      .hero .btns{margin-top:30px;display:flex;gap:14px;flex-wrap:wrap}
      .checks{margin-top:28px;display:flex;gap:20px;flex-wrap:wrap;font-weight:600;font-size:13px;color:var(--tt)}
      .checks span{display:inline-flex;align-items:center;gap:7px}
      .checks svg{width:15px;height:15px;color:var(--accent)}
      .halo{position:absolute;inset:-8% -6%;background:radial-gradient(ellipse at 30% 45%,rgba(49,223,144,.16),transparent 62%);filter:blur(50px);z-index:0;pointer-events:none}

      /* auth flow card */
      .authcard{padding:26px;position:relative}
      .authcard .row{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--border-soft)}
      .authcard .row:last-child{border-bottom:0}
      .authcard .st{width:34px;height:34px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:13px;font-weight:600}
      .authcard .row.done .st{background:var(--accent-dim);color:var(--accent)}
      .authcard .row.now .st{background:var(--accent);color:#051008}
      .authcard .row.wait .st{background:rgba(255,255,255,.04);color:var(--tt);border:1px solid var(--border-soft)}
      .authcard .lb{font-family:var(--display);font-weight:600;font-size:15px}
      .authcard .sb{font-size:12.5px;color:var(--ts);margin-top:2px}
      .authcard .tick{margin-left:auto;color:var(--accent)}
      .authcard .jwt{margin-top:18px;padding:12px 14px;border-radius:12px;background:rgba(49,223,144,.06);border:1px solid var(--border-strong);font-family:var(--mono);font-size:11.5px;color:var(--accent-strong);word-break:break-all}

      /* cta */
      .cta-band{text-align:center;position:relative;z-index:1;max-width:680px;margin:0 auto}
      .cta-band h2{font-family:var(--display);font-weight:700;font-size:clamp(2rem,4.5vw,3.2rem);letter-spacing:-.04em;line-height:1.05}
      .cta-band h2 .g{color:var(--accent)}
      .cta-band p{margin:16px auto 30px;font-size:17px;color:var(--ts);max-width:44ch}
    `}</style>
  </div>
);
