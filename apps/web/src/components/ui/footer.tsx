import Link from "next/link";
import { DeroIcon } from "@/components/icons/dero-icon";

export const Footer = () => (
  <footer className="border-t border-[#1e2a24] bg-black">
    <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
      {/* Main Grid */}
      <div
        className="py-16"
        style={{
          display: "grid",
          gap: "48px 32px",
          gridTemplateColumns: "repeat(2, 1fr)",
        }}
      >
        {/* Brand */}
        <div style={{ gridColumn: "1 / -1" }}>
          <Link href="/" className="inline-flex items-center gap-2">
            <DeroIcon size={24} className="text-[#10b981]" />
            <span className="text-lg font-black text-[#f0fdf4]">DeroPay</span>
          </Link>
          <p className="mt-4 max-w-xs text-sm font-medium leading-relaxed text-[#6b7f75]">
            The privacy-first payment stack for the DERO economy. Open source,
            self-hosted, and built for developers.
          </p>
        </div>

        {/* Products */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#f0fdf4]">Products</h3>
          <ul className="mt-4 space-y-3">
            <li><Link href="/auth" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">DeroAuth</Link></li>
            <li><Link href="/pay" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">DeroPay</Link></li>
            <li><Link href="/escrow" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">Escrow</Link></li>
            <li><Link href="/dashboard" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">Dashboard</Link></li>
            <li><a href="https://demo.deropay.com" target="_blank" rel="noopener noreferrer" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">Live Demo</a></li>
            <li><Link href="/playground" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">Widget Playground</Link></li>
          </ul>
        </div>

        {/* Resources */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#f0fdf4]">Resources</h3>
          <ul className="mt-4 space-y-3">
            <li><a href="https://deropay.derod.org" target="_blank" rel="noopener noreferrer" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">Documentation</a></li>
            <li><a href="https://deropay.derod.org/dero-pay/api-reference" target="_blank" rel="noopener noreferrer" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">API Reference</a></li>
            <li><a href="https://deropay.derod.org/guides/prerequisites" target="_blank" rel="noopener noreferrer" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">Guides</a></li>
            <li><a href="https://checkout.deropay.com?demo=true" target="_blank" rel="noopener noreferrer" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">Checkout Page</a></li>
            <li><a href="https://dashboard.deropay.com" target="_blank" rel="noopener noreferrer" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">Merchant Dashboard</a></li>
            <li><Link href="/about" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">About</Link></li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#f0fdf4]">Legal</h3>
          <ul className="mt-4 space-y-3">
            <li><Link href="/privacy" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">Privacy Policy</Link></li>
            <li><Link href="/terms" className="text-sm text-[#6b7f75] hover:text-[#f0fdf4] transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex flex-col items-center justify-between gap-4 border-t border-[#1e2a24] py-8 sm:flex-row">
        <p className="text-xs font-medium text-[#4a6356]">
          &copy; {new Date().getFullYear()} DHEBP. All rights reserved.
        </p>
        <div className="flex items-center gap-2 text-xs font-bold text-[#10b981]">
          <div
            className="h-2 w-2 rounded-full bg-[#10b981]"
            style={{ animation: "pulse 2s infinite" }}
          />
          SYSTEMS OPERATIONAL
        </div>
      </div>
    </div>

    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      @media (min-width: 768px) {
        footer > div > div:first-child {
          grid-template-columns: 1.6fr repeat(3, 1fr) !important;
        }
        footer > div > div:first-child > div:first-child {
          grid-column: 1 / 2 !important;
        }
      }
    `}</style>
  </footer>
);
