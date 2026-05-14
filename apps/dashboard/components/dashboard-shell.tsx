"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { ShortcutsOverlay } from "./shortcuts-overlay";
import { DotGridBackdrop } from "./ui/hologram";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { useKeyboardNav } from "@/lib/useKeyboardNav";

type Health = {
  status: string;
  engine: string;
  wallet: { address: string; balance: string; unlockedBalance: string };
};

/**
 * Shell wraps every route. The main area renders as a *floating card* —
 * rounded top-left corner, subtle elevated background, hairline top/left
 * highlight — lifted above the sidebar panel. This is the structural move
 * that separates a reference-school dashboard from a generic two-pane.
 *
 * Responsive behaviour:
 * - `[data-sidebar="rail"]` at ≤1024px collapses sidebar to an icon rail.
 * - `[data-sidebar="drawer"]` / `"drawer-open"` at ≤720px moves the sidebar
 *    off-canvas; a hamburger button toggles it.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: health } = useLiveFetch<Health>(
    "health",
    async () => {
      const r = await fetch("/api/pay/health");
      if (!r.ok) throw new Error("health http " + r.status);
      return (await r.json()) as Health;
    },
    { refreshInterval: 15_000 },
  );
  const walletAddress = health?.wallet?.address;

  useKeyboardNav();

  const [layout, setLayout] = useState<"full" | "rail" | "drawer">("full");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const mqRail = window.matchMedia("(max-width: 1024px)");
    const mqPhone = window.matchMedia("(max-width: 720px)");
    const update = () => {
      if (mqPhone.matches) setLayout("drawer");
      else if (mqRail.matches) setLayout("rail");
      else setLayout("full");
    };
    update();
    mqRail.addEventListener("change", update);
    mqPhone.addEventListener("change", update);
    return () => {
      mqRail.removeEventListener("change", update);
      mqPhone.removeEventListener("change", update);
    };
  }, []);

  // close drawer on route change / widening
  useEffect(() => {
    if (layout !== "drawer") setDrawerOpen(false);
  }, [layout]);

  const dataSidebar =
    layout === "drawer"
      ? drawerOpen
        ? "drawer-open"
        : "drawer"
      : layout === "rail"
        ? "rail"
        : undefined;

  return (
    <div
      data-sidebar={dataSidebar}
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--ink-deep)",
      }}
    >
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar />
      {layout === "drawer" && drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 799,
            background: "rgba(0,0,0,0.5)",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        />
      )}
      <main
        id="main-content"
        className="app-main"
        tabIndex={-1}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          padding: "14px 14px 14px 0",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--ink)",
            border: "1px solid var(--ink-hair)",
            borderRadius: "var(--radius-lg)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.035), 0 20px 60px -30px rgba(0,0,0,0.4)",
            padding: "32px 40px 48px",
            overflow: "auto",
            position: "relative",
          }}
        >
          <DotGridBackdrop />
          {layout === "drawer" && (
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
              style={{
                position: "sticky",
                top: 0,
                marginBottom: 16,
                width: 36,
                height: 36,
                borderRadius: 8,
                border: "1px solid var(--ink-hair)",
                background: "var(--ink-elev)",
                color: "var(--bone)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 5,
              }}
            >
              {drawerOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          )}
          <div
            style={{
              maxWidth: "var(--content-max)",
              margin: "0 auto",
              width: "100%",
              position: "relative",
              zIndex: 1,
            }}
          >
            {children}
          </div>
        </div>
      </main>
      <CommandPalette walletAddress={walletAddress} />
      <ShortcutsOverlay />
    </div>
  );
}
