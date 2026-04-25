"use client";

/**
 * Sidebar preferences — pinned pages + recently-visited pages.
 *
 * Persisted to `localStorage` under `deropay.sidebar.prefs.v1`. Hook is
 * SSR-safe (returns the default shape on the server; hydrates on mount)
 * and keeps multiple tabs in sync via the `storage` event.
 *
 * IDs use the same `nav.<slug>` scheme the command palette already uses
 * so future integrations can share one namespace. See `NAV_ITEMS` in
 * `components/sidebar.tsx` for the canonical mapping.
 */

import { useCallback, useEffect, useState } from "react";

export type SidebarPrefs = {
  pinned: string[]; // nav-item IDs, user-specified order
  recents: string[]; // nav-item IDs, most-recent first
};

export const SIDEBAR_PREFS_STORAGE_KEY = "deropay.sidebar.prefs.v1";
export const SIDEBAR_MAX_PINS = 8;
export const SIDEBAR_MAX_RECENTS = 5;

const DEFAULT_PREFS: SidebarPrefs = { pinned: [], recents: [] };

function readFromStorage(): SidebarPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFS;
    const maybe = parsed as Partial<SidebarPrefs>;
    return {
      pinned: Array.isArray(maybe.pinned)
        ? maybe.pinned.filter((x): x is string => typeof x === "string").slice(0, SIDEBAR_MAX_PINS)
        : [],
      recents: Array.isArray(maybe.recents)
        ? maybe.recents
            .filter((x): x is string => typeof x === "string")
            .slice(0, SIDEBAR_MAX_RECENTS)
        : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writeToStorage(prefs: SidebarPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private-mode / quota — silently ignore; the in-memory state still works.
  }
}

export function useSidebarPrefs(): {
  prefs: SidebarPrefs;
  pin: (id: string) => void;
  unpin: (id: string) => void;
  isPinned: (id: string) => boolean;
  trackVisit: (id: string) => void;
  clearRecents: () => void;
} {
  // SSR-safe: start from defaults, hydrate in the mount effect. Avoids
  // hydration mismatches because the first client render matches the
  // server render.
  const [prefs, setPrefs] = useState<SidebarPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(readFromStorage());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SIDEBAR_PREFS_STORAGE_KEY) return;
      setPrefs(readFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((next: SidebarPrefs) => {
    setPrefs(next);
    writeToStorage(next);
  }, []);

  const pin = useCallback(
    (id: string) => {
      setPrefs((cur) => {
        if (cur.pinned.includes(id)) return cur;
        const nextPinned = [...cur.pinned, id].slice(0, SIDEBAR_MAX_PINS);
        const next: SidebarPrefs = { ...cur, pinned: nextPinned };
        writeToStorage(next);
        return next;
      });
    },
    [],
  );

  const unpin = useCallback(
    (id: string) => {
      setPrefs((cur) => {
        if (!cur.pinned.includes(id)) return cur;
        const next: SidebarPrefs = {
          ...cur,
          pinned: cur.pinned.filter((x) => x !== id),
        };
        writeToStorage(next);
        return next;
      });
    },
    [],
  );

  const isPinned = useCallback((id: string) => prefs.pinned.includes(id), [prefs.pinned]);

  const trackVisit = useCallback((id: string) => {
    setPrefs((cur) => {
      // Move-to-front dedupe — no-op only if `id` is already first.
      if (cur.recents[0] === id) return cur;
      const filtered = cur.recents.filter((x) => x !== id);
      const nextRecents = [id, ...filtered].slice(0, SIDEBAR_MAX_RECENTS);
      const next: SidebarPrefs = { ...cur, recents: nextRecents };
      writeToStorage(next);
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    update({ ...prefs, recents: [] });
  }, [prefs, update]);

  return { prefs, pin, unpin, isPinned, trackVisit, clearRecents };
}
