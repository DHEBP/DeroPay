"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Wire the chord and single-key shortcuts advertised in
 * `components/shortcuts-overlay.tsx`. The spec surface lives there;
 * this hook is the implementation.
 *
 * - `G` followed by a second key within ~1.5s navigates:
 *     G D → /              G I → /invoices       G E → /escrow
 *     G C → /customers     G P → /products       G G → /gift-cards
 *     G T → /partners      G R → /reports        G S → /settings
 *     G O → /payouts       G V → /developers     G N → /notifications
 *     G U → /credits
 * - `N` followed by a second key within ~1.5s creates:
 *     N I → /invoices?new=1
 *     N E → /escrow?new=1
 * - Single keys (when not in a field / not during an active chord):
 *     / → focus the first visible <input type="search">
 *
 * Copy-address (`C`) and command palette (⌘K) are owned by other components.
 */
export function useKeyboardNav() {
  const router = useRouter();

  useEffect(() => {
    // Only one chord can be pending at a time. `prefix` identifies which
    // leader key (if any) is awaiting its second keystroke.
    let chordTimer: ReturnType<typeof setTimeout> | null = null;
    let prefix: "g" | "n" | null = null;

    const clear = () => {
      if (chordTimer) {
        clearTimeout(chordTimer);
        chordTimer = null;
      }
      prefix = null;
    };

    const navMap: Record<string, string> = {
      d: "/",
      i: "/invoices",
      e: "/escrow",
      c: "/customers",
      p: "/products",
      g: "/gift-cards",
      t: "/partners",
      r: "/reports",
      s: "/settings",
      o: "/payouts",
      v: "/developers",
      n: "/notifications",
      u: "/credits",
    };

    const newMap: Record<string, string> = {
      i: "/invoices?new=1",
      e: "/escrow?new=1",
    };

    const inField = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (inField(e.target)) return;
      const key = e.key.toLowerCase();

      if (prefix) {
        // Second key of a chord
        const target =
          prefix === "g" ? navMap[key] : prefix === "n" ? newMap[key] : null;
        clear();
        if (target) {
          e.preventDefault();
          router.push(target);
        }
        return;
      }

      if (key === "g") {
        e.preventDefault();
        prefix = "g";
        chordTimer = setTimeout(clear, 1500);
        return;
      }

      if (key === "n") {
        e.preventDefault();
        prefix = "n";
        chordTimer = setTimeout(clear, 1500);
        return;
      }

      if (key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"]',
        );
        if (search) {
          e.preventDefault();
          search.focus();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clear();
    };
  }, [router]);
}
