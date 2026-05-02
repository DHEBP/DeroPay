import Link from "next/link";
import { DeroIcon } from "@/components/icons/dero-icon";

export const Footer = () => (
  <footer className="border-t border-[var(--color-border-soft)] bg-[var(--color-background)]">
    <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-x-8 gap-y-12 py-16 md:grid-cols-[1.6fr_repeat(3,1fr)]">
        <div className="col-span-2 md:col-span-1">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-85"
          >
            <DeroIcon size={26} className="text-[var(--color-accent-strong)]" />
            <span className="font-display text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
              DeroPay
            </span>
          </Link>
          <p className="mt-4 max-w-xs text-pretty text-sm font-medium leading-relaxed text-[var(--color-text-secondary)]">
            The privacy-first payment stack for the DERO economy. Open source,
            self-hosted, and built for developers.
          </p>
        </div>

        <div>
          <h3 className="section-kicker">Products</h3>
          <ul className="mt-4 space-y-3">
            <li>
              <Link
                href="/auth"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                DeroAuth
              </Link>
            </li>
            <li>
              <Link
                href="/pay"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                DeroPay
              </Link>
            </li>
            <li>
              <Link
                href="/x402"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                x402
              </Link>
            </li>
            <li>
              <Link
                href="/escrow"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Escrow
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Dashboard
              </Link>
            </li>
            <li>
              <a
                href="https://demo.deropay.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Live Demo
              </a>
            </li>
            <li>
              <Link
                href="/playground"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Widget Playground
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="section-kicker">Resources</h3>
          <ul className="mt-4 space-y-3">
            <li>
              <a
                href="https://deropay.derod.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Documentation
              </a>
            </li>
            <li>
              <a
                href="https://deropay.derod.org/dero-pay/api-reference"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                API Reference
              </a>
            </li>
            <li>
              <a
                href="https://deropay.derod.org/guides/prerequisites"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Guides
              </a>
            </li>
            <li>
              <a
                href="https://checkout.deropay.com?demo=true"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Checkout Page
              </a>
            </li>
            <li>
              <a
                href="https://dashboard.deropay.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Merchant Dashboard
              </a>
            </li>
            <li>
              <Link
                href="/about"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                About
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="section-kicker">Legal</h3>
          <ul className="mt-4 space-y-3">
            <li>
              <Link
                href="/privacy"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Terms of Service
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-4 border-t border-[var(--color-border-soft)] py-8 sm:flex-row">
        <p className="text-xs font-medium text-[var(--color-text-tertiary)]">
          &copy; {new Date().getFullYear()} DHEBP. All rights reserved.
        </p>
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-accent)]">
          <span className="footer-pulse h-2 w-2 rounded-full bg-[var(--color-accent)]" />
          SYSTEMS OPERATIONAL
        </div>
      </div>
    </div>

    <style>{`
      @keyframes footer-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      .footer-pulse {
        animation: footer-pulse 2s infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .footer-pulse {
          animation: none;
        }
      }
    `}</style>
  </footer>
);
