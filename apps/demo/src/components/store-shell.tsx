import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";

export function StoreShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--page-bg)] text-[var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="ambient-orb ambient-orb-left" />
        <div className="ambient-orb ambient-orb-right" />
        <div className="ambient-grid" />
      </div>

      <div className="relative flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
