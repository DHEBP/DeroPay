import type { RegisteredWidget, WidgetZone } from "./types";

/**
 * In-memory widget registry. Module-scoped so all `defineWidget` calls from
 * any client-side plugin module accumulate into the same map. Reads from
 * `<WidgetZone />` are synchronous after registration.
 */
const registry = new Map<WidgetZone, RegisteredWidget[]>();
const listeners = new Set<() => void>();

/**
 * Stable empty-array reference for zones with no registered widgets.
 * `useSyncExternalStore` consumers compare the snapshot by reference; a
 * fresh `[]` on every read would cause an infinite render loop.
 *
 * Exported so SSR/hydration consumers can use the SAME reference for the
 * server snapshot — guarantees that the initial client render matches the
 * server render before plugins register.
 */
export const EMPTY_WIDGET_LIST: RegisteredWidget[] = Object.freeze(
  [] as RegisteredWidget[],
) as RegisteredWidget[];

/**
 * Register a widget. Idempotent by `id` within a zone — repeated calls with
 * the same id are no-ops so React StrictMode / HMR double-invocations don't
 * duplicate widgets.
 */
export function defineWidget<T = Record<string, unknown>>(
  widget: RegisteredWidget<T>,
): void {
  const existing = registry.get(widget.zone) ?? [];
  if (existing.some((w) => w.id === widget.id)) return;
  // Cast is safe: the registry stores widgets as the generic default; the
  // reader re-casts on read using its own T.
  const list = [...existing, widget as unknown as RegisteredWidget];
  list.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  registry.set(widget.zone, list);
  for (const l of listeners) l();
}

export function getWidgetsForZone(zone: WidgetZone): RegisteredWidget[] {
  return registry.get(zone) ?? EMPTY_WIDGET_LIST;
}

/**
 * Subscribe to widget-registry changes. Designed for `useSyncExternalStore`
 * consumers (e.g. `<WidgetZone />`) so SSR hydration can use a stable
 * server snapshot and avoid client/server drift.
 */
export function subscribeWidgets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Escape hatch for tests. Not exported from the public index. */
export function __clearWidgetRegistry(): void {
  registry.clear();
  for (const l of listeners) l();
}

export type { WidgetZone, RegisteredWidget } from "./types";
