"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { DeroIcon } from "@/components/icons/dero-icon";
import { DOCS_URL } from "@/lib/site";

type NavLink = {
  href: string;
  label: string;
  external?: true;
};

const links: NavLink[] = [
  { href: "/auth", label: "Auth" },
  { href: "/pay", label: "Pay" },
  { href: "/x402", label: "x402" },
  { href: "/escrow", label: "Escrow" },
  { href: "/templates", label: "Templates" },
  { href: "/playground", label: "Try It" },
  { href: DOCS_URL, label: "Docs", external: true },
];

export const Navbar = () => {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`nav${scrolled ? " nav-scrolled" : ""}`}>
      <div className="nav-in">
        <Link href="/" className="brand">
          <DeroIcon size={26} className="text-[var(--color-accent-strong)]" />
          <span style={{ transform: "translateY(1.5px)" }}>DeroPay</span>
        </Link>

        <nav className="nav-links">
          {links.map((link) => {
            const isActive =
              !link.external &&
              (pathname === link.href || pathname.startsWith(link.href + "/"));

            if (link.external) {
              return (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </a>
              );
            }

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "on" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent btn-sm nav-cta"
        >
          Get started
        </a>

        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="nav-burger"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <style>{`
        .nav-scrolled {
          background: rgba(6, 8, 6, 0.85);
        }
        .nav-cta,
        .nav-links {
          display: flex;
        }
        .nav-burger {
          display: none;
          margin-left: auto;
          color: var(--tp, var(--color-text-primary));
        }
        @media (max-width: 900px) {
          .nav-cta {
            display: none;
          }
          .nav-burger {
            display: block;
          }
        }
        .nav-mobile {
          border-bottom: 1px solid var(--border-soft, var(--color-border-soft));
          background: var(--bg, var(--color-background));
          overflow: hidden;
        }
        .nav-mobile-inner {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 24px;
        }
        .nav-mobile-inner a {
          font-family: var(--display, var(--font-display));
          font-size: 18px;
          font-weight: 600;
          color: var(--tp, var(--color-text-primary));
        }
        .nav-mobile-divider {
          height: 1px;
          margin: 8px 0;
          background: var(--border-soft, var(--color-border-soft));
        }
      `}</style>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobile-menu"
            className="nav-mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="nav-mobile-inner">
              {links.map((link) =>
                link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </Link>
                ),
              )}
              <div className="nav-mobile-divider" />
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-accent"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => setMobileOpen(false)}
              >
                Get started
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
