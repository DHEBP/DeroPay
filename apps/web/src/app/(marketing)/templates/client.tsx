"use client";

import Link from "next/link";
import { REPO_URL, DOCS_URL } from "@/lib/site";

type Template = {
  id: string;
  title: string;
  tag: string;
  description: string;
  features: string[];
  stack: string[];
  icon: React.ReactNode;
};

const templates: Template[] = [
  {
    id: "hologram-store",
    title: "Hologram Store",
    tag: "Medusa v2 + Vite/React",
    description:
      "A streetwear storefront with a Vite + React frontend and Medusa v2 backend. Pre-configured with the medusa-payment-deropay plugin for accepting DERO alongside Stripe.",
    features: [
      "Product catalog with variants and images",
      "Cart and checkout flow",
      "DeroPay + Stripe payment providers",
      "Admin dashboard via Medusa",
      "Seed script with sample products",
    ],
    stack: ["Medusa v2", "React", "Vite", "TypeScript", "medusa-payment-deropay"],
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  {
    id: "marketplace",
    title: "DERO Marketplace",
    tag: "Next.js + SQLite",
    description:
      "A multi-vendor marketplace with buyer/seller flows, escrow checkout, and dispute resolution. Server-backed listings, invoices, and webhook processing with SQLite persistence.",
    features: [
      "Multi-vendor storefronts",
      "Buyer cart and checkout",
      "Seller listing management",
      "Invoice, router, and escrow rails",
      "Dispute and resolution flows",
    ],
    stack: ["Next.js 16", "React 19", "SQLite", "TypeScript", "Tailwind CSS"],
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16M9 13h6" />
      </svg>
    ),
  },
];

const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const GithubIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M12 2A10 10 0 0 0 8.8 21.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .3.3.6.9.6 1.8v2.7c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
  </svg>
);

const benefits = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
      </svg>
    ),
    title: "Production-Ready",
    description: "Not toy examples. Real architecture with auth, state management, and error handling.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m7.5 4.3 9 5.2v9L7.5 13.5zM7.5 4.3 12 1.7l9 5.2v9l-4.5 2.6M3 6.9l4.5 2.6v9L3 15.9z" />
      </svg>
    ),
    title: "Self-Contained",
    description: "Each template is a complete project. Clone, install, configure, run.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
    title: "Best Practices",
    description: "TypeScript, separation of concerns, env-based config, and test coverage.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </svg>
    ),
    title: "Community Maintained",
    description: "Open source under MIT. Contributions welcome — built by developers, for developers.",
  },
];

export const TemplatesPageClient = () => (
  <div className="templates-page">
    {/* Hero */}
    <section className="pad">
      <div className="grid-bg" />
      <div className="orb" style={{ width: "720px", height: "720px", top: "-32%", right: "18%", background: "rgba(49,223,144,.14)" }} />
      <div className="orb" style={{ width: "520px", height: "520px", top: "-6%", left: "10%", background: "rgba(217,198,163,.09)" }} />
      <div className="wrap">
        <div className="hero-c">
          <span className="eyebrow dot">Starter Templates</span>
          <h1 style={{ marginTop: "16px" }}>
            Clone, configure, <span className="g">start selling</span>.
          </h1>
          <p className="lead">
            Production-ready starter templates for building DERO commerce applications. Skip the
            boilerplate and focus on your product.
          </p>
        </div>
      </div>
    </section>

    {/* Templates Grid */}
    <section className="pad-sm" style={{ borderTop: "1px solid var(--color-border-soft)" }}>
      <div className="wrap">
        <div className="tpl-grid">
          {templates.map((template) => (
            <div key={template.id} className="glass tpl">
              <div className="banner">
                <div className="gp" />
                <div className="ic">{template.icon}</div>
                <div className="tag">{template.tag}</div>
                <h3>{template.title}</h3>
              </div>
              <div className="body">
                <p className="desc">{template.description}</p>
                <div className="lbl">What&apos;s included</div>
                <ul>
                  {template.features.map((feature) => (
                    <li key={feature}>
                      <CheckIcon />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="lbl">Tech stack</div>
                <div className="chips">
                  {template.stack.map((tech) => (
                    <span key={tech} className="chip">
                      {tech}
                    </span>
                  ))}
                </div>
                <div className="act">
                  <a
                    className="btn btn-accent"
                    href={`${REPO_URL}/tree/main/templates/${template.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <GithubIcon /> Clone template
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Why templates */}
    <section className="pad" style={{ borderTop: "1px solid var(--color-border-soft)" }}>
      <div className="orb" style={{ width: "540px", height: "540px", top: "16%", left: "-12%", background: "rgba(49,223,144,.09)" }} />
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Why templates</span>
          <h2>Skip months of boilerplate</h2>
        </div>
        <div className="grid2" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          {benefits.map((benefit) => (
            <div key={benefit.title} className="card">
              <div className="ibadge">{benefit.icon}</div>
              <h3>{benefit.title}</h3>
              <p>{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* How to use */}
    <section className="pad" style={{ borderTop: "1px solid var(--color-border-soft)" }}>
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Get going</span>
          <h2>How to use a template</h2>
        </div>
        <div className="steps">
          <div className="glass stp">
            <div className="t">
              <span className="b">1</span>
              <h3>Clone the template</h3>
            </div>
            <div className="cmd">npx degit DHEBP/DeroPay/templates/hologram-store my-store</div>
          </div>
          <div className="glass stp">
            <div className="t">
              <span className="b">2</span>
              <h3>Configure environment</h3>
            </div>
            <p>
              Copy{" "}
              <span className="mono" style={{ color: "var(--color-accent-strong)" }}>
                .env.example
              </span>{" "}
              to{" "}
              <span className="mono" style={{ color: "var(--color-accent-strong)" }}>
                .env
              </span>{" "}
              and set your DeroPay gateway URL, API key, and webhook secret. Point at your
              self-hosted gateway or the demo server for testing.
            </p>
          </div>
          <div className="glass stp">
            <div className="t">
              <span className="b">3</span>
              <h3>Start building</h3>
            </div>
            <p>
              Install dependencies and run the dev server. Each template includes seed data, mock
              payment modes, and developer tools to help you iterate quickly.
            </p>
          </div>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="pad">
      <div className="orb" style={{ width: "820px", height: "520px", bottom: "-40%", left: "50%", transform: "translateX(-50%)", background: "rgba(49,223,144,.18)" }} />
      <div className="wrap">
        <div className="cta-band">
          <h2>Build something new?</h2>
          <p>
            Want to contribute a template? We welcome community submissions — check the contributing
            guide to get started.
          </p>
          <div className="btns" style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
            <a className="btn btn-accent" href={REPO_URL} target="_blank" rel="noopener noreferrer">
              View on GitHub{" "}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <Link className="btn btn-ghost" href={DOCS_URL}>
              Read the docs
            </Link>
          </div>
        </div>
      </div>
    </section>

    <style>{`
      .templates-page{
        --accent:var(--color-accent);
        --accent-strong:var(--color-accent-strong);
        --accent-glow:var(--color-accent-glow);
        --ts:var(--color-text-secondary);
        --tt:var(--color-text-tertiary);
        --border-soft:var(--color-border-soft);
        --display:var(--font-display);
        --body:var(--font-sans);
        --mono:var(--font-mono);
      }
      .hero-c{max-width:720px;margin:0 auto;text-align:center;position:relative;z-index:1}
      .hero-c h1{font-family:var(--display);font-weight:800;font-size:clamp(2.5rem,5.4vw,4rem);line-height:1.05;letter-spacing:-.04em}
      .hero-c h1 .g{color:var(--accent)}
      .hero-c .lead{margin:22px auto 0;font-size:18px;line-height:1.65;color:var(--ts);max-width:52ch}
      /* template cards */
      .tpl-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}
      @media(max-width:900px){.tpl-grid{grid-template-columns:1fr}}
      .tpl{display:flex;flex-direction:column;overflow:hidden;padding:0}
      .tpl .banner{position:relative;overflow:hidden;padding:30px 26px 24px;border-bottom:1px solid var(--border-soft);background:radial-gradient(130% 120% at 16% 0%,rgba(49,223,144,.14),transparent 56%)}
      .tpl .banner .gp{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:26px 26px;-webkit-mask-image:radial-gradient(circle at 18% -10%,#000,transparent 68%);mask-image:radial-gradient(circle at 18% -10%,#000,transparent 68%);opacity:.7;pointer-events:none}
      .tpl .ic{position:relative;width:56px;height:56px;border-radius:15px;background:linear-gradient(135deg,var(--accent),#1c9c62);color:#051008;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 30px -12px var(--accent-glow);margin-bottom:18px}
      .tpl .tag{position:relative;font-family:var(--body);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--accent-strong)}
      .tpl h3{position:relative;font-family:var(--display);font-weight:700;font-size:24px;letter-spacing:-.02em;margin-top:6px}
      .tpl .body{padding:26px;display:flex;flex-direction:column;flex:1}
      .tpl .desc{font-size:14.5px;line-height:1.65;color:var(--ts);margin-bottom:20px}
      .tpl .lbl{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:var(--tt);margin-bottom:11px}
      .tpl ul{list-style:none;display:flex;flex-direction:column;gap:8px;margin-bottom:20px}
      .tpl li{display:flex;gap:9px;font-size:13.5px;color:var(--ts)}
      .tpl li svg{color:var(--accent);flex:none;margin-top:3px}
      .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
      .chip{font-family:var(--mono);font-size:11.5px;font-weight:500;color:var(--ts);background:rgba(255,255,255,.03);border:1px solid var(--border-soft);border-radius:7px;padding:4px 10px}
      .tpl .act{margin-top:auto}
      .tpl .act .btn{width:100%;justify-content:center}
      /* steps */
      .steps{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
      .stp{padding:22px}
      .stp .t{display:flex;align-items:center;gap:12px;margin-bottom:12px}
      .stp .b{width:28px;height:28px;border-radius:50%;background:var(--accent);color:#051008;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex:none}
      .stp h3{font-family:var(--display);font-weight:600;font-size:16px}
      .stp p{font-size:14px;color:var(--ts);line-height:1.6}
      .stp .cmd{margin-top:2px;padding:13px 16px;border-radius:10px;background:rgba(9,11,10,.9);border:1px solid var(--border-soft);font-family:var(--mono);font-size:13px;color:var(--accent-strong);overflow:auto}
      .cta-band{text-align:center;position:relative;z-index:1;max-width:600px;margin:0 auto}
      .cta-band h2{font-family:var(--display);font-weight:700;font-size:clamp(1.9rem,4vw,2.8rem);letter-spacing:-.03em}
      .cta-band p{margin:14px auto 28px;font-size:16px;color:var(--ts);max-width:44ch}
      @media(max-width:900px){.grid2[style]{grid-template-columns:1fr 1fr!important}}
      @media(max-width:600px){.grid2[style]{grid-template-columns:1fr!important}}
    `}</style>
  </div>
);
