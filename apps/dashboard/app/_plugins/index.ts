/**
 * Plugin master-list. Each plugin exposes a `register...()` function that
 * calls `defineWidget` / `registerNavItem` / etc. against
 * `@/lib/widgets`. Add new plugins by importing and invoking them here.
 *
 * Plugins are registered once per browser session on the client — the
 * registries are module-scoped in-memory maps, so a server re-render would
 * see empty registries anyway. See `PluginsBootstrap` in
 * `components/plugins-bootstrap.tsx` for the mount-time invocation.
 */
import { registerDemoPlugin } from "./demo";

export function registerAllPlugins(): void {
  registerDemoPlugin();
  // future: registerTelaPlugin();
  // future: registerHyperGnomonPlugin();
}
