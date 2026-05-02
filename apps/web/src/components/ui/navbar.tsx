"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { DeroIcon } from "@/components/icons/dero-icon";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

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
  { href: "https://demo.deropay.com", label: "Demo", external: true },
  { href: "https://deropay.derod.org", label: "Docs", external: true },
  { href: "https://github.com/DHEBP", label: "GitHub", external: true },
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
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-200 ${
        scrolled
          ? "border-b border-[var(--color-border-soft)] bg-[rgba(6,8,6,0.78)] backdrop-blur-xl"
          : "border-b border-transparent bg-[var(--color-background)]"
      }`}
    >
      <nav className="mx-auto flex h-20 max-w-[1280px] items-center justify-between gap-4 px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-85"
        >
          <DeroIcon size={26} className="text-[var(--color-accent-strong)]" />
          <span className="font-display text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
            DeroPay
          </span>
        </Link>

        <div
          className="flex-1 justify-center"
          style={{ display: "var(--nav-display, none)" }}
        >
          <div className="flex items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-white/[0.04] p-1 backdrop-blur-sm">
            {links.map((link) => {
              const isActive =
                pathname === link.href ||
                pathname.startsWith(link.href + "/");
              const extra = link.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {};
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  {...extra}
                  aria-current={isActive ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-white text-[#071008] shadow-[0_8px_24px_-12px_rgba(255,255,255,0.18)]"
                      : "text-[var(--color-text-secondary)] hover:bg-white/[0.04] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div
          className="shrink-0 items-center"
          style={{ display: "var(--nav-display, none)" }}
        >
          <Link
            href="https://deropay.derod.org"
            className="btn-accent whitespace-nowrap"
            style={{ padding: "10px 20px", fontSize: "0.85rem" }}
          >
            Get started
          </Link>
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="ml-auto text-[var(--color-text-primary)]"
          style={{ display: "var(--burger-display, block)" }}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      <style>{`
        :root {
          --nav-display: none;
          --burger-display: block;
        }
        @media (min-width: 1024px) {
          :root {
            --nav-display: flex;
            --burger-display: none;
          }
        }
      `}</style>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-[var(--color-border-soft)] bg-[var(--color-background)]"
          >
            <div className="flex flex-col space-y-4 p-6">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-lg font-semibold text-[var(--color-text-primary)]"
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-4 h-px bg-[var(--color-border-soft)]" />
              <Link
                href="https://deropay.derod.org"
                className="btn-accent w-full text-center"
                onClick={() => setMobileOpen(false)}
              >
                Get started
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
