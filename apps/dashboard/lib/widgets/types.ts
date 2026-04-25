/**
 * Widget injection zones. Plugins register `RegisteredWidget`s against these
 * zones; the host renders them via `<WidgetZone zone="..." />`.
 *
 * Naming follows Medusa's `page.location.<before|after>` convention so the
 * identifier tells you exactly where the widget will appear.
 */
export type WidgetZone =
  | "dashboard.home.kpi-row.after"
  | "dashboard.home.lanes.after"
  | "invoice.details.sidebar"
  | "escrow.details.timeline.after"
  | "customer.details.after"
  | "settings.developer.after";

export type WidgetProps<T = Record<string, unknown>> = {
  zone: WidgetZone;
  /** Drawer/detail widgets receive the entity as context. */
  entity?: T;
};

export type WidgetComponent<T = Record<string, unknown>> =
  React.ComponentType<WidgetProps<T>>;

export type RegisteredWidget<T = Record<string, unknown>> = {
  id: string;
  zone: WidgetZone;
  component: WidgetComponent<T>;
  /** Lower = rendered first; default 0. */
  priority?: number;
};
