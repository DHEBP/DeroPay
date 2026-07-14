"use client";

export const PrivacyPageClient = () => (
  <>
    {/* Hero */}
    <section className="pad-sm" style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--color-border-soft)" }}>
      <div className="grid-bg" />
      <div className="orb" style={{ width: "640px", height: "640px", top: "-30%", right: "20%", background: "rgba(49,223,144,.10)" }} />
      <div className="wrap">
        <div className="legal-hero">
          <span className="eyebrow dot">Legal</span>
          <h1 style={{ marginTop: "14px" }}>Privacy Policy</h1>
          <div className="upd">Last updated: March 2, 2026</div>
        </div>
      </div>
    </section>

    {/* Content */}
    <section className="pad-sm" style={{ position: "relative", overflow: "hidden", borderTop: "1px solid var(--color-border-soft)" }}>
      <div className="wrap">
        <div className="legal">
          <h2>The short version</h2>
          <p>
            DeroPay is self-hosted software. We don&rsquo;t collect your data because we never see your data. There are no cookies, no analytics, no tracking pixels, no telemetry. When you run DeroPay, it runs on <b>your</b> infrastructure, connected to <b>your</b> wallet. We have no access to any of it.
          </p>

          <h2>What this policy covers</h2>
          <p>
            This policy applies to the DeroPay marketing website (deropay.com) and the DeroPay documentation site (deropay.derod.org). The DeroPay software itself is self-hosted &mdash; when you deploy it, your own privacy policy governs the data your instance handles.
          </p>

          <h2>Data we collect</h2>
          <p className="none">None.</p>
          <ul>
            <li>No personal information is collected, stored, or processed</li>
            <li>No cookies are set (first-party or third-party)</li>
            <li>No analytics or tracking scripts run on this site</li>
            <li>No telemetry is sent from the DeroPay software</li>
            <li>No IP addresses are logged by our application</li>
            <li>No email addresses, names, or other identifiers are requested or stored</li>
          </ul>

          <h2>Cookies</h2>
          <p>
            This website does not set any cookies. There is no cookie banner because there are no cookies to consent to.
          </p>

          <h2>Third-party services</h2>
          <p>
            This website is hosted on infrastructure that may log standard web server access data (IP addresses, user agent strings) at the hosting provider level. We do not control or access these logs. We do not use:
          </p>
          <ul>
            <li>Google Analytics or any analytics service</li>
            <li>Advertising networks or retargeting pixels</li>
            <li>Social media tracking widgets</li>
            <li>Customer data platforms or CDPs</li>
          </ul>

          <h2>Self-hosted software</h2>
          <p>DeroPay is designed to be self-hosted. When you deploy the software:</p>
          <ul>
            <li><b>You</b> connect it to <b>your</b> DERO wallet</li>
            <li><b>You</b> receive payments directly into <b>your</b> wallet</li>
            <li><b>You</b> control the infrastructure, configuration, and data</li>
            <li>No funds pass through DHEBP at any point</li>
            <li>No data is sent to DHEBP at any point</li>
          </ul>
          <p>
            If you operate a DeroPay instance, you are responsible for your own privacy policy governing your customers&rsquo; data.
          </p>

          <h2>No custody</h2>
          <p>
            DHEBP does not transmit, receive, hold, or custody money or cryptocurrency on behalf of any party. DeroPay is a software tool &mdash; an open-source library that facilitates direct peer-to-peer payments on the DERO blockchain. All funds flow directly between payer and payee.
          </p>

          <h2>Children&rsquo;s privacy</h2>
          <p>
            This website does not knowingly collect information from anyone, including children under 13. Since we collect no data at all, no special provisions are necessary.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            If we change this policy, we will update the &ldquo;Last updated&rdquo; date above. Since we collect no data, changes are unlikely but may reflect new sections or clarifications.
          </p>

          <h2>Contact</h2>
          <p style={{ marginBottom: 0 }}>
            For privacy-related inquiries: <a href="mailto:legal@dhebp.org">legal@dhebp.org</a>
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
      .legal .none{font-weight:700;color:var(--color-text-primary);margin-bottom:12px}
      .legal a{color:var(--color-accent-strong);text-decoration:underline;text-underline-offset:3px}
    `}</style>
  </>
);
