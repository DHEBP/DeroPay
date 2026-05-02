"use client";

import { useDeroAuthContext } from "dero-auth/react";
import { ShoppingCart, LogOut, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./cart-context";
import { useToast } from "./toast";
import { useEffect, useRef, useState } from "react";
import { DeroIcon } from "@/components/dero-icon";

function getAuthErrorDetails(error: { message?: string } | null): { title: string; message: string } {
  const message = (error?.message ?? "").toLowerCase();

  if (
    message.includes("wallet running") ||
    message.includes("no dero wallet reachable") ||
    message.includes("timed out") ||
    message.includes("websocket error")
  ) {
    return {
      title: "Wallet not found",
      message: "Open your DERO wallet (Engram or CLI) and enable XSWD, then try again.",
    };
  }

  if (message.includes("connection rejected") || message.includes("rejected by wallet")) {
    return {
      title: "Connection rejected",
      message: "The wallet refused the connection request.",
    };
  }

  return {
    title: "Sign-in failed",
    message: error?.message ?? "Unknown error",
  };
}

/**
 * Pills route to in-page anchors when on the home page (smooth scroll), and
 * resolve to `/#section` from cart/checkout so any pill click anywhere in the
 * demo lands the visitor at the right showcase section. Active state is
 * driven by an IntersectionObserver scroll-spy that runs only on `/`.
 */
const flowItems = [
  { id: "demo-experience", label: "How it works" },
  { id: "collection", label: "Shop" },
] as const;

export function Header() {
  const { signIn, signOut, isLoading, isAuthenticated, address, error } = useDeroAuthContext();
  const { totalItems } = useCart();
  const pathname = usePathname();
  const { error: toastError, info } = useToast();
  const prevError = useRef(error);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const isHome = pathname === "/";

  useEffect(() => {
    if (error && error !== prevError.current) {
      const details = getAuthErrorDetails(error);
      toastError(details.title, details.message);
    }
    prevError.current = error;
  }, [error, toastError]);

  // Scroll-spy — only meaningful on the home page where the anchored
  // sections actually exist. We treat a section as "active" when its
  // upper portion crosses the top third of the viewport, which feels
  // more responsive than waiting for full visibility.
  useEffect(() => {
    if (!isHome) {
      setActiveSection(null);
      return;
    }

    const targets = flowItems
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        // Section becomes "active" once it occupies the band between
        // 25%–75% of the viewport — past the navbar, before the bottom.
        rootMargin: "-25% 0px -50% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isHome]);

  const handleSignIn = async () => {
    if (isAuthenticated) {
      signOut();
      info("Signed out", "Your DERO session has ended.");
    } else {
      try {
        await signIn();
      } catch {
        // Provider state drives the visible error toast.
      }
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[rgba(6,8,6,0.78)] backdrop-blur-xl">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-4 px-6 md:px-10">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-3 transition-opacity hover:opacity-85"
            aria-label="DeroPay demo — back to top"
          >
            <DeroIcon size={28} className="text-[var(--accent-strong)]" />
            <span className="font-display text-2xl font-bold tracking-tight text-white">
              DeroPay
            </span>
          </Link>

          <nav
            aria-label="Demo flow"
            className="hidden h-9 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] p-1 backdrop-blur-sm md:flex"
          >
            {flowItems.map((item) => {
              const active = isHome && activeSection === item.id;
              const href = isHome ? `#${item.id}` : `/#${item.id}`;
              return (
                <Link
                  key={item.id}
                  href={href}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex h-7 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-white text-[#071008] shadow-[0_8px_24px_-12px_rgba(255,255,255,0.18)]"
                      : "text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/cart"
            aria-label={`Bag — ${totalItems} item${totalItems === 1 ? "" : "s"}`}
            className="glass-panel flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-white transition-colors hover:border-[var(--border-strong)]"
          >
            <span
              aria-hidden="true"
              className="flex items-center justify-center text-[var(--text-secondary)]"
            >
              <ShoppingCart className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">Bag</span>
            <span className="inline-flex h-5 items-center rounded-full bg-[var(--accent-dim)] px-2 text-[11px] font-semibold tabular-nums text-[var(--accent-strong)]">
              {totalItems} item{totalItems === 1 ? "" : "s"}
            </span>
          </Link>

          <button
            type="button"
            onClick={handleSignIn}
            disabled={isLoading}
            aria-label={
              isAuthenticated
                ? "Sign out of DERO wallet"
                : "Sign in with DERO wallet"
            }
            className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors active:scale-95 disabled:cursor-wait disabled:opacity-60 disabled:active:scale-100 ${
              isAuthenticated
                ? "border border-[var(--border-strong)] bg-[var(--accent-dim)] text-white hover:bg-[rgba(49,223,144,0.2)]"
                : "glass-panel text-white hover:border-[var(--border-strong)]"
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Connecting…
              </>
            ) : isAuthenticated ? (
              <>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {address ? `${address.slice(0, 8)}\u2026${address.slice(-4)}` : "Sign Out"}
              </>
            ) : (
              <>
                <DeroIcon size={16} className="text-[var(--accent-strong)]" />
                Sign In with DERO
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
