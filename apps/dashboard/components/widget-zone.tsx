"use client";

import * as React from "react";
import {
  EMPTY_WIDGET_LIST,
  getWidgetsForZone,
  subscribeWidgets,
  type WidgetZone as WidgetZoneId,
} from "@/lib/widgets/registry";
import type { WidgetComponent } from "@/lib/widgets/types";

/**
 * Renders every widget registered for the given zone. Each widget is wrapped
 * in a local error boundary so a single faulty plugin can't take down the
 * host page.
 *
 * Hydration-safe: the SSR/initial-client snapshot always returns the same
 * frozen empty list, so the first client render matches server output.
 * Once plugins register (client-only, after mount), the subscription fires
 * and React re-renders with the actual widgets.
 *
 * @example
 *   <WidgetZone zone="dashboard.home.kpi-row.after" />
 *   <WidgetZone zone="invoice.details.sidebar" entity={invoice} />
 */
export function WidgetZone<T = Record<string, unknown>>({
  zone,
  entity,
}: {
  zone: WidgetZoneId;
  entity?: T;
}) {
  const getClientSnapshot = React.useCallback(
    () => getWidgetsForZone(zone),
    [zone],
  );
  const getServerSnapshot = React.useCallback(() => EMPTY_WIDGET_LIST, []);
  const widgets = React.useSyncExternalStore(
    subscribeWidgets,
    getClientSnapshot,
    getServerSnapshot,
  );
  if (widgets.length === 0) return null;
  return (
    <>
      {widgets.map((w) => {
        const Comp = w.component as WidgetComponent<T>;
        return (
          <PluginErrorBoundary key={w.id} fallback={null} widgetId={w.id}>
            <Comp zone={zone} entity={entity} />
          </PluginErrorBoundary>
        );
      })}
    </>
  );
}

/**
 * Minimal error boundary. React requires a class component for this — there
 * is no hook equivalent. Plugin widgets that throw during render are hidden;
 * the error is logged once per failure.
 */
class PluginErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    fallback: React.ReactNode;
    widgetId: string;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: true } {
    return { hasError: true };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(
      `[Plugin] widget "${this.props.widgetId}" threw during render:`,
      err,
      info.componentStack,
    );
  }

  render(): React.ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
