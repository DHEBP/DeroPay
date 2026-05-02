"use client";

import { motion } from "framer-motion";
import {
  Shield,
  Store,
  Users,
  Wallet,
  CreditCard,
  Globe,
  ArrowRight,
  Check,
  Clock,
  FileText,
  Headphones,
  Lock,
  Wrench,
  Zap,
} from "lucide-react";

const audiences = [
  {
    icon: <Store size={22} />,
    title: "Small Business Owner",
    description:
      "Heard about crypto payments, doesn't know where to start. Need end-to-end setup: wallet, plugin, test transaction.",
  },
  {
    icon: <Shield size={22} />,
    title: "Privacy-Conscious Merchant",
    description:
      "Wants to accept crypto but doesn't want their identity tied to their business. LLC + crypto setup + WHOIS cleanup.",
  },
  {
    icon: <Users size={22} />,
    title: "Creator / Freelancer",
    description:
      "Accept tips or payments in crypto without doxxing yourself. Anonymous wallet + payment link + privacy audit.",
  },
  {
    icon: <Wallet size={22} />,
    title: "DERO Community Member",
    description:
      "Sell goods or services for DERO but not technical. DeroPay integration (WooCommerce, Medusa, or API) + hosting guidance.",
  },
  {
    icon: <CreditCard size={22} />,
    title: "Existing Crypto Merchant",
    description:
      "Already accepts Bitcoin, wants to add DERO or improve privacy. DeroPay add-on + privacy review of existing setup.",
  },
  {
    icon: <Globe size={22} />,
    title: "International Seller",
    description:
      "Accept crypto to avoid payment processor restrictions. Crypto payment setup + international freedom guidance.",
  },
];

const tiers = [
  {
    name: "Quick Start",
    price: "$150",
    time: "1 hour",
    description: "Guided walkthrough for technical-ish merchants.",
    features: [
      "1-hour video call (Jitsi)",
      "Wallet setup walkthrough",
      "DeroPay plugin install or API config",
      "Test transaction on mainnet",
      "Q&A on invoices, webhooks, escrow",
    ],
    featured: false,
  },
  {
    name: "Full Setup",
    price: "$350",
    time: "2–4 hours",
    description: "We do the technical work for you.",
    features: [
      "Everything in Quick Start",
      "Hands-on plugin/API installation",
      "Wallet + webhook configuration",
      "Real transaction testing",
      "Custom setup documentation",
      "30 days email support",
    ],
    featured: false,
  },
  {
    name: "Privacy Package",
    price: "$750",
    time: "4–8 hours",
    description: "Crypto payments + full privacy audit.",
    features: [
      "Everything in Full Setup",
      "WHOIS privacy check",
      "Email security audit (SPF/DKIM/DMARC)",
      "Website privacy scan",
      "Threat model assessment",
      "Written privacy report",
      "Referrals to LLC formation & data removal",
    ],
    featured: true,
  },
  {
    name: "Turnkey Business",
    price: "$1,500–2,500",
    time: "1–2 weeks",
    description: "Anonymous entity + crypto payments + clean footprint.",
    features: [
      "Everything in Privacy Package",
      "Anonymous LLC formation (WY/NM/DE)",
      "Data broker removal coordination",
      "Domain privacy + WHOIS protection",
      "Email security hardening",
      "Business email on your domain",
    ],
    featured: false,
  },
];

const steps = [
  {
    icon: <Headphones size={20} />,
    title: "Book a call",
    description: "15-minute discovery call to understand your situation and recommend a tier.",
  },
  {
    icon: <Wrench size={20} />,
    title: "We assess & build",
    description: "We set up your crypto payments and audit your privacy (tier-dependent).",
  },
  {
    icon: <FileText size={20} />,
    title: "You get documentation",
    description: "Custom setup docs so you can maintain everything yourself.",
  },
  {
    icon: <Zap size={20} />,
    title: "You're live",
    description: "Accepting crypto, privately. With 30 days of follow-up support.",
  },
];

const findings = [
  { problem: "WHOIS exposes home address", solution: "LLC formation via Default Privacy" },
  { problem: "Email domain has no SPF/DKIM", solution: "Fixed during engagement" },
  { problem: "Website has 14 trackers", solution: "Alternatives from 886-tool directory" },
  { problem: "Personal info on data broker sites", solution: "Data removal via Optery" },
  { problem: "Using KYC-required processor", solution: "Migrate to DeroPay" },
  { problem: "No business entity", solution: "LLC formation (WY/NM/DE)" },
];

export const ServicesPageClient = () => (
  <>
    {/* Hero */}
    <section
      style={{
        borderBottom: "1px solid #1e2a24",
        background: "#000",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-30%",
            right: "20%",
            width: "700px",
            height: "700px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(49,223,144,0.12) 0%, transparent 65%)",
            filter: "blur(100px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "10%",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(147,51,234,0.15) 0%, transparent 60%)",
            filter: "blur(100px)",
          }}
        />
      </div>
      <div
        style={{
          position: "relative",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "48px 24px 56px",
          zIndex: 1,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <p
            style={{
              marginBottom: "16px",
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#31df90",
            }}
          >
            Merchant Onboarding
          </p>
          <h1
            style={{
              fontSize: "clamp(2.2rem, 5vw, 3.5rem)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: "#f0fdf4",
            }}
          >
            Accept crypto privately.
            <br />
            <span style={{ color: "#31df90" }}>We&apos;ll set it up for you.</span>
          </h1>
          <p
            style={{
              marginTop: "20px",
              fontSize: "18px",
              fontWeight: 500,
              lineHeight: 1.6,
              color: "#6b7f75",
              maxWidth: "560px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            From wallet setup to LLC formation — one engagement, one point of
            contact. Four service tiers for every level of need.
          </p>
          <div
            style={{
              marginTop: "28px",
              display: "flex",
              justifyContent: "center",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <a href="#tiers" className="btn-accent">
              View Pricing <ArrowRight size={16} />
            </a>
            <a href="#contact" className="btn-secondary">
              Book a Call
            </a>
          </div>
        </motion.div>
      </div>
    </section>

    {/* Who It's For */}
    <section
      style={{
        background: "#000",
        padding: "80px 24px",
        borderBottom: "1px solid #1e2a24",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p
            style={{
              marginBottom: "12px",
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#31df90",
            }}
          >
            Who It&apos;s For
          </p>
          <h2
            style={{
              fontSize: "32px",
              fontWeight: 900,
              color: "#f0fdf4",
            }}
          >
            Not for crypto natives. For business owners.
          </h2>
          <p
            style={{
              marginTop: "12px",
              fontSize: "16px",
              color: "#6b7f75",
              maxWidth: "560px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            This isn&apos;t for developers who can read docs. This is for
            merchants who want crypto payments working — and their business
            private — without becoming a sysadmin.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(3, 1fr)",
          }}
          className="services-audience-grid"
        >
          {audiences.map((a) => (
            <div
              key={a.title}
              style={{
                padding: "24px",
                background: "#0a0f0d",
                border: "1px solid #1e2a24",
                borderRadius: "12px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: "#0a1f17",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#31df90",
                  marginBottom: "14px",
                }}
              >
                {a.icon}
              </div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#f0fdf4",
                  marginBottom: "8px",
                }}
              >
                {a.title}
              </h3>
              <p
                style={{
                  fontSize: "14px",
                  lineHeight: 1.6,
                  color: "#6b7f75",
                }}
              >
                {a.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Service Tiers */}
    <section
      id="tiers"
      style={{
        background: "#000",
        padding: "80px 24px",
        borderBottom: "1px solid #1e2a24",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p
            style={{
              marginBottom: "12px",
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#31df90",
            }}
          >
            Service Tiers
          </p>
          <h2
            style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}
          >
            Four tiers. One goal.
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(4, 1fr)",
          }}
          className="services-tiers-grid"
        >
          {tiers.map((tier) => (
            <div
              key={tier.name}
              style={{
                padding: "28px 24px",
                background: "#0a0f0d",
                border: tier.featured
                  ? "1px solid #31df90"
                  : "1px solid #1e2a24",
                borderRadius: "12px",
                display: "flex",
                flexDirection: "column",
                position: "relative",
              }}
            >
              {tier.featured && (
                <div
                  style={{
                    position: "absolute",
                    top: "-1px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#31df90",
                    color: "#000",
                    fontSize: "10px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    padding: "4px 14px",
                    borderRadius: "0 0 8px 8px",
                  }}
                >
                  Most Popular
                </div>
              )}
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  color: "#f0fdf4",
                  marginBottom: "4px",
                  marginTop: tier.featured ? "12px" : 0,
                }}
              >
                {tier.name}
              </h3>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "28px",
                    fontWeight: 900,
                    color: "#31df90",
                  }}
                >
                  {tier.price}
                </span>
                <span
                  style={{
                    fontSize: "13px",
                    color: "#6b7f75",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Clock size={12} /> {tier.time}
                </span>
              </div>
              <p
                style={{
                  fontSize: "14px",
                  color: "#6b7f75",
                  marginBottom: "20px",
                  lineHeight: 1.5,
                }}
              >
                {tier.description}
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  flex: 1,
                }}
              >
                {tier.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      fontSize: "13px",
                      color: "#6b7f75",
                      marginBottom: "10px",
                      lineHeight: 1.4,
                    }}
                  >
                    <Check
                      size={14}
                      style={{
                        color: "#31df90",
                        flexShrink: 0,
                        marginTop: "2px",
                      }}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="#contact"
                className={tier.featured ? "btn-accent" : "btn-secondary"}
                style={{
                  marginTop: "20px",
                  textAlign: "center",
                  display: "block",
                }}
              >
                Get Started
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* How It Works */}
    <section
      style={{
        background: "#000",
        padding: "80px 24px",
        borderBottom: "1px solid #1e2a24",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p
            style={{
              marginBottom: "12px",
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#31df90",
            }}
          >
            How It Works
          </p>
          <h2
            style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}
          >
            Four steps to private commerce
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(4, 1fr)",
          }}
          className="services-steps-grid"
        >
          {steps.map((step, i) => (
            <div
              key={step.title}
              style={{
                padding: "24px",
                background: "#0a0f0d",
                border: "1px solid #1e2a24",
                borderRadius: "12px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: "#0a1f17",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#31df90",
                  margin: "0 auto 14px",
                  position: "relative",
                }}
              >
                {step.icon}
                <span
                  style={{
                    position: "absolute",
                    top: "-6px",
                    right: "-6px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: "#31df90",
                    color: "#000",
                    fontSize: "10px",
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </span>
              </div>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#f0fdf4",
                  marginBottom: "6px",
                }}
              >
                {step.title}
              </h3>
              <p
                style={{ fontSize: "13px", lineHeight: 1.5, color: "#6b7f75" }}
              >
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Privacy Findings */}
    <section
      style={{
        background: "#000",
        padding: "80px 24px",
        borderBottom: "1px solid #1e2a24",
      }}
    >
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p
            style={{
              marginBottom: "12px",
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#31df90",
            }}
          >
            Privacy Audit
          </p>
          <h2
            style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}
          >
            Every finding is an action
          </h2>
          <p
            style={{
              marginTop: "12px",
              fontSize: "16px",
              color: "#6b7f75",
              maxWidth: "560px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            During the Privacy Package and Turnkey tiers, we audit your business
            with{" "}
            <a
              href="https://defaultprivacy.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#31df90", textDecoration: "none" }}
            >
              Default Privacy
            </a>
            &apos;s free tools. Every finding is either fixed or routed to the
            right service.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {findings.map((f) => (
            <div
              key={f.problem}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "14px 18px",
                background: "#0a0f0d",
                border: "1px solid #1e2a24",
                borderRadius: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  color: "#f0fdf4",
                  fontWeight: 500,
                }}
              >
                {f.problem}
              </span>
              <span
                style={{
                  fontSize: "12px",
                  color: "#31df90",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {f.solution} →
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* The Bridge */}
    <section
      style={{
        background: "#000",
        padding: "80px 24px",
        borderBottom: "1px solid #1e2a24",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p
            style={{
              marginBottom: "12px",
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#31df90",
            }}
          >
            Two Platforms
          </p>
          <h2
            style={{ fontSize: "32px", fontWeight: 900, color: "#f0fdf4" }}
          >
            DeroPay + Default Privacy
          </h2>
          <p
            style={{
              marginTop: "12px",
              fontSize: "16px",
              color: "#6b7f75",
              maxWidth: "560px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            DeroPay provides the payment rails. Default Privacy provides the
            privacy infrastructure. This service packages both.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "1fr 1fr",
          }}
          className="services-bridge-grid"
        >
          <div
            style={{
              padding: "28px",
              background: "#0a0f0d",
              border: "1px solid #1e2a24",
              borderRadius: "12px",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "#0a1f17",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#31df90",
                marginBottom: "14px",
              }}
            >
              <Wallet size={20} />
            </div>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 800,
                color: "#f0fdf4",
                marginBottom: "12px",
              }}
            >
              DeroPay
            </h3>
            {[
              "Payment SDK + gateway server",
              "WooCommerce plugin",
              "Medusa.js plugin",
              "Embeddable payment widget",
              "Smart contract escrow",
              "HMAC-signed webhooks",
            ].map((item) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  color: "#6b7f75",
                  marginBottom: "8px",
                }}
              >
                <ArrowRight size={12} style={{ color: "#31df90" }} />
                {item}
              </div>
            ))}
          </div>
          <div
            style={{
              padding: "28px",
              background: "#0a0f0d",
              border: "1px solid #1e2a24",
              borderRadius: "12px",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "#0a1f17",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#31df90",
                marginBottom: "14px",
              }}
            >
              <Lock size={20} />
            </div>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 800,
                color: "#f0fdf4",
                marginBottom: "12px",
              }}
            >
              <a
                href="https://defaultprivacy.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#f0fdf4", textDecoration: "none" }}
              >
                Default Privacy
              </a>
            </h3>
            {[
              "LLC formation (WY/NM/DE)",
              "Data broker removal (635+ sites)",
              "9 free privacy audit tools",
              "886-tool privacy directory",
              "Threat model assessment",
              "AI privacy mentor",
            ].map((item) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  color: "#6b7f75",
                  marginBottom: "8px",
                }}
              >
                <ArrowRight size={12} style={{ color: "#31df90" }} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>

    {/* Contact / CTA */}
    <section id="contact" style={{ background: "#000", padding: "80px 24px" }}>
      <div
        style={{
          maxWidth: "560px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "28px",
            fontWeight: 900,
            color: "#f0fdf4",
            marginBottom: "16px",
          }}
        >
          Ready to accept crypto privately?
        </h2>
        <p
          style={{
            fontSize: "16px",
            lineHeight: 1.6,
            color: "#6b7f75",
            marginBottom: "12px",
          }}
        >
          Book a free 15-minute discovery call. We&apos;ll assess your situation
          and recommend the right tier. No commitment, no sales pitch.
        </p>
        <p
          style={{
            fontSize: "14px",
            color: "#6b7f75",
            marginBottom: "28px",
          }}
        >
          Video calls via Jitsi (no Zoom). Payment via DERO or bank transfer.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <a href="mailto:services@deropay.com" className="btn-accent">
            Contact Us <ArrowRight size={16} />
          </a>
          <a
            href="https://defaultprivacy.com/merchant"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            <Shield size={16} /> Privacy Side
          </a>
        </div>
      </div>
    </section>

    <style>{`
      @media (max-width: 767px) {
        .services-audience-grid { grid-template-columns: 1fr !important; }
        .services-tiers-grid { grid-template-columns: 1fr !important; }
        .services-steps-grid { grid-template-columns: 1fr 1fr !important; }
        .services-bridge-grid { grid-template-columns: 1fr !important; }
      }
      @media (min-width: 768px) and (max-width: 1023px) {
        .services-audience-grid { grid-template-columns: repeat(2, 1fr) !important; }
        .services-tiers-grid { grid-template-columns: repeat(2, 1fr) !important; }
      }
    `}</style>
  </>
);
