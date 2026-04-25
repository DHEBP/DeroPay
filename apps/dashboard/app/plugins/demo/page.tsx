import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Demo plugin — DeroPay",
};

/**
 * Demo plugin landing page. Exists primarily as proof-of-concept for the
 * `/plugins/<name>` routing convention: a plugin can own a real segment
 * under `app/plugins/` and the sidebar will link to it via the nav
 * registry.
 */
export default function DemoPluginPage() {
  return (
    <DashboardShell>
      <PageHeader
        title="Demo plugin"
        subtitle="Example page owned by a plugin — proves the /plugins/<name> routing convention."
      />

      <div
        className="surface"
        style={{
          padding: "18px 22px",
          marginBottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span className="eyebrow">What this is</span>
        <p
          style={{
            margin: 0,
            color: "var(--bone-dim)",
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          This page lives at{" "}
          <code className="mono" style={{ color: "var(--bone)" }}>
            app/plugins/demo/page.tsx
          </code>{" "}
          and is wired to the sidebar by the plugin's registration function
          (
          <code className="mono" style={{ color: "var(--bone)" }}>
            registerNavItem
          </code>
          ). The plugin also injects a small card into the dashboard via the{" "}
          <code className="mono" style={{ color: "var(--bone)" }}>
            dashboard.home.lanes.after
          </code>{" "}
          widget zone.
        </p>
      </div>

      <div
        className="surface"
        style={{
          padding: "18px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <span className="eyebrow">How to author your own</span>
        <ol
          style={{
            margin: 0,
            paddingLeft: 18,
            color: "var(--bone-dim)",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <li>
            Create <code className="mono">app/_plugins/&lt;my-plugin&gt;/index.tsx</code>{" "}
            exporting a <code className="mono">register...()</code> function.
          </li>
          <li>
            Inside it, call <code className="mono">defineWidget</code> for any
            UI injections and <code className="mono">registerNavItem</code> for
            sidebar entries.
          </li>
          <li>
            Add{" "}
            <code className="mono">app/plugins/&lt;my-plugin&gt;/page.tsx</code>{" "}
            if you need a dedicated page.
          </li>
          <li>
            Wire your <code className="mono">register...()</code> function into{" "}
            <code className="mono">app/_plugins/index.ts</code>.
          </li>
        </ol>
        <p
          style={{
            margin: 0,
            color: "var(--bone-quiet)",
            fontSize: 12,
          }}
        >
          Full reference:{" "}
          <code className="mono">apps/dashboard/app/_plugins/README.md</code>
          .
        </p>
      </div>
    </DashboardShell>
  );
}
