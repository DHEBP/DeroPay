import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — DeroPay",
  description:
    "DeroPay is open-source software, not a hosted service. Published under the MIT License. Operators are responsible for their own compliance.",
};

export default function TermsPage() {
  return (
    <>
      {/* Hero */}
      <section style={{ borderBottom: "1px solid #1e2a24", background: "#000", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: "-30%", right: "20%", width: "700px", height: "700px", borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 65%)", filter: "blur(100px)" }} />
        </div>
        <div style={{ position: "relative", maxWidth: "720px", margin: "0 auto", padding: "48px 24px 40px", textAlign: "center" }}>
          <p style={{ marginBottom: "16px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#10b981" }}>Legal</p>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#f0fdf4" }}>Terms of Service</h1>
          <p style={{ marginTop: "16px", fontSize: "14px", color: "#4a6356" }}>Last updated: March 2, 2026</p>
        </div>
      </section>

      {/* Content */}
      <section style={{ background: "#000", padding: "64px 24px 80px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", fontSize: "16px", lineHeight: 1.8, color: "#6b7f75" }} className="legal-content">

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Software, Not a Service</h2>
          <p style={{ marginBottom: "32px" }}>
            DeroPay is open-source software published under the <strong style={{ color: "#f0fdf4" }}>MIT License</strong>. It is a self-hosted developer toolkit &mdash; a library, SDK, and gateway server &mdash; not a hosted service, payment platform, or financial product. DHEBP publishes this software. DHEBP does not operate payment processing services, does not transmit funds, does not take custody of any cryptocurrency, and does not act as a money transmitter or money services business.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Use of This Website</h2>
          <p style={{ marginBottom: "32px" }}>
            This website (deropay.com) provides information about the DeroPay open-source project. By accessing this website, you agree to these terms. If you do not agree, please do not use the website. These terms do not govern your use of the DeroPay software itself &mdash; that is governed by the MIT License.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>MIT License</h2>
          <p style={{ marginBottom: "12px" }}>
            The DeroPay software is provided under the MIT License:
          </p>
          <div style={{ padding: "20px 24px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "8px", fontFamily: "monospace", fontSize: "13px", lineHeight: 1.7, color: "#6b7f75", marginBottom: "32px" }}>
            Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the conditions in the full MIT License text included with the source code.
          </div>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Operator Responsibility</h2>
          <p style={{ marginBottom: "12px" }}>
            If you deploy software that incorporates DeroPay, <strong style={{ color: "#f0fdf4" }}>you</strong> are the operator. You are solely responsible for:
          </p>
          <ul style={{ paddingLeft: "24px", marginBottom: "32px", listStyle: "disc" }}>
            <li style={{ marginBottom: "8px" }}>Compliance with all applicable laws and regulations in your jurisdiction, including money transmission laws, anti-money laundering (AML) requirements, know-your-customer (KYC) obligations, and sanctions compliance</li>
            <li style={{ marginBottom: "8px" }}>Determining whether your use of this software requires registration or licensing with financial regulators (e.g., FinCEN, state regulators, or equivalent authorities in your jurisdiction)</li>
            <li style={{ marginBottom: "8px" }}>Tax reporting and compliance for any payments you receive</li>
            <li style={{ marginBottom: "8px" }}>Any terms of service, privacy policies, or legal agreements between you and your customers</li>
            <li>Ensuring your use of this software is lawful in your jurisdiction</li>
          </ul>
          <p style={{ marginBottom: "32px", padding: "16px 20px", background: "#0a0f0d", border: "1px solid #1e2a24", borderRadius: "8px", fontWeight: 600, color: "#f0fdf4" }}>
            DHEBP does not provide legal, financial, tax, or compliance advice. Consult qualified professionals in your jurisdiction before deploying payment processing software.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Self-Hosted Architecture</h2>
          <p style={{ marginBottom: "12px" }}>
            DeroPay is designed to be self-hosted. When you run this software:
          </p>
          <ul style={{ paddingLeft: "24px", marginBottom: "32px", listStyle: "disc" }}>
            <li style={{ marginBottom: "8px" }}><strong style={{ color: "#f0fdf4" }}>You</strong> connect it to <strong style={{ color: "#f0fdf4" }}>your</strong> DERO wallet</li>
            <li style={{ marginBottom: "8px" }}><strong style={{ color: "#f0fdf4" }}>You</strong> receive payments directly into <strong style={{ color: "#f0fdf4" }}>your</strong> wallet</li>
            <li style={{ marginBottom: "8px" }}><strong style={{ color: "#f0fdf4" }}>You</strong> control the infrastructure, configuration, and data</li>
            <li style={{ marginBottom: "8px" }}>No funds pass through DHEBP at any point</li>
            <li>No data is sent to DHEBP at any point</li>
          </ul>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Escrow Module</h2>
          <p style={{ marginBottom: "12px" }}>
            The optional escrow module provides smart contract source code and TypeScript bindings for on-chain escrow functionality. Each escrow transaction deploys a <strong>fresh smart contract instance</strong> with isolated state &mdash; there is no shared contract between different escrows. If you choose to deploy and operate escrow contracts:
          </p>
          <ul style={{ paddingLeft: "24px", marginBottom: "12px", listStyle: "disc" }}>
            <li style={{ marginBottom: "8px" }}>Each transaction deploys a new contract (one SCID per escrow)</li>
            <li style={{ marginBottom: "8px" }}>You deploy the contract from your wallet</li>
            <li style={{ marginBottom: "8px" }}>You are the contract owner and operator</li>
            <li style={{ marginBottom: "8px" }}>You set the fee structure (including zero fees)</li>
            <li style={{ marginBottom: "8px" }}>You designate the arbitrator</li>
            <li>You are responsible for regulatory compliance related to escrow services in your jurisdiction</li>
          </ul>
          <p style={{ marginBottom: "32px" }}>
            DHEBP does not deploy, operate, manage, or profit from any escrow contracts.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Payment Router Module</h2>
          <p style={{ marginBottom: "12px" }}>
            The optional payment router module provides smart contract source code and TypeScript bindings for on-chain instant payment splitting. Unlike the escrow module, the payment router is deployed <strong>once per merchant</strong> and reused for unlimited payments through the same contract (one persistent SCID). If you choose to deploy and operate a payment router contract:
          </p>
          <ul style={{ paddingLeft: "24px", marginBottom: "12px", listStyle: "disc" }}>
            <li style={{ marginBottom: "8px" }}>You deploy the contract once from your wallet and reuse it for every payment</li>
            <li style={{ marginBottom: "8px" }}>You are the merchant and payment recipient</li>
            <li style={{ marginBottom: "8px" }}>You configure the fee structure (including zero fees) and fee recipient at deployment &mdash; immutable after deploy</li>
            <li>You are responsible for regulatory compliance related to payment processing in your jurisdiction</li>
          </ul>
          <p style={{ marginBottom: "32px" }}>
            The payment router contract is a tool for merchants to receive payments directly into their own wallet. Funds flow through the contract atomically in a single transaction &mdash; no funds are held, pooled, or batched. DHEBP does not deploy, operate, manage, or profit from any payment router contracts.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>No Financial Services</h2>
          <p style={{ marginBottom: "12px" }}>DeroPay does not:</p>
          <ul style={{ paddingLeft: "24px", marginBottom: "32px", listStyle: "disc" }}>
            <li style={{ marginBottom: "8px" }}>Transmit, receive, hold, or custody money or cryptocurrency on behalf of others</li>
            <li style={{ marginBottom: "8px" }}>Operate as a money transmitter, money services business, payment processor, or financial institution</li>
            <li style={{ marginBottom: "8px" }}>Provide financial, investment, or legal advice</li>
            <li style={{ marginBottom: "8px" }}>Collect, store, or process personal financial information</li>
            <li>Make determinations about the legality of any transaction</li>
          </ul>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>No Warranty</h2>
          <p style={{ marginBottom: "32px" }}>
            THE SOFTWARE IS PROVIDED &ldquo;AS IS&rdquo;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Non-Affiliation</h2>
          <p style={{ marginBottom: "32px" }}>
            DHEBP is an independent software organization. DHEBP is not affiliated with, endorsed by, or representative of the DERO Project, DERO core developers, or any other entity unless explicitly stated otherwise. &ldquo;DERO&rdquo; is used in this software to describe compatibility with the DERO blockchain protocol. Any trademarks belong to their respective owners.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Open Source</h2>
          <p style={{ marginBottom: "32px" }}>
            The complete source code for DeroPay is publicly available for review, audit, and contribution. Trust in payment software depends on public verifiability, not promises.
            Source: <a href="https://github.com/DHEBP/dero-pay" target="_blank" rel="noopener noreferrer" style={{ color: "#10b981", textDecoration: "underline", textUnderlineOffset: "4px" }}>github.com/DHEBP/dero-pay</a>
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Contact</h2>
          <p>
            For legal inquiries: <a href="mailto:legal@dhebp.org" style={{ color: "#10b981", textDecoration: "underline", textUnderlineOffset: "4px" }}>legal@dhebp.org</a>
          </p>
        </div>
      </section>
    </>
  );
}
