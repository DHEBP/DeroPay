import type { RegisteredWidget, WidgetZone } from "./types";

/**
 * In-memory widget registry. Module-scoped so all `defineWidget` calls from
 * any client-side plugin module accumulate into the same map. Reads from
 * `<WidgetZone />` are synchronous after registration.
 */
const registry = new Map<WidgetZone, RegisteredWidget[]>();

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
}

export function getWidgetsForZone(zone: WidgetZone): RegisteredWidget[] {
  return registry.get(zone) ?? [];
}

/** Escape hatch for tests. Not exported from the public index. */
export function __clearWidgetRegistry(): void {
  registry.clear();
}

export type { WidgetZone, RegisteredWidget } from "./types";
