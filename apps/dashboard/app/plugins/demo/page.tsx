import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import {
  EyebrowLabel,
  FilledGlyph,
  LiveBadge,
  MetricCell,
  PanelHeader,
  SectionTitle,
  StatusDot,
  type GlyphName,
  type StatusTone,
} from "@/components/ui";

export const metadata = {
  title: "Demo plugin — DeroPay",
};

const GLYPHS: GlyphName[] = ["ring", "bolt", "hex", "diamond", "grid", "rhombus"];
const STATUS_TONES: StatusTone[] = ["live", "warn", "error", "idle", "info"];

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

      <div style={{ marginTop: 32 }}>
        <SectionTitle glyph="ring">Hologram primitives</SectionTitle>
        <p
          style={{
            margin: "0 0 18px",
            color: "var(--bone-mute)",
            fontSize: 12.5,
            lineHeight: 1.55,
          }}
        >
          Reusable primitives that lift HOLOGRAM&apos;s structural moves into
          the dashboard. Toggle the theme to see each primitive in dark +
          light. The dot-grid backdrop is mounted on the shell, so it&apos;s
          visible behind every page automatically.
        </p>

        <div className="surface" style={{ marginBottom: 16 }}>
          <PanelHeader
            glyph="grid"
            title="FilledGlyph"
            description="Six geometric sigils — used in panel-header icon slots only."
          />
          <div
            style={{
              padding: "16px 22px",
              display: "flex",
              gap: 22,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {GLYPHS.map((g) => (
              <div
                key={g}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <FilledGlyph name={g} size={20} />
                <EyebrowLabel tone="dim">{g}</EyebrowLabel>
              </div>
            ))}
          </div>
        </div>

        <div className="surface" style={{ marginBottom: 16 }}>
          <PanelHeader
            glyph="diamond"
            title="StatusDot & LiveBadge"
            description="Compact status indicators. live tone pulses with prefers-reduced-motion respected."
          />
          <div
            style={{
              padding: "16px 22px",
              display: "flex",
              gap: 28,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {STATUS_TONES.map((tone) => (
              <div
                key={tone}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <StatusDot tone={tone} pulse={tone === "live"} />
                <EyebrowLabel tone="dim">{tone}</EyebrowLabel>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                gap: 16,
                paddingLeft: 22,
                borderLeft: "1px solid var(--ink-hair-faint)",
              }}
            >
              <LiveBadge live />
              <LiveBadge live={false} />
            </div>
          </div>
        </div>

        <div className="surface" style={{ marginBottom: 16 }}>
          <PanelHeader
            glyph="hex"
            title="EyebrowLabel"
            description="Uppercase mono labels for section headers and metric captions."
            meta={<LiveBadge live />}
            actions={<EyebrowLabel tone="dim">demo · widget zone</EyebrowLabel>}
          />
          <div
            style={{
              padding: "16px 22px",
              display: "flex",
              gap: 24,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <EyebrowLabel>default</EyebrowLabel>
            <EyebrowLabel tone="dim">dim</EyebrowLabel>
            <EyebrowLabel tone="accent">accent</EyebrowLabel>
            <EyebrowLabel tone="warn">warn</EyebrowLabel>
            <EyebrowLabel tone="error">error</EyebrowLabel>
          </div>
        </div>

        <div className="surface" style={{ marginBottom: 16 }}>
          <PanelHeader
            glyph="bolt"
            title="MetricCell"
            description="Dense horizontal stat row for reports and high-density data views."
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              alignItems: "stretch",
            }}
          >
            <MetricCell label="settlements (24h)" value="1,284" hint="+12% vs prior" />
            <MetricCell
              label="avg amount"
              value="0.42 DERO"
              hint="median 0.18"
              divider="left"
            />
            <MetricCell
              label="active merchants"
              value="58"
              hint="3 new this week"
              divider="left"
            />
            <MetricCell
              label="facilitator uptime"
              value="99.97%"
              hint="last 30 days"
              divider="left"
            />
          </div>
        </div>

        <div className="surface">
          <PanelHeader
            glyph="rhombus"
            title="PanelHeader"
            description="This very card — uses sigil + title + description + meta + actions."
            meta={<StatusDot tone="live" pulse ariaLabel="Live data" />}
            actions={
              <button className="btn btn-ghost btn-mini" type="button">
                action
              </button>
            }
          />
          <div style={{ padding: "16px 22px", color: "var(--bone-mute)", fontSize: 13 }}>
            All retrofitted pages will use this header convention instead of
            inline title blocks. Replaces ad-hoc{" "}
            <code className="mono" style={{ color: "var(--bone-dim)" }}>
              .commerce-panel-header
            </code>{" "}
            usage scattered across the codebase with a typed React surface.
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
