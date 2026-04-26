"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, Landmark, Presentation, ReceiptText, Search, ShoppingCart, Store, WalletCards } from "lucide-react";
import { useMarketplace } from "@/context/marketplace-context";

const nav = [
  { href: "/", label: "Market", Icon: Search },
  { href: "/reveal", label: "Reveal", Icon: Presentation },
  { href: "/acquire", label: "Acquire", Icon: Landmark },
  { href: "/orders", label: "Orders", Icon: ReceiptText },
  { href: "/sell", label: "Sell", Icon: Store },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { cartCount, orders, serverError } = useMarketplace();
  const pendingOrders = orders.filter((order) =>
    ["awaiting_payment", "payment_detected", "confirming", "delivered", "disputed"].includes(order.status)
  ).length;
  const showDev = process.env.NODE_ENV !== "production";

  return (
    <>
      <header className="sticky top-0 z-40 shadow-sm">
        <div className="commerce-header">
          <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3">
            <Link href="/" className="brand-link" aria-label="DeroBay home">
              <span className="brand-wordmark">
                Dero<span>Bay</span>
              </span>
            </Link>

            <nav className="ml-auto flex items-center gap-1">
              {nav.map(({ href, label, Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-label={label}
                    className={active ? "btn-secondary border-white text-[var(--ink)]" : "btn-plain text-white"}
                  >
                    <Icon size={16} />
                    <span className="hide-mobile">{label}</span>
                  </Link>
                );
              })}
              {showDev ? (
                <Link
                  href="/dev"
                  className={pathname === "/dev" ? "btn-secondary border-white text-[var(--ink)]" : "btn-plain text-white"}
                >
                  <FlaskConical size={16} />
                  <span className="hide-mobile">Dev</span>
                </Link>
              ) : null}
              <Link href="/checkout" className="btn-primary" aria-label="Open cart and checkout">
                <ShoppingCart size={17} />
                <span>{cartCount}</span>
              </Link>
            </nav>
          </div>
        </div>
        <div className="commerce-subbar">
          <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-4 py-2 text-sm text-[var(--muted)]">
            <WalletCards size={16} />
            <span>DeroPay-style invoices</span>
            <span className="text-[var(--line)]">/</span>
            <span>Escrow, router, and direct rails</span>
            {pendingOrders > 0 ? (
              <>
                <span className="text-[var(--line)]">/</span>
                <Link href="/orders" className="font-bold text-[var(--dero-strong)]">
                  {pendingOrders} order{pendingOrders === 1 ? "" : "s"} need attention
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </header>
      {serverError ? (
        <div className="border-b border-[rgba(161,98,7,0.28)] bg-[#fff7ed] px-4 py-2 text-center text-sm text-[var(--amber)]">
          {serverError}
        </div>
      ) : null}
      <main className="page-shell">{children}</main>
    </>
  );
}
