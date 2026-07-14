import Link from "next/link";
import { DeroIcon } from "@/components/icons/dero-icon";
import { DASHBOARD_URL, DOCS_URL, NPM_URL } from "@/lib/site";

export const Footer = () => (
  <footer className="footer">
    <div className="footer-in">
      <div>
        <Link href="/" className="brand">
          <DeroIcon size={26} className="text-[var(--color-accent-strong)]" />
          <span style={{ transform: "translateY(1.5px)" }}>DeroPay</span>
        </Link>
        <p className="blurb">
          The privacy-first payment stack for the DERO economy. Open source,
          self-hosted, built for developers.
        </p>
      </div>

      <div>
        <h4>Products</h4>
        <Link href="/auth">DeroAuth</Link>
        <Link href="/pay">DeroPay</Link>
        <Link href="/x402">x402</Link>
        <Link href="/escrow">Escrow</Link>
        <a href={DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
          Dashboard demo
        </a>
      </div>

      <div>
        <h4>Resources</h4>
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
          Documentation
        </a>
        <a
          href={`${DOCS_URL}/dero-pay/api-reference`}
          target="_blank"
          rel="noopener noreferrer"
        >
          API Reference
        </a>
        <a
          href={`${DOCS_URL}/guides/prerequisites`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Guides
        </a>
        <a href={NPM_URL} target="_blank" rel="noopener noreferrer">
          npm
        </a>
      </div>

      <div>
        <h4>Legal</h4>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/about">About</Link>
      </div>
    </div>

    <div className="footer-bar">
      <span className="cp">
        &copy; {new Date().getFullYear()} DHEBP. All rights reserved.
      </span>
      <span className="status">
        <span className="pulse" />
        SYSTEMS OPERATIONAL
      </span>
    </div>
  </footer>
);
