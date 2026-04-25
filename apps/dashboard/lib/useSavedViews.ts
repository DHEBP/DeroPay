"use client";

/**
 * Saved Views hook — per-page.
 *
 * To adopt saved views on a new page (e.g. /escrow):
 * 1. Call useSavedViews("escrow") with the filter keys that belong in the
 *    facet bag (e.g. ["status", "q"]).
 * 2. Seed built-in views via the `SEED_VIEWS["escrow"]` map in
 *    ./saved-views.ts.
 * 3. Render <SavedViewBar pageKey="escrow" filterKeys={...} /> above your
 *    filter chips. The bar re-uses the same hook so you don't thread state.
 * 4. If the page has non-facet URL params (drawer, scrollTo, etc.) make
 *    sure they're NOT in `filterKeys` — applyView() preserves unknown
 *    params verbatim.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SEED_VIEWS,
  facetsEqual,
  facetsToParams,
  loadStore,
  newViewId,
  paramsToFacets,
  saveStore,
  type SavedView,
  type SavedViewFacets,
} from "./saved-views";

type Hook = {
  views: SavedView[];
  activeView: SavedView | null;
  createView: (name: string, facets: SavedViewFacets) => SavedView;
  deleteView: (id: string) => void;
  renameView: (id: string, name: string) => void;
  pinToggle: (id: string) => void;
  /** Apply view facets to the URL, preserving unknown params. */
  applyView: (v: SavedView) => void;
  currentFacets: SavedViewFacets;
};

export function useSavedViews(
  pageKey: string,
  filterKeys: ReadonlyArray<string>,
): Hook {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Hydrate from localStorage. We intentionally keep this in React state so
  // concurrent-mounted components (the bar + a future menu) see consistent
  // data — we broadcast via `storage` events below.
  const [userViews, setUserViews] = useState<SavedView[]>([]);

  useEffect(() => {
    const store = loadStore();
    setUserViews(store[pageKey] ?? []);
    // Listen for cross-tab edits so a rename in another tab updates here.
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== "deropay.savedviews.v1") return;
      const next = loadStore();
      setUserViews(next[pageKey] ?? []);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [pageKey]);

  const persist = useCallback(
    (next: SavedView[]) => {
      setUserViews(next);
      const store = loadStore();
      store[pageKey] = next;
      saveStore(store);
    },
    [pageKey],
  );

  const builtins = useMemo(() => SEED_VIEWS[pageKey] ?? [], [pageKey]);
  const views = useMemo(() => [...builtins, ...userViews], [builtins, userViews]);

  // Stable-ish key for searchParams — URLSearchParams instance identity
  // changes on every render in Next.js App Router, so memoise by string.
  const paramsString = searchParams.toString();
  const currentFacets = useMemo(
    () => paramsToFacets(new URLSearchParams(paramsString), filterKeys),
    // filterKeys is a prop from caller — don't recompute on every reference
    // change, only on value change. eslint will nag unless we spread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paramsString, filterKeys.join("|")],
  );

  const activeView = useMemo(
    () => views.find((v) => facetsEqual(v.facets, currentFacets)) ?? null,
    [views, currentFacets],
  );

  const applyView = useCallback(
    (v: SavedView) => {
      // Preserve non-facet params (drawer, scrollTo, feature flags). We
      // strip all keys this hook "owns" — filterKeys + reserved — then
      // overlay the view's facets.
      const current = new URLSearchParams(paramsString);
      for (const k of filterKeys) current.delete(k);
      current.delete("sort");
      current.delete("dir");
      current.delete("groupBy");
      current.delete("columns");
      const facetsP = facetsToParams(v.facets);
      for (const [k, val] of facetsP.entries()) current.set(k, val);
      const qs = current.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, pathname, paramsString, filterKeys.join("|")],
  );

  const createView = useCallback(
    (name: string, facets: SavedViewFacets): SavedView => {
      const v: SavedView = {
        id: newViewId(),
        pageKey,
        name: name.trim() || "Untitled view",
        facets,
        pinned: true,
        createdAt: Date.now(),
      };
      persist([...userViews, v]);
      return v;
    },
    [persist, userViews, pageKey],
  );

  const deleteView = useCallback(
    (id: string) => {
      if (id.startsWith("sv_builtin_")) return;
      persist(userViews.filter((v) => v.id !== id));
    },
    [persist, userViews],
  );

  const renameView = useCallback(
    (id: string, name: string) => {
      if (id.startsWith("sv_builtin_")) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      persist(
        userViews.map((v) => (v.id === id ? { ...v, name: trimmed } : v)),
      );
    },
    [persist, userViews],
  );

  const pinToggle = useCallback(
    (id: string) => {
      if (id.startsWith("sv_builtin_")) return; // built-ins are always pinned
      persist(
        userViews.map((v) => (v.id === id ? { ...v, pinned: !v.pinned } : v)),
      );
    },
    [persist, userViews],
  );

  return {
    views,
    activeView,
    createView,
    deleteView,
    renameView,
    pinToggle,
    applyView,
    currentFacets,
  };
}
