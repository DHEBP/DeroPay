"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Receipt,
  Users,
  Package,
  Ticket,
  ShieldCheck,
  Sparkles,
  Gift,
  Puzzle,
  ArrowUpFromLine,
  Code2,
  Settings2,
  Link2,
  Plus,
  Copy,
  FileText,
  BarChart3,
  Zap,
  Keyboard,
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  BellOff,
  FlaskConical,
  Bell,
} from "lucide-react";
import { useToast } from "./toast";
import { useShortcuts } from "./shortcuts-overlay";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { TEST_MODE_COOKIE } from "@/lib/test-mode";

type CommandGroup =
  | "Results"
  | "Navigation"
  | "Actions"
  | "Notifications"
  | "Test mode"
  | "Help";

const GROUP_ORDER: readonly CommandGroup[] = [
  "Results",
  "Navigation",
  "Actions",
  "Notifications",
  "Test mode",
  "Help",
] as const;

/**
 * A palette row is either a navigation target (pushes via next/router) or
 * an inline action (arbitrary side-effect via `onRun`). The discriminated
 * union keeps the two shapes honest at the callsite so we don't have to
 * branch on truthy `href` / `onRun` at render time.
 */
type PaletteItemBase = {
  id: string;
  label: string;
  hint?: string;
  group: CommandGroup;
  keywords?: string;
  Icon: typeof LayoutDashboard;
  shortcut?: string;
};

export type PaletteItem =
  | (PaletteItemBase & { kind: "nav"; href: string })
  | (PaletteItemBase & {
      kind: "action";
      onRun: () => void | Promise<void>;
    });

type SearchableInvoice = {
  id: string;
  name: string;
  paymentId: string;
  status: string;
};

type CommandPaletteProps = {
  walletAddress?: string;
};

/**
 * Parse a shortcut string like "Ctrl+K", "G D", or "?" into a sequence of
 * keycap elements. `+` joins modifier combos (rendered without a separator
 * between caps); a space joins chord sequences (rendered with a muted
 * "then" label between caps).
 */
function renderShortcut(s: string): ReactNode {
  if (!s) return null;
  // Chord (space-separated) → "G D" becomes [G] then [D]
  const isChord = /\s/.test(s);
  const parts = isChord ? s.split(/\s+/) : s.split("+");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        flexShrink: 0,
      }}
    >
      {parts.map((p, i) => (
        <Fragment key={`${p}-${i}`}>
          {i > 0 && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                color: "var(--bone-quiet)",
                letterSpacing: "0.08em",
                padding: "0 1px",
              }}
            >
              {isChord ? "then" : "+"}
            </span>
          )}
          <kbd
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--bone)",
              background: "var(--ink-elev)",
              border: "1px solid var(--ink-hair)",
              borderRadius: 3,
              padding: "1px 5px",
              lineHeight: 1.4,
              display: "inline-block",
              minWidth: 16,
              textAlign: "center",
            }}
          >
            {p}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Cmd/Ctrl+K global command palette. Keyboard-native:
 * - Cmd+K / Ctrl+K   — toggle open
 * - Esc              — close
 * - ↑ / ↓            — move selection (wraps across section headers)
 * - Enter            — run selected command
 *
 * Item model is a discriminated union over `kind: "nav" | "action"` so
 * nav items push routes via next/router and actions fire arbitrary side
 * effects (refresh, toggle test mode, mark notifications read, etc.).
 *
 * Portal-rendered so z-index + focus-trap work regardless of ancestors.
 * Respects prefers-reduced-motion via framer-motion.
 */
export function CommandPalette({ walletAddress }: CommandPaletteProps) {
  const router = useRouter();
  const { toast } = useToast();
  const shortcuts = useShortcuts();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Debounced query drives the dynamic-results fetch only. The static
  // command list filters against `query` directly so nav feels instant.
  const debouncedQuery = useDebouncedValue(query, 180);
  const searchable = debouncedQuery.trim().length >= 2;

  // Subscribe to the shared `invoices-all` cache. When the /invoices
  // page or dashboard home has already fetched, this is a zero-cost
  // read. When the palette is the first consumer, useLiveFetch dedups
  // and fetches once.
  const { data: liveInvoices } = useLiveFetch<SearchableInvoice[]>(
    searchable && open ? "invoices-all" : null,
    async () => {
      const r = await fetch("/api/pay/invoices?limit=50");
      if (!r.ok) throw new Error("invoices http " + r.status);
      return (await r.json()) as SearchableInvoice[];
    },
  );

  const resultCommands = useMemo<PaletteItem[]>(() => {
    if (!searchable || !liveInvoices) return [];
    const q = debouncedQuery.trim().toLowerCase();
    const matches = liveInvoices
      .filter(
        (inv) =>
          inv.id.toLowerCase().includes(q) ||
          inv.name.toLowerCase().includes(q) ||
          inv.paymentId.toLowerCase().includes(q),
      )
      .slice(0, 6);
    return matches.map<PaletteItem>((inv) => ({
      kind: "nav",
      id: `result.invoice.${inv.id}`,
      label: inv.name || inv.id,
      hint: inv.id,
      group: "Results" as const,
      keywords: `${inv.id} ${inv.paymentId} invoice`,
      Icon: Receipt,
      href: `/invoices?id=${encodeURIComponent(inv.id)}`,
    }));
  }, [searchable, liveInvoices, debouncedQuery]);

  const commands = useMemo<PaletteItem[]>(
    () => [
      // ── Navigation ────────────────────────────────────────────────
      {
        kind: "nav",
        id: "nav.dashboard",
        label: "Go to Dashboard",
        group: "Navigation",
        keywords: "home overview",
        Icon: LayoutDashboard,
        href: "/",
        shortcut: "G D",
      },
      {
        kind: "nav",
        id: "nav.invoices",
        label: "Go to Invoices",
        group: "Navigation",
        keywords: "bills orders payments",
        Icon: Receipt,
        href: "/invoices",
        shortcut: "G I",
      },
      {
        kind: "nav",
        id: "nav.payment-links",
        label: "Go to Payment links",
        group: "Navigation",
        keywords: "share link public tip jar donation url",
        Icon: Link2,
        href: "/payment-links",
      },
      {
        kind: "nav",
        id: "nav.customers",
        label: "Go to Customers",
        group: "Navigation",
        keywords: "payors people directory ltv",
        Icon: Users,
        href: "/customers",
        shortcut: "G C",
      },
      {
        kind: "nav",
        id: "nav.products",
        label: "Go to Products",
        group: "Navigation",
        keywords: "catalog sku items merchandise",
        Icon: Package,
        href: "/products",
        shortcut: "G P",
      },
      {
        kind: "nav",
        id: "nav.gift-cards",
        label: "Go to Gift Cards",
        group: "Navigation",
        keywords: "voucher prepaid code redeem breakage store credit",
        Icon: Ticket,
        href: "/gift-cards",
        shortcut: "G G",
      },
      {
        kind: "nav",
        id: "nav.escrow",
        label: "Go to Escrow",
        group: "Navigation",
        keywords: "holds deposits locked",
        Icon: ShieldCheck,
        href: "/escrow",
        shortcut: "G E",
      },
      {
        kind: "nav",
        id: "nav.partners",
        label: "Go to Partners",
        group: "Navigation",
        keywords: "affiliate referral commission",
        Icon: Sparkles,
        href: "/partners",
        shortcut: "G T",
      },
      {
        kind: "nav",
        id: "nav.credits",
        label: "Go to Credits",
        group: "Navigation",
        keywords: "promos bounties fee waivers rewards vouchers",
        Icon: Gift,
        href: "/credits",
        shortcut: "G U",
      },
      {
        kind: "nav",
        id: "nav.integrations",
        label: "Go to Integrations",
        group: "Navigation",
        keywords: "plugins woocommerce medusa shopify",
        Icon: Puzzle,
        href: "/integrations",
      },
      {
        kind: "nav",
        id: "nav.payouts",
        label: "Go to Payouts",
        group: "Navigation",
        keywords: "withdraw send treasury cold storage",
        Icon: ArrowUpFromLine,
        href: "/payouts",
        shortcut: "G O",
      },
      {
        kind: "nav",
        id: "nav.developers",
        label: "Go to Developers",
        group: "Navigation",
        keywords: "api keys webhooks events docs",
        Icon: Code2,
        href: "/developers",
        shortcut: "G V",
      },
      {
        kind: "nav",
        id: "nav.notifications",
        label: "Go to Notifications",
        group: "Navigation",
        keywords: "events activity alerts inbox",
        Icon: Bell,
        href: "/notifications",
        shortcut: "G N",
      },
      {
        kind: "nav",
        id: "nav.reports",
        label: "Go to Reports",
        group: "Navigation",
        keywords: "analytics insights charts",
        Icon: BarChart3,
        href: "/reports",
        shortcut: "G R",
      },
      {
        kind: "nav",
        id: "nav.settings",
        label: "Go to Settings",
        group: "Navigation",
        keywords: "config preferences wallet",
        Icon: Settings2,
        href: "/settings",
        shortcut: "G S",
      },

      // ── Actions ────────────────────────────────────────────────────
      {
        kind: "nav",
        id: "new.invoice",
        label: "New invoice",
        hint: "Open invoice form",
        group: "Actions",
        keywords: "charge bill payment new add create",
        Icon: Plus,
        href: "/invoices?new=1",
        shortcut: "N I",
      },
      {
        kind: "nav",
        id: "new.escrow",
        label: "New escrow",
        group: "Actions",
        keywords: "hold deposit locked create new",
        Icon: ShieldCheck,
        href: "/escrow?new=1",
        shortcut: "N E",
      },
      {
        kind: "nav",
        id: "action.view-reports",
        label: "Open analytics / reports",
        group: "Actions",
        keywords: "analytics charts insights revenue",
        Icon: BarChart3,
        href: "/reports",
      },
      {
        kind: "action",
        id: "refresh.dashboard",
        label: "Refresh dashboard",
        group: "Actions",
        keywords: "reload refetch live data",
        Icon: RefreshCw,
        onRun: () => {
          window.location.reload();
        },
      },
      {
        kind: "action",
        id: "action.copy-address",
        label: walletAddress ? "Copy wallet address" : "No wallet connected",
        hint: walletAddress
          ? `${walletAddress.slice(0, 10)}…${walletAddress.slice(-6)}`
          : undefined,
        group: "Actions",
        keywords: "copy address clipboard wallet",
        Icon: Copy,
        onRun: async () => {
          if (!walletAddress) {
            toast({ title: "No wallet address available", tone: "warn" });
            return;
          }
          try {
            await navigator.clipboard.writeText(walletAddress);
            toast({
              title: "Wallet address copied",
              description: "Paste it wherever a payor expects it.",
              tone: "success",
            });
          } catch {
            toast({ title: "Clipboard unavailable", tone: "error" });
          }
        },
      },

      // ── Notifications ──────────────────────────────────────────────
      {
        kind: "action",
        id: "notif.mark-all-read",
        label: "Mark all notifications read",
        group: "Notifications",
        keywords: "clear inbox events read dismiss",
        Icon: BellOff,
        onRun: async () => {
          try {
            const r = await fetch("/api/pay/events", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: "*", action: "read" }),
            });
            if (!r.ok) throw new Error("http " + r.status);
            toast({
              title: "All notifications marked read",
              tone: "success",
            });
          } catch {
            toast({
              title: "Couldn't update notifications",
              description: "The events service is unreachable.",
              tone: "error",
            });
          }
        },
      },

      // ── Test mode ──────────────────────────────────────────────────
      {
        kind: "action",
        id: "mode.toggle",
        label: "Toggle test mode",
        hint: "Swap Test ↔ Live and reload",
        group: "Test mode",
        keywords: "demo live simulated sandbox test mode switch",
        Icon: FlaskConical,
        onRun: () => {
          const re = new RegExp(`${TEST_MODE_COOKIE}=(test|live)`);
          const curr = document.cookie.match(re)?.[1];
          const next = curr === "test" ? "live" : "test";
          document.cookie = `${TEST_MODE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
          // Reload so the server layout can re-read the cookie and
          // the demo banner appears/disappears.
          window.location.reload();
        },
      },

      // ── Help ───────────────────────────────────────────────────────
      {
        kind: "action",
        id: "help.docs",
        label: "Open DeroPay docs",
        group: "Help",
        keywords: "documentation help guide",
        Icon: FileText,
        onRun: () => {
          window.open("https://deropay.com/docs", "_blank", "noopener,noreferrer");
        },
      },
      {
        kind: "action",
        id: "help.shortcuts",
        label: "Show keyboard shortcuts",
        group: "Help",
        keywords: "keybindings hotkeys reference sheet",
        Icon: Keyboard,
        shortcut: "?",
        onRun: () => shortcuts.open(),
      },
      {
        kind: "nav",
        id: "help.status",
        label: "Jump to node status",
        group: "Help",
        keywords: "health daemon wallet online",
        Icon: Zap,
        href: "/settings#node",
      },
    ],
    [walletAddress, toast, shortcuts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const staticMatches = q
      ? commands.filter((c) => {
          const hay = `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase();
          return hay.includes(q);
        })
      : commands;
    return [...resultCommands, ...staticMatches];
  }, [commands, query, resultCommands]);

  const grouped = useMemo(() => {
    const groups: Partial<Record<CommandGroup, PaletteItem[]>> = {};
    for (const cmd of filtered) {
      (groups[cmd.group] ??= []).push(cmd);
    }
    return groups;
  }, [filtered]);

  const flatOrdered = useMemo(() => {
    const order: PaletteItem[] = [];
    for (const group of GROUP_ORDER) {
      const items = grouped[group];
      if (items) order.push(...items);
    }
    return order;
  }, [grouped]);

  // Global open shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Clamp selection on filter change
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, flatOrdered.length - 1)));
  }, [flatOrdered.length]);

  const runCommand = useCallback(
    (cmd: PaletteItem) => {
      setOpen(false);
      // Let the close transition start before the route change / action.
      setTimeout(() => {
        if (cmd.kind === "nav") {
          router.push(cmd.href);
        } else {
          // Fire and forget — actions are responsible for their own
          // error reporting via toast.
          void cmd.onRun();
        }
      }, 60);
    },
    [router],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (s + 1) % Math.max(1, flatOrdered.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(
        (s) => (s - 1 + flatOrdered.length) % Math.max(1, flatOrdered.length),
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = flatOrdered[selected];
      if (cmd) runCommand(cmd);
    }
  };

  if (!mounted) return null;

  const palette = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(4, 6, 4, 0.62)",
            backdropFilter: "blur(6px)",
            zIndex: 800,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "14vh",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(640px, 92vw)",
              background: "var(--ink-elev)",
              border: "1px solid var(--ink-hair-strong)",
              borderRadius: "var(--radius-lg)",
              boxShadow:
                "0 24px 80px -24px rgba(0,0,0,0.6), 0 0 0 1px rgba(94,196,134,0.05)",
              overflow: "hidden",
            }}
          >
            {/* Input */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 16px",
                borderBottom: "1px solid var(--ink-hair)",
              }}
            >
              <Search size={15} color="var(--bone-mute)" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                placeholder="Search commands, pages, actions…"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--bone)",
                  fontSize: 14,
                  fontFamily: "var(--font-sans)",
                }}
              />
              <kbd
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  color: "var(--bone-mute)",
                  border: "1px solid var(--ink-hair)",
                  borderRadius: 4,
                  padding: "2px 5px",
                  background: "var(--ink-deep)",
                }}
              >
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div
              style={{
                maxHeight: 420,
                overflowY: "auto",
                padding: "6px",
              }}
            >
              {flatOrdered.length === 0 ? (
                <div
                  style={{
                    padding: "28px 16px",
                    textAlign: "center",
                    color: "var(--bone-mute)",
                    fontSize: 13,
                  }}
                >
                  No matches for &ldquo;{query}&rdquo;.
                </div>
              ) : (
                (Object.keys(grouped) as CommandGroup[])
                  .sort(
                    (a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b),
                  )
                  .map((group) => (
                    <div key={group} style={{ marginBottom: 4 }}>
                      <div
                        className="eyebrow"
                        style={{
                          padding: "10px 10px 6px",
                          fontSize: 9.5,
                          color: "var(--bone-quiet)",
                          letterSpacing: "0.24em",
                        }}
                      >
                        {group}
                      </div>
                      {(grouped[group] ?? []).map((cmd) => {
                        const idx = flatOrdered.indexOf(cmd);
                        const active = idx === selected;
                        return (
                          <button
                            key={cmd.id}
                            type="button"
                            onClick={() => runCommand(cmd)}
                            onMouseEnter={() => setSelected(idx)}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "10px 12px",
                              borderRadius: "var(--radius)",
                              background: active
                                ? "var(--ink-elev-2)"
                                : "transparent",
                              border: "none",
                              color: active ? "var(--bone)" : "var(--bone-dim)",
                              cursor: "pointer",
                              fontFamily: "var(--font-sans)",
                              fontSize: 13.5,
                              textAlign: "left",
                            }}
                          >
                            <cmd.Icon
                              size={16}
                              strokeWidth={active ? 2 : 1.6}
                              color={active ? "var(--dero)" : "var(--bone-mute)"}
                              style={{ flexShrink: 0 }}
                            />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              {cmd.label}
                              {cmd.hint && (
                                <span
                                  style={{
                                    marginLeft: 8,
                                    color: "var(--bone-quiet)",
                                    fontSize: 11.5,
                                    fontFamily: "var(--font-mono)",
                                  }}
                                >
                                  {cmd.hint}
                                </span>
                              )}
                            </span>
                            {cmd.shortcut && renderShortcut(cmd.shortcut)}
                            {active && (
                              <CornerDownLeft
                                size={13}
                                color="var(--bone-mute)"
                                style={{ flexShrink: 0 }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "10px 16px",
                borderTop: "1px solid var(--ink-hair)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                color: "var(--bone-quiet)",
                background: "var(--ink-deep)",
              }}
            >
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <ArrowUp size={11} /> <ArrowDown size={11} /> navigate
              </span>
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <CornerDownLeft size={11} /> select
              </span>
              <span style={{ marginLeft: "auto" }}>
                DeroPay ·{" "}
                <span style={{ color: "var(--dero)" }}>{flatOrdered.length}</span>{" "}
                commands
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(palette, document.body);
}

/**
 * Tiny debounce hook — returns `value` after it has been stable for
 * `delay` ms. Used to gate palette result fetches so keystrokes don't
 * fire duplicate reads through the useLiveFetch dedup layer.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
