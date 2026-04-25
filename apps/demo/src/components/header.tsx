"use client";

import { useDeroAuthContext } from "dero-auth/react";
import { ShoppingCart, LogOut, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./cart-context";
import { useToast } from "./toast";
import { useEffect, useRef } from "react";
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

export function Header() {
  const { signIn, signOut, isLoading, isAuthenticated, address, error } = useDeroAuthContext();
  const { totalItems } = useCart();
  const pathname = usePathname();
  const { error: toastError, info } = useToast();
  const prevError = useRef(error);

  useEffect(() => {
    if (error && error !== prevError.current) {
      const details = getAuthErrorDetails(error);
      toastError(details.title, details.message);
    }
    prevError.current = error;
  }, [error, toastError]);

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

  const navItems = [
    { href: "/", label: "Collection" },
    { href: "/cart", label: "Cart" },
    { href: "/checkout", label: "Checkout" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[rgba(6,8,6,0.78)] backdrop-blur-xl">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-4 px-6 md:px-10">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80"
          >
            <DeroIcon size={28} className="text-[var(--accent-strong)]" />
            <span className="font-display text-2xl font-bold tracking-tight text-white">
              DeroPay
            </span>
          </Link>

          <nav className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] p-1 md:flex">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    active
                      ? "bg-white text-[#071008] shadow-[0_10px_30px_rgba(255,255,255,0.08)]"
                      : "text-[var(--text-secondary)] hover:text-white"
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
            className="glass-panel flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold text-white hover:border-[var(--border-strong)]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06]">
              <ShoppingCart className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">Bag</span>
            <span className="rounded-full bg-[var(--accent-dim)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-strong)]">
              {totalItems} item{totalItems === 1 ? "" : "s"}
            </span>
          </Link>

          <button
            onClick={handleSignIn}
            disabled={isLoading}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold active:scale-95 disabled:cursor-wait disabled:opacity-60 disabled:active:scale-100 ${
              isAuthenticated
                ? "border border-[var(--border-strong)] bg-[var(--accent-dim)] text-white hover:bg-[rgba(49,223,144,0.2)]"
                : "glass-panel text-white hover:border-[var(--border-strong)]"
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : isAuthenticated ? (
              <>
                <LogOut className="w-4 h-4" />
                {address ? `${address.slice(0, 8)}…${address.slice(-4)}` : "Sign Out"}
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
