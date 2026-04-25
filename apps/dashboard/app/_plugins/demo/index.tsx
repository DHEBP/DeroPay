"use client";

import { Puzzle } from "lucide-react";
import { defineWidget, registerNavItem } from "@/lib/widgets";

/**
 * Tiny demo widget — proof that a plugin can inject UI into the host
 * without modifying the host's source. Rendered in the
 * `dashboard.home.lanes.after` zone, so it appears on the dashboard just
 * above the recent-invoices row.
 */
function DemoWidget() {
  return (
    <div
      className="surface"
      style={{ padding: "14px 18px", marginTop: 12, marginBottom: 16 }}
    >
      <span className="eyebrow">Plugin</span>
      <p
        style={{
          margin: "8px 0 0",
          color: "var(--bone-dim)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Hello from the demo plugin — rendered via widget zone{" "}
        <code className="mono" style={{ color: "var(--bone)" }}>
          dashboard.home.lanes.after
        </code>
        . See <code className="mono">app/_plugins/README.md</code> for how to
        author your own.
      </p>
    </div>
  );
}

/**
 * Registration entry point. Called once at app startup by
 * `app/_plugins/index.ts` via the `PluginsBootstrap` client component.
 */
export function registerDemoPlugin(): void {
  defineWidget({
    id: "demo.hello",
    zone: "dashboard.home.lanes.after",
    component: DemoWidget,
  });

  registerNavItem({
    id: "plugin.demo",
    label: "Demo plugin",
    href: "/plugins/demo",
    icon: <Puzzle size={18} strokeWidth={1.6} />,
    group: "Plugins",
  });
}
