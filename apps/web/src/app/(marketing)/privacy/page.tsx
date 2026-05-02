import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — DeroPay",
  description:
    "DeroPay collects no data, sets no cookies, and runs no analytics. Self-hosted software with zero telemetry.",
};

export default function PrivacyPage() {
  return (
    <>
      {/* Hero */}
      <section style={{ borderBottom: "1px solid #1e2a24", background: "#000", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: "-30%", right: "20%", width: "700px", height: "700px", borderRadius: "50%", background: "radial-gradient(circle, rgba(49,223,144,0.10) 0%, transparent 65%)", filter: "blur(100px)" }} />
        </div>
        <div style={{ position: "relative", maxWidth: "720px", margin: "0 auto", padding: "48px 24px 40px", textAlign: "center" }}>
          <p style={{ marginBottom: "16px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#31df90" }}>Legal</p>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#f0fdf4" }}>Privacy Policy</h1>
          <p style={{ marginTop: "16px", fontSize: "14px", color: "#4a6356" }}>Last updated: March 2, 2026</p>
        </div>
      </section>

      {/* Content */}
      <section style={{ background: "#000", padding: "64px 24px 80px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", fontSize: "16px", lineHeight: 1.8, color: "#6b7f75" }} className="legal-content">
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>The Short Version</h2>
          <p style={{ marginBottom: "32px" }}>
            DeroPay is self-hosted software. We don&rsquo;t collect your data because we never see your data. There are no cookies, no analytics, no tracking pixels, no telemetry. When you run DeroPay, it runs on <em>your</em> infrastructure, connected to <em>your</em> wallet. We have no access to any of it.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>What This Policy Covers</h2>
          <p style={{ marginBottom: "32px" }}>
            This policy applies to the DeroPay marketing website (deropay.com) and the DeroPay documentation site (deropay.derod.org). The DeroPay software itself is self-hosted &mdash; when you deploy it, your own privacy policy governs the data your instance handles.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Data We Collect</h2>
          <p style={{ marginBottom: "12px", fontWeight: 700, color: "#f0fdf4" }}>None.</p>
          <ul style={{ paddingLeft: "24px", marginBottom: "32px", listStyle: "disc" }}>
            <li style={{ marginBottom: "8px" }}>No personal information is collected, stored, or processed</li>
            <li style={{ marginBottom: "8px" }}>No cookies are set (first-party or third-party)</li>
            <li style={{ marginBottom: "8px" }}>No analytics or tracking scripts run on this site</li>
            <li style={{ marginBottom: "8px" }}>No telemetry is sent from the DeroPay software</li>
            <li style={{ marginBottom: "8px" }}>No IP addresses are logged by our application</li>
            <li>No email addresses, names, or other identifiers are requested or stored</li>
          </ul>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Cookies</h2>
          <p style={{ marginBottom: "32px" }}>
            This website does not set any cookies. There is no cookie banner because there are no cookies to consent to.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Third-Party Services</h2>
          <p style={{ marginBottom: "12px" }}>
            This website is hosted on infrastructure that may log standard web server access data (IP addresses, user agent strings) at the hosting provider level. We do not control or access these logs. We do not use:
          </p>
          <ul style={{ paddingLeft: "24px", marginBottom: "32px", listStyle: "disc" }}>
            <li style={{ marginBottom: "8px" }}>Google Analytics or any analytics service</li>
            <li style={{ marginBottom: "8px" }}>Advertising networks or retargeting pixels</li>
            <li style={{ marginBottom: "8px" }}>Social media tracking widgets</li>
            <li>Customer data platforms or CDPs</li>
          </ul>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Self-Hosted Software</h2>
          <p style={{ marginBottom: "12px" }}>
            DeroPay is designed to be self-hosted. When you deploy the software:
          </p>
          <ul style={{ paddingLeft: "24px", marginBottom: "12px", listStyle: "disc" }}>
            <li style={{ marginBottom: "8px" }}><strong style={{ color: "#f0fdf4" }}>You</strong> connect it to <strong style={{ color: "#f0fdf4" }}>your</strong> DERO wallet</li>
            <li style={{ marginBottom: "8px" }}><strong style={{ color: "#f0fdf4" }}>You</strong> receive payments directly into <strong style={{ color: "#f0fdf4" }}>your</strong> wallet</li>
            <li style={{ marginBottom: "8px" }}><strong style={{ color: "#f0fdf4" }}>You</strong> control the infrastructure, configuration, and data</li>
            <li style={{ marginBottom: "8px" }}>No funds pass through DHEBP at any point</li>
            <li>No data is sent to DHEBP at any point</li>
          </ul>
          <p style={{ marginBottom: "32px" }}>
            If you operate a DeroPay instance, you are responsible for your own privacy policy governing your customers&rsquo; data.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>No Custody</h2>
          <p style={{ marginBottom: "32px" }}>
            DHEBP does not transmit, receive, hold, or custody money or cryptocurrency on behalf of any party. DeroPay is a software tool &mdash; an open-source library that facilitates direct peer-to-peer payments on the DERO blockchain. All funds flow directly between payer and payee.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Children&rsquo;s Privacy</h2>
          <p style={{ marginBottom: "32px" }}>
            This website does not knowingly collect information from anyone, including children under 13. Since we collect no data at all, no special provisions are necessary.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Changes to This Policy</h2>
          <p style={{ marginBottom: "32px" }}>
            If we change this policy, we will update the &ldquo;Last updated&rdquo; date above. Since we collect no data, changes are unlikely but may reflect new sections or clarifications.
          </p>

          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#f0fdf4", marginBottom: "16px" }}>Contact</h2>
          <p>
            For privacy-related inquiries: <a href="mailto:legal@dhebp.org" style={{ color: "#31df90", textDecoration: "underline", textUnderlineOffset: "4px" }}>legal@dhebp.org</a>
          </p>
        </div>
      </section>
    </>
  );
}
