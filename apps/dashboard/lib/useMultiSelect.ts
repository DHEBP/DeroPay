"use client";

/**
 * `useMultiSelect` — generic row-selection primitive for list pages.
 *
 * Responsibilities:
 *   - Track a `Set<string>` of selected row ids.
 *   - Toggle a single id; Shift+Click extends from the last toggled id to
 *     the new one (contiguous range select across the current `items`
 *     ordering — so it follows whatever sort/filter the page has applied).
 *   - `selectAll` covers every currently-supplied item; `clear` empties.
 *   - Prune selected ids whenever the visible `items` list changes — if a
 *     row no longer exists (page change, filter flip, saved-view switch),
 *     drop it. Kept ids survive so a sort flip doesn't wipe selection.
 *   - Escape clears while any selection is live. This is a global keydown
 *     listener because the selection bar itself may not be focused when
 *     the user wants to bail out.
 *
 * The hook is intentionally UI-agnostic: callers plug the returned helpers
 * into their table's checkbox column and into `<BulkToolbar>`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

export type UseMultiSelectResult<T> = {
  /** Raw id set — exposed for callers that want O(1) `has()` checks. */
  selected: Set<string>;
  isSelected: (id: string) => boolean;
  /**
   * Toggle a row. Pass the originating event to enable Shift+Click range
   * behaviour; otherwise it falls back to a single toggle.
   */
  toggle: (id: string, event?: ReactMouseEvent | ReactKeyboardEvent) => void;
  selectAll: () => void;
  clear: () => void;
  /** Materialised subset of `items` whose ids are selected (preserves order). */
  selectedItems: T[];
  selectedCount: number;
};

export function useMultiSelect<T extends { id: string }>(
  items: T[],
): UseMultiSelectResult<T> {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastToggledRef = useRef<string | null>(null);

  const toggle = useCallback(
    (id: string, event?: ReactMouseEvent | ReactKeyboardEvent) => {
      const shift = !!event && "shiftKey" in event && event.shiftKey === true;
      // Range-select only makes sense when we have an anchor id. If the
      // previous anchor is no longer in the list (e.g. filter changed),
      // silently fall through to a regular toggle.
      if (shift && lastToggledRef.current) {
        const all = items.map((i) => i.id);
        const fromIdx = all.indexOf(lastToggledRef.current);
        const toIdx = all.indexOf(id);
        if (fromIdx >= 0 && toIdx >= 0) {
          const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
          const range = all.slice(lo, hi + 1);
          setSelected((prev) => {
            const next = new Set(prev);
            for (const rid of range) next.add(rid);
            return next;
          });
          lastToggledRef.current = id;
          return;
        }
      }
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastToggledRef.current = id;
    },
    [items],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((i) => i.id)));
  }, [items]);

  const clear = useCallback(() => {
    setSelected(new Set());
    lastToggledRef.current = null;
  }, []);

  // Reconcile the live set with the current items list. When the list
  // changes identity (refetch, filter, saved view), drop ids that are no
  // longer present. Ids that remain keep their selection.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const idset = new Set(items.map((i) => i.id));
      let changed = false;
      const filtered = new Set<string>();
      for (const id of prev) {
        if (idset.has(id)) filtered.add(id);
        else changed = true;
      }
      return changed ? filtered : prev;
    });
  }, [items]);

  // Escape bails out of any active selection. Attached to window so users
  // can hit it from anywhere on the page (e.g. while focus is in a cell).
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(new Set());
        lastToggledRef.current = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size]);

  const selectedItems = useMemo(
    () => items.filter((i) => selected.has(i.id)),
    [items, selected],
  );

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return {
    selected,
    isSelected,
    toggle,
    selectAll,
    clear,
    selectedItems,
    selectedCount: selected.size,
  };
}
