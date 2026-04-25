"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreHorizontal, User, Settings2, Keyboard, LogOut, FileText, Book } from "lucide-react";
import { useToast } from "./toast";
import { useShortcuts } from "./shortcuts-overlay";
import { useIsTestMode } from "@/lib/useIsTestMode";

type MenuItem = {
  id: string;
  label: string;
  Icon: typeof User;
  run: () => void;
  hint?: string;
  danger?: boolean;
};

export function ProfileMenu() {
  const isDemo = useIsTestMode();
  const { toast } = useToast();
  const shortcuts = useShortcuts();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (cmd: MenuItem) => {
    setOpen(false);
    setTimeout(() => cmd.run(), 40);
  };

  const items: MenuItem[] = [
    {
      id: "account",
      label: "Account & security",
      Icon: User,
      run: () => (window.location.href = "/settings#account"),
    },
    {
      id: "settings",
      label: "Merchant settings",
      Icon: Settings2,
      run: () => (window.location.href = "/settings"),
    },
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      hint: "?",
      Icon: Keyboard,
      run: () => shortcuts.open(),
    },
    {
      id: "changelog",
      label: "What's new",
      Icon: FileText,
      run: () => {
        toast({ title: "Changelog", description: "v0.1 — initial dashboard", tone: "info" });
      },
    },
    {
      id: "docs",
      label: "Documentation",
      Icon: Book,
      run: () => window.open("https://deropay.com/docs", "_blank", "noopener,noreferrer"),
    },
    {
      id: "signout",
      label: isDemo ? "Exit demo" : "Disconnect wallet",
      Icon: LogOut,
      danger: true,
      run: () => {
        toast({
          title: isDemo ? "Demo session" : "Wallet disconnect",
          description: isDemo
            ? "Demo mode has no session to end — reload to reset state."
            : "Run: stop the DeroPay daemon on your server to end this session.",
          tone: "warn",
          ttl: 5000,
        });
      },
    },
  ];

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Open merchant menu"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 26,
          height: 26,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: open ? "var(--ink-elev-2)" : "transparent",
          border: "none",
          borderRadius: "var(--radius-sm)",
          color: open ? "var(--bone)" : "var(--bone-mute)",
          cursor: "pointer",
          transition: "background 0.15s, color 0.15s",
          padding: 0,
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = "var(--ink-elev-2)";
            e.currentTarget.style.color = "var(--bone)";
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--bone-mute)";
          }
        }}
      >
        <MoreHorizontal size={16} strokeWidth={1.8} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: 0,
              width: 250,
              background: "var(--ink-elev)",
              border: "1px solid var(--ink-hair-strong)",
              borderRadius: "var(--radius)",
              boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)",
              zIndex: 200,
              padding: 6,
            }}
          >
            <div
              style={{
                padding: "10px 10px 8px",
                borderBottom: "1px solid var(--ink-hair)",
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--bone)",
                  letterSpacing: "-0.005em",
                }}
              >
                {isDemo ? "Demo Merchant" : "Merchant"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--bone-mute)",
                  marginTop: 2,
                  letterSpacing: "0.005em",
                }}
              >
                {isDemo ? "@demo · simulated" : "Self-hosted · live"}
              </div>
            </div>

            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => run(item)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: "transparent",
                  border: "none",
                  color: item.danger ? "var(--vermilion)" : "var(--bone-dim)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 13,
                  fontFamily: "var(--font-sans)",
                  transition: "background 0.12s, color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--ink-elev-2)";
                  e.currentTarget.style.color = item.danger
                    ? "var(--vermilion)"
                    : "var(--bone)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = item.danger
                    ? "var(--vermilion)"
                    : "var(--bone-dim)";
                }}
              >
                <item.Icon size={14} strokeWidth={1.6} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.hint && (
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--bone-quiet)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {item.hint}
                  </span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
