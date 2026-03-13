"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { DeroIcon } from "@/components/icons/dero-icon";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

const links = [
  { href: "/auth", label: "Auth" },
  { href: "/pay", label: "Pay" },
  { href: "/escrow", label: "Escrow" },
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
          ? "bg-black/90 backdrop-blur-md border-b border-[#1e2a24]"
          : "bg-black border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center px-6 lg:px-8">
        {/* Logo - always visible */}
        <Link href="/" className="mr-10 flex items-center gap-2 shrink-0">
          <DeroIcon size={28} className="text-[#10b981]" />
          <span className="text-xl font-black tracking-tight text-white">
            DeroPay
          </span>
        </Link>

        {/* Desktop Nav Links - inline, always rendered, hidden on small screens via CSS */}
        <div className="flex-1 justify-end" style={{ display: "var(--nav-display, none)" }}>
          <div className="flex items-center gap-7">
            {links.map((link) => {
              const isActive =
                pathname === link.href ||
                pathname.startsWith(link.href + "/");
              const El = "external" in link ? "a" : Link;
              const extra =
                "external" in link
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {};
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  {...extra}
                  className={`whitespace-nowrap text-sm font-bold transition-colors ${
                    isActive
                      ? "text-white"
                      : "text-[#6b7f75] hover:text-[#f0fdf4]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right CTA - hidden on small screens */}
        <div
          className="flex items-center shrink-0 ml-8"
          style={{ display: "var(--nav-display, none)" }}
        >
          <Link href="https://deropay.derod.org" className="btn-accent px-5 py-2 text-sm whitespace-nowrap">
            Get Started
          </Link>
        </div>

        {/* Mobile hamburger - shown only on small screens */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="ml-auto text-white"
          style={{ display: "var(--burger-display, block)" }}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      {/* Responsive CSS using a style tag so we don't rely on Tailwind responsive */}
      <style>{`
        :root {
          --nav-display: none;
          --burger-display: block;
        }
        @media (min-width: 768px) {
          :root {
            --nav-display: flex;
            --burger-display: none;
          }
        }
      `}</style>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-[#1e2a24] bg-black"
          >
            <div className="flex flex-col p-6 space-y-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-lg font-bold text-white"
                >
                  {link.label}
                </Link>
              ))}
              <div className="h-px bg-[#1e2a24] my-4" />
              <Link
                href="https://deropay.derod.org"
                className="btn-accent w-full text-center"
                onClick={() => setMobileOpen(false)}
              >
                Get Started
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
