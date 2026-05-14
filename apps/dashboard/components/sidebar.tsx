"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  FileClock,
  Receipt,
  Users,
  Package,
  Warehouse,
  Ticket,
  BadgePercent,
  BadgeDollarSign,
  ShieldCheck,
  Sparkles,
  Gift,
  Puzzle,
  Store,
  ArrowUpFromLine,
  Code2,
  Settings2,
  BarChart3,
  Inbox,
  Link2,
  Zap,
} from "lucide-react";
import { ProfileMenu } from "./profile-menu";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { useIsTestMode } from "@/lib/useIsTestMode";
import {
  getPluginNavItems,
  subscribeNavItems,
  type PluginNavItem,
} from "@/lib/widgets";

/**
 * Canonical sidebar nav list. IDs follow the `nav.<slug>` pattern used
 * by the command palette so the two surfaces can share persisted
 * identifiers (pins, recents, keyboard-nav chords, analytics).
 * Exported so the palette and future keyboard-chord handlers can reuse
 * the same source of truth.
 */
export type NavItem = {
  id: string;
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
};

export type NavSection = {
  id: string;
  label: string;
  items: readonly NavItem[];
};

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "nav.dashboard", href: "/", label: "Dashboard", Icon: LayoutDashboard },
      { id: "nav.notifications", href: "/notifications", label: "Notifications", Icon: Inbox },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    items: [
      { id: "nav.orders", href: "/orders", label: "Orders", Icon: ShoppingCart },
      { id: "nav.draft-orders", href: "/draft-orders", label: "Draft Orders", Icon: FileClock },
      { id: "nav.products", href: "/products", label: "Products", Icon: Package },
      { id: "nav.inventory", href: "/inventory", label: "Inventory", Icon: Warehouse },
      { id: "nav.price-lists", href: "/price-lists", label: "Price Lists", Icon: BadgeDollarSign },
      { id: "nav.customers", href: "/customers", label: "Customers", Icon: Users },
      { id: "nav.sales-channels", href: "/sales-channels", label: "Sales Channels", Icon: Store },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    items: [
      { id: "nav.invoices", href: "/invoices", label: "Invoices", Icon: Receipt },
      { id: "nav.payment-links", href: "/payment-links", label: "Payment links", Icon: Link2 },
      { id: "nav.escrow", href: "/escrow", label: "Escrow", Icon: ShieldCheck },
      { id: "nav.agent-payments", href: "/payments/agent", label: "Agent payments", Icon: Zap },
      { id: "nav.payouts", href: "/payouts", label: "Payouts", Icon: ArrowUpFromLine },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    items: [
      { id: "nav.promotions", href: "/promotions", label: "Promotions", Icon: BadgePercent },
      { id: "nav.gift-cards", href: "/gift-cards", label: "Gift Cards", Icon: Ticket },
      { id: "nav.credits", href: "/credits", label: "Credits", Icon: Gift },
      { id: "nav.partners", href: "/partners", label: "Partners", Icon: Sparkles },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    items: [
      { id: "nav.integrations", href: "/integrations", label: "Integrations", Icon: Puzzle },
      { id: "nav.automation", href: "/automation", label: "Automation", Icon: Zap },
      { id: "nav.developers", href: "/developers", label: "Developers", Icon: Code2 },
      { id: "nav.reports", href: "/reports", label: "Reports", Icon: BarChart3 },
      { id: "nav.settings", href: "/settings", label: "Settings", Icon: Settings2 },
    ],
  },
] as const;

export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap(
  (section) => section.items,
);

/** Stable empty-array reference so `useSyncExternalStore`'s server snapshot
 *  doesn't return a new array every render and break SSR hydration. */
const EMPTY_NAV: readonly PluginNavItem[] = Object.freeze([]);

type HealthPayload = { status: string };

function isActiveHref(href: string, path: string): boolean {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const { data, error } = useLiveFetch<HealthPayload>(
    "health",
    async () => {
      const r = await fetch("/api/pay/health");
      if (!r.ok) throw new Error("health http " + r.status);
      return (await r.json()) as HealthPayload;
    },
    { refreshInterval: 15_000 },
  );
  const nodeOk = data ? true : error ? false : null;

  // Unread-notification count for the sidebar badge. We ask the server for
  // just the count via `?limit=0` and read the X-Total response header —
  // no need to ship event bodies. Shared SSE feed keeps it live.
  const { data: unreadCount } = useLiveFetch<number>(
    "notifications-unread-count",
    async () => {
      const r = await fetch("/api/pay/events?state=unread&limit=0");
      if (!r.ok) throw new Error("events http " + r.status);
      const raw = r.headers.get("x-total");
      const n = raw != null ? Number.parseInt(raw, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    },
    { refreshInterval: 60_000, events: ["*"] },
  );

  const isDemo = useIsTestMode();

  // Phase 3 #29 — light-touch branding. If the active brand profile supplies
  // a `logoUrl`, swap it into the brand row in place of the default SVG.
  // Fetched once on mount; the header pill hard-reloads after switching
  // profiles so this state always matches the server-resolved active row.
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pay/brand-profiles/active")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.profile) return;
        setBrandLogoUrl(data.profile.logoUrl ?? null);
        setBrandName(data.profile.name ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Plugin-contributed nav items. `useSyncExternalStore` makes the sidebar
  // re-render when a plugin registers or unregisters a nav entry.
  const pluginNavItems = useSyncExternalStore(
    subscribeNavItems,
    getPluginNavItems,
    // Server snapshot — plugins only register on the client, so the SSR
    // render sees an empty list. That's fine; the client hydrates in.
    () => EMPTY_NAV,
  );

  const renderUnreadBadge = (href: string) => {
    if (href !== "/notifications") return null;
    if (!unreadCount || unreadCount <= 0) return null;
    return (
      <span
        className="sidebar-label mono"
        aria-hidden
        style={{
          fontSize: 10,
          letterSpacing: "0.04em",
          padding: "1px 6px",
          borderRadius: 999,
          background: "var(--dero)",
          color: "var(--ink-deep)",
          fontWeight: 600,
          minWidth: 18,
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    );
  };

  /**
   * Render a single nav row.
   */
  const renderRow = (item: NavItem) => {
    const isActive = isActiveHref(item.href, pathname);
    const badge = renderUnreadBadge(item.href);
    const labelForAria =
      item.href === "/notifications" && unreadCount && unreadCount > 0
        ? `${item.label} (${unreadCount} unread)`
        : item.label;

    return (
      <div
        key={item.id}
        className="sidebar-row"
        style={{ position: "relative", display: "block" }}
      >
        <Link
          href={item.href}
          aria-label={labelForAria}
          aria-current={isActive ? "page" : undefined}
          className={`sidebar-nav-item${isActive ? " is-active" : ""}`}
        >
          <item.Icon
            size={18}
            strokeWidth={isActive ? 2 : 1.6}
            style={{ flexShrink: 0 }}
          />
          <span className="sidebar-label" style={{ fontSize: 14, flex: 1 }}>
            {item.label}
          </span>
          {badge}
        </Link>
      </div>
    );
  };

  return (
    <aside
      className="sidebar"
      style={{
        width: "var(--sidebar-width)",
        position: "sticky",
        top: 0,
        height: "100vh",
        background: "var(--ink-deep)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Brand row */}
      <div
        style={{
          height: 68,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px",
        }}
      >
        {brandLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandLogoUrl}
            alt=""
            width={22}
            height={22}
            style={{ flexShrink: 0, objectFit: "contain" }}
          />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            width={28}
            height={28}
            aria-hidden
            style={{ flexShrink: 0 }}
          >
            <path d="M23,34.4v31.1l27,15.6,27-15.6v-31.1l-27-15.6-27,15.6ZM50,76.8l-6.1-3.5c.1-.8,2.3-14.4,2.4-15.8l-4.6-2.7v-9.6l8.3-4.8,8.3,4.8v9.6l-4.5,2.6c.2,1.4,2.3,15.1,2.4,15.8l-6.2,3.6ZM73.2,63.4l-13.4,7.7c0-.5-1.6-10.3-1.8-11.7l4.2-2.4v-14.1l-12.2-7-12.2,7v14.1l4.1,2.4c-.2,1.4-1.7,11.2-1.8,11.7l-13.3-7.7v-26.8l23.2-13.4,23.2,13.4v26.8Z" fill="var(--dero)" />
            <path d="M50,.3L7,25.2v49.7l43,24.8,43-24.8V25.2L50,.3ZM77,65.6l-27,15.6-27-15.6v-31.1l27-15.6,27,15.6v31.1Z" fill="var(--ink-deep)" />
            <path d="M26.8,36.6v26.8l13.3,7.7c0-.4,1.6-10.3,1.8-11.7l-4.1-2.4v-14.1l12.2-7,12.2,7v14.1l-4.2,2.4c.2,1.4,1.7,11.2,1.8,11.7l13.4-7.7v-26.8l-23.2-13.4-23.2,13.4Z" fill="var(--ink-deep)" />
            <path d="M58.3,54.8v-9.6l-8.3-4.8-8.3,4.8v9.6l4.6,2.7c-.2,1.4-2.3,15-2.4,15.8l6.1,3.5,6.2-3.6c-.1-.7-2.2-14.4-2.4-15.8l4.5-2.6Z" fill="var(--ink-deep)" />
          </svg>
        )}
        <span
          className="sidebar-label"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--bone)",
          }}
        >
          {brandName ?? "DeroPay"}
        </span>
      </div>

      {/* Scroll region: grouped nav sections */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "4px 12px 8px",
          gap: 2,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {/* Main nav — grouped by operating domain so the commerce stack
            reads like a professional admin console instead of one long list. */}
        <nav
          aria-label="Primary"
          style={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {NAV_SECTIONS.map((section, index) => (
            <div key={section.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <SectionEyebrow label={section.label.toUpperCase()} />
              {section.items.map((item) => renderRow(item))}
              {index < NAV_SECTIONS.length - 1 && <SectionDivider />}
            </div>
          ))}
        </nav>

        {/* Plugin-contributed nav entries. Sits below the main nav so
            first-party routes always come first. */}
        {pluginNavItems.length > 0 && (
          <nav
            aria-label="Plugins"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              marginTop: 8,
            }}
          >
            <SectionDivider />
            <SectionEyebrow label="PLUGINS" />
            {pluginNavItems.map((item) => (
              <PluginNavRow
                key={item.id}
                item={item}
                isActive={isActiveHref(item.href, pathname)}
              />
            ))}
          </nav>
        )}
      </div>

      {/* Node status strip */}
      <div
        className="sidebar-subtitle"
        style={{
          padding: "10px 18px",
          display: "flex",
          alignItems: "center",
          gap: 9,
          fontSize: 11.5,
          color: "var(--bone-dim)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: nodeOk ? "var(--dero)" : "var(--vermilion)",
            boxShadow: nodeOk
              ? "0 0 0 3px rgba(94,196,134,0.18)"
              : "0 0 0 3px rgba(224,93,68,0.18)",
            animation: nodeOk ? "pulse-dot 1.8s ease-in-out infinite" : undefined,
            flexShrink: 0,
          }}
        />
        <span style={{ color: "var(--bone)" }}>
          {nodeOk === null ? "Checking…" : nodeOk ? "Node synced" : "Node offline"}
        </span>
      </div>

      {/* Bottom merchant row */}
      <div
        className="sidebar-merchant-row"
        style={{
          padding: "14px 16px 18px",
          borderTop: "1px solid var(--ink-hair)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-sm)",
            background: "var(--ink-elev-2)",
            border: "1px solid var(--ink-hair)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "var(--bone-dim)",
          }}
          aria-hidden
        >
          <BarChart3 size={15} strokeWidth={1.8} />
        </div>
        <div style={{ minWidth: 0, flex: 1, lineHeight: 1.28 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--bone)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {isDemo ? "Demo Merchant" : "Merchant"}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--bone-mute)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              letterSpacing: "0.005em",
            }}
          >
            {isDemo ? "@demo" : "@self-hosted"}
          </div>
        </div>
        <ProfileMenu />
      </div>
    </aside>
  );
}

function SectionEyebrow({ label }: { label: string }) {
  return (
    <div
      className="eyebrow-mono sidebar-label"
      aria-hidden
      style={{
        padding: "10px 12px 4px",
        fontSize: 9.5,
        color: "var(--bone-quiet)",
        letterSpacing: "0.24em",
      }}
    >
      {label}
    </div>
  );
}

/**
 * Sidebar row for a plugin-registered nav entry. Visually matches the main
 * nav rows but without a pin toggle — plugin routes shouldn't compete for
 * pin real estate with first-party pages.
 */
function PluginNavRow({
  item,
  isActive,
}: {
  item: PluginNavItem;
  isActive: boolean;
}) {
  return (
    <div
      className="sidebar-row"
      style={{ position: "relative", display: "block" }}
    >
      <Link
        href={item.href}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        className={`sidebar-nav-item${isActive ? " is-active" : ""}`}
      >
        {/* Default icon if the plugin didn't supply one — keeps the row
            visually aligned with the main nav. */}
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            width: 18,
            height: 18,
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "inherit",
          }}
        >
          {item.icon ?? <Puzzle size={18} strokeWidth={isActive ? 2 : 1.6} />}
        </span>
        <span className="sidebar-label" style={{ fontSize: 14, flex: 1 }}>
          {item.label}
        </span>
      </Link>
    </div>
  );
}

function SectionDivider() {
  return (
    <div
      aria-hidden
      className="sidebar-label"
      style={{
        height: 1,
        margin: "8px 8px",
        background: "var(--ink-hair)",
      }}
    />
  );
}
