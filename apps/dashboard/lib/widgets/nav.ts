import type { ReactNode } from "react";

/**
 * Plugin-contributed sidebar entry. Shown under a "Plugins" section header
 * at the bottom of the main sidebar nav.
 */
export type PluginNavItem = {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  /**
   * Section label for grouping; currently only "Plugins" is rendered, but
   * future host code can split into multiple groups.
   */
  group?: string;
  /** Lower = rendered first; default 0. */
  priority?: number;
};

const navRegistry = new Map<string, PluginNavItem>();
const listeners = new Set<() => void>();

/** Cache the sorted snapshot so `useSyncExternalStore` sees a stable reference
 *  until the registry actually changes. */
let cachedSnapshot: PluginNavItem[] = [];
let snapshotDirty = true;

function rebuildSnapshot(): void {
  cachedSnapshot = [...navRegistry.values()].sort((a, b) => {
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pa - pb;
    return a.label.localeCompare(b.label);
  });
  snapshotDirty = false;
}

/**
 * Register a plugin sidebar entry. Idempotent by `id`.
 */
export function registerNavItem(item: PluginNavItem): void {
  if (navRegistry.has(item.id)) return;
  navRegistry.set(item.id, item);
  snapshotDirty = true;
  for (const l of listeners) l();
}

/**
 * Read-only snapshot sorted by (priority, label). Stable reference —
 * callers can safely feed this into `useSyncExternalStore` without triggering
 * infinite render loops.
 */
export function getPluginNavItems(): PluginNavItem[] {
  if (snapshotDirty) rebuildSnapshot();
  return cachedSnapshot;
}

/**
 * Subscribe to registry changes. Returns an unsubscribe function. Designed
 * for `useSyncExternalStore` — the sidebar uses this to re-render when a
 * plugin registers a nav item after initial mount.
 */
export function subscribeNavItems(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Escape hatch for tests. */
export function __clearNavRegistry(): void {
  navRegistry.clear();
  snapshotDirty = true;
  for (const l of listeners) l();
}
