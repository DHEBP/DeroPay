"use client";

import { REPO_URL } from "@/lib/site";

export const TermsPageClient = () => (
  <>
    {/* Hero */}
    <section className="pad-sm" style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--color-border-soft)" }}>
      <div className="grid-bg" />
      <div className="orb" style={{ width: "640px", height: "640px", top: "-30%", right: "20%", background: "rgba(49,223,144,.10)" }} />
      <div className="wrap">
        <div className="legal-hero">
          <span className="eyebrow dot">Legal</span>
          <h1 style={{ marginTop: "14px" }}>Terms of Service</h1>
          <div className="upd">Last updated: March 2, 2026</div>
        </div>
      </div>
    </section>

    {/* Content */}
    <section className="pad-sm" style={{ position: "relative", overflow: "hidden", borderTop: "1px solid var(--color-border-soft)" }}>
      <div className="wrap">
        <div className="legal">
          <h2>Software, not a service</h2>
          <p>
            DeroPay is open-source software published under the <b>MIT License</b>. It is a self-hosted developer toolkit &mdash; a library, SDK, and gateway server &mdash; not a hosted service, payment platform, or financial product. DHEBP publishes this software. DHEBP does not operate payment processing services, does not transmit funds, does not take custody of any cryptocurrency, and does not act as a money transmitter or money services business.
          </p>

          <h2>Use of this website</h2>
          <p>
            This website (deropay.com) provides information about the DeroPay open-source project. By accessing this website, you agree to these terms. If you do not agree, please do not use the website. These terms do not govern your use of the DeroPay software itself &mdash; that is governed by the MIT License.
          </p>

          <h2>MIT License</h2>
          <p>The DeroPay software is provided under the MIT License:</p>
          <div className="legal-code">
            Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the conditions in the full MIT License text included with the source code.
          </div>

          <h2>Operator responsibility</h2>
          <p>
            If you deploy software that incorporates DeroPay, <b>you</b> are the operator. You are solely responsible for:
          </p>
          <ul>
            <li>Compliance with all applicable laws and regulations in your jurisdiction, including money transmission laws, anti-money laundering (AML) requirements, know-your-customer (KYC) obligations, and sanctions compliance</li>
            <li>Determining whether your use of this software requires registration or licensing with financial regulators (e.g., FinCEN, state regulators, or equivalent authorities in your jurisdiction)</li>
            <li>Tax reporting and compliance for any payments you receive</li>
            <li>Any terms of service, privacy policies, or legal agreements between you and your customers</li>
            <li>Ensuring your use of this software is lawful in your jurisdiction</li>
          </ul>
          <p className="legal-callout">
            DHEBP does not provide legal, financial, tax, or compliance advice. Consult qualified professionals in your jurisdiction before deploying payment processing software.
          </p>

          <h2>Self-hosted architecture</h2>
          <p>DeroPay is designed to be self-hosted. When you run this software:</p>
          <ul>
            <li><b>You</b> connect it to <b>your</b> DERO wallet</li>
            <li><b>You</b> receive payments directly into <b>your</b> wallet</li>
            <li><b>You</b> control the infrastructure, configuration, and data</li>
            <li>No funds pass through DHEBP at any point</li>
            <li>No data is sent to DHEBP at any point</li>
          </ul>

          <h2>Escrow module</h2>
          <p>
            The optional escrow module provides smart contract source code and TypeScript bindings for on-chain escrow functionality. Each escrow transaction deploys a <b>fresh smart contract instance</b> with isolated state &mdash; there is no shared contract between different escrows. If you choose to deploy and operate escrow contracts:
          </p>
          <ul>
            <li>Each transaction deploys a new contract (one SCID per escrow)</li>
            <li>You deploy the contract from your wallet</li>
            <li>You are the contract owner and operator</li>
            <li>You set the fee structure (including zero fees)</li>
            <li>You designate the arbitrator</li>
            <li>You are responsible for regulatory compliance related to escrow services in your jurisdiction</li>
          </ul>
          <p>DHEBP does not deploy, operate, manage, or profit from any escrow contracts.</p>

          <h2>Payment router module</h2>
          <p>
            The optional payment router module provides smart contract source code and TypeScript bindings for on-chain instant payment splitting. Unlike the escrow module, the payment router is deployed <b>once per merchant</b> and reused for unlimited payments through the same contract (one persistent SCID). If you choose to deploy and operate a payment router contract:
          </p>
          <ul>
            <li>You deploy the contract once from your wallet and reuse it for every payment</li>
            <li>You are the merchant and payment recipient</li>
            <li>You configure the fee structure (including zero fees) and fee recipient at deployment &mdash; immutable after deploy</li>
            <li>You are responsible for regulatory compliance related to payment processing in your jurisdiction</li>
          </ul>
          <p>
            The payment router contract is a tool for merchants to receive payments directly into their own wallet. Funds flow through the contract atomically in a single transaction &mdash; no funds are held, pooled, or batched. DHEBP does not deploy, operate, manage, or profit from any payment router contracts.
          </p>

          <h2>No financial services</h2>
          <p>DeroPay does not:</p>
          <ul>
            <li>Transmit, receive, hold, or custody money or cryptocurrency on behalf of others</li>
            <li>Operate as a money transmitter, money services business, payment processor, or financial institution</li>
            <li>Provide financial, investment, or legal advice</li>
            <li>Collect, store, or process personal financial information</li>
            <li>Make determinations about the legality of any transaction</li>
          </ul>

          <h2>No warranty</h2>
          <p>
            THE SOFTWARE IS PROVIDED &ldquo;AS IS&rdquo;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
          </p>

          <h2>Non-affiliation</h2>
          <p>
            DHEBP is an independent software organization. DHEBP is not affiliated with, endorsed by, or representative of the DERO Project, DERO core developers, or any other entity unless explicitly stated otherwise. &ldquo;DERO&rdquo; is used in this software to describe compatibility with the DERO blockchain protocol. Any trademarks belong to their respective owners.
          </p>

          <h2>Open source</h2>
          <p>
            The complete source code for DeroPay is publicly available for review, audit, and contribution. Trust in payment software depends on public verifiability, not promises.{" "}
            Source: <a href={REPO_URL} target="_blank" rel="noopener noreferrer">{REPO_URL.replace("https://", "")}</a>
          </p>

          <h2>Contact</h2>
          <p style={{ marginBottom: 0 }}>
            For legal inquiries: <a href="mailto:legal@dhebp.org">legal@dhebp.org</a>
          </p>
        </div>
      </div>
    </section>

    <style>{`
      .legal-hero{max-width:720px;margin:0 auto;text-align:center;position:relative;z-index:1}
      .legal-hero h1{font-family:var(--font-display);font-weight:800;font-size:clamp(2rem,4.6vw,3rem);letter-spacing:-.03em;color:var(--color-text-primary)}
      .legal-hero .upd{margin-top:14px;font-size:13px;color:var(--color-text-tertiary);font-family:var(--font-mono)}
      .legal{max-width:720px;margin:0 auto}
      .legal h2{font-family:var(--font-display);font-weight:700;font-size:21px;letter-spacing:-.02em;margin:0 0 14px;color:var(--color-text-primary)}
      .legal p{font-size:15.5px;line-height:1.8;color:var(--color-text-secondary);margin-bottom:28px}
      .legal p b{color:var(--color-text-primary);font-weight:600}
      .legal ul{padding-left:22px;margin:0 0 28px;list-style:none}
      .legal li{position:relative;font-size:15px;line-height:1.7;color:var(--color-text-secondary);margin-bottom:9px;padding-left:18px}
      .legal li::before{content:"";position:absolute;left:0;top:10px;width:6px;height:6px;border-radius:50%;background:var(--color-accent)}
      .legal a{color:var(--color-accent-strong);text-decoration:underline;text-underline-offset:3px}
      .legal .legal-code{padding:20px 24px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;
        font-family:var(--font-mono);font-size:13px;line-height:1.7;color:var(--color-text-secondary);margin-bottom:28px}
      .legal .legal-callout{padding:16px 20px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;
        font-weight:600;color:var(--color-text-primary);font-size:15px;line-height:1.65}
    `}</style>
  </>
);
