# Plugin authoring guide

DeroPay's dashboard supports first-party extensions via the **widget zone**
registry. A "plugin" here is any module that registers UI against a
well-known extension point without modifying the host page's source.

This directory (`app/_plugins/`) holds each plugin's registration code.
The leading underscore keeps Next.js from auto-routing anything under it —
the files here are pure logic, not pages. Plugin *pages* (if any) live
under `app/plugins/<name>/` where Next.js will route them.

## Create a plugin

```
apps/dashboard/app/_plugins/
  my-plugin/
    index.tsx        <- exports register...() function
```

`index.tsx`:

```tsx
"use client";
import { Sparkles } from "lucide-react";
import { defineWidget, registerNavItem } from "@/lib/widgets";

function MyWidget() {
  return <div className="surface">Hello from my-plugin.</div>;
}

export function registerMyPlugin() {
  defineWidget({
    id: "my-plugin.hero",
    zone: "dashboard.home.kpi-row.after",
    component: MyWidget,
  });

  registerNavItem({
    id: "plugin.my-plugin",
    label: "My Plugin",
    href: "/plugins/my-plugin",
    icon: <Sparkles size={18} strokeWidth={1.6} />,
  });
}
```

Then wire it into `app/_plugins/index.ts`:

```ts
import { registerMyPlugin } from "./my-plugin";

export function registerAllPlugins(): void {
  registerDemoPlugin();
  registerMyPlugin();  // <- add this
}
```

`registerAllPlugins()` runs once on the client via `<PluginsBootstrap />`
in `app/layout.tsx`. Registrations are idempotent by `id`, so StrictMode /
HMR double-invocations are safe.

## Register a widget (`defineWidget`)

```ts
defineWidget({
  id: "unique-widget-id",      // idempotent key within a zone
  zone: "dashboard.home.kpi-row.after",
  component: MyWidget,         // React component; receives { zone, entity? }
  priority: 0,                 // optional; lower renders first
});
```

Your component receives `{ zone, entity }`. Drawer zones pass the detail
record as `entity` — type it on your own component if you need more than
`Record<string, unknown>`:

```tsx
import type { WidgetProps } from "@/lib/widgets";

type Invoice = { id: string; status: string };

function InvoiceBadge({ entity }: WidgetProps<Invoice>) {
  if (!entity) return null;
  return <span>{entity.status}</span>;
}
```

## Register a sidebar nav item (`registerNavItem`)

```ts
registerNavItem({
  id: "plugin.my-plugin",      // idempotent key
  label: "My Plugin",
  href: "/plugins/my-plugin",
  icon: <Sparkles size={18} />, // optional
  priority: 0,                  // optional; lower sorts first
});
```

Entries appear under a **"Plugins"** section at the bottom of the sidebar
nav. The sidebar subscribes to the nav registry via `useSyncExternalStore`,
so registrations that happen after initial mount still show up.

## Register a plugin page

Plugin pages are regular Next.js app-router pages living under
`app/plugins/<name>/page.tsx`. No special registration needed — the page
is owned by file-based routing. Link to it via `registerNavItem({ href:
"/plugins/<name>" })`.

## Available widget zones

| Zone id                             | Where it renders                                           |
| ----------------------------------- | ---------------------------------------------------------- |
| `dashboard.home.kpi-row.after`      | Dashboard home, below the KPI tile row                     |
| `dashboard.home.lanes.after`        | Dashboard home, below the chart/combo lanes                |
| `invoice.details.sidebar`           | Invoice detail drawer → Details tab, after default content |
| `escrow.details.timeline.after`     | Escrow detail drawer → Timeline tab, after the timeline    |
| `customer.details.after`            | *(reserved — not yet mounted)*                             |
| `settings.developer.after`          | *(reserved — not yet mounted)*                             |

New zones are added to `lib/widgets/types.ts` as the host code grows.

## Error isolation

Each widget renders inside a small error boundary (see
`components/widget-zone.tsx`). A widget that throws during render is hidden
and the error is logged with its widget id — the host page keeps working.
Prefer graceful fallbacks (`return null`) over letting exceptions escape.

## What plugins **cannot** do (by design)

- No runtime loading from arbitrary URLs or npm packages — all plugin code
  is compiled into the dashboard bundle.
- No sandboxed iframes or worker-based isolation.
- No event-bus emit privileges beyond what any host module has. If you need
  to publish events, import the same `publish()` the host uses.
