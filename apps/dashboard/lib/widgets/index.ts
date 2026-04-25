/**
 * Plugin-facing API surface. Plugins should only import from
 * `@/lib/widgets` — internals (the raw registry maps, clear helpers) live in
 * the sibling modules and aren't re-exported.
 */
export { defineWidget, getWidgetsForZone } from "./registry";
export {
  registerNavItem,
  getPluginNavItems,
  subscribeNavItems,
} from "./nav";
export type {
  WidgetZone,
  WidgetProps,
  WidgetComponent,
  RegisteredWidget,
} from "./types";
export type { PluginNavItem } from "./nav";
