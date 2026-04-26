"use client";

import type { ReactNode } from "react";

type MetricSurface = "elev" | "flat";

export function ActionCluster({
  children,
  align = "end",
}: {
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <div className={`commerce-actions commerce-actions-${align}`}>
      {children}
    </div>
  );
}

export function CommerceMetric({
  label,
  value,
  sublabel,
  icon,
  surface = "elev",
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: ReactNode;
  surface?: MetricSurface;
}) {
  return (
    <div
      className={`${surface === "flat" ? "surface-flat" : "surface"} commerce-metric`}
      style={{
        minHeight: 82,
        padding: "14px 16px",
        borderRight: "1px solid var(--ink-hair)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--bone-mute)" }}>
        {icon}
        <span className="eyebrow" style={{ fontSize: 10 }}>
          {label}
        </span>
      </div>
      <div className="display" style={{ fontSize: 18, color: "var(--bone)" }}>
        {value}
      </div>
      {sublabel && <div className="commerce-metric-subtitle">{sublabel}</div>}
    </div>
  );
}

export function CommercePanelHeader({
  icon,
  title,
  description,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="commerce-panel-header">
      <div className="commerce-panel-heading">
        {icon && <span className="commerce-panel-icon">{icon}</span>}
        <div className="commerce-panel-copy">
          <div className="commerce-panel-title">{title}</div>
          {description && <div className="commerce-panel-description">{description}</div>}
        </div>
      </div>
      {actions && <div className="commerce-panel-actions">{actions}</div>}
    </div>
  );
}

export function CommerceSectionTitle({
  icon,
  title,
}: {
  icon?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="commerce-section-title">
      {icon}
      <h3 className="display">{title}</h3>
    </div>
  );
}

export function CommerceChecklist({
  label,
  rows,
  selected,
  onChange,
}: {
  label: string;
  rows: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  return (
    <div>
      <div className="field-label" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div
        style={{
          display: "grid",
          gap: 7,
          maxHeight: 168,
          overflow: "auto",
          padding: 10,
          border: "1px solid var(--ink-hair)",
          borderRadius: "var(--radius)",
          background: "var(--ink-deep)",
        }}
      >
        {rows.map((row) => (
          <label
            key={row.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
              color: "var(--bone-dim)",
              fontSize: 12,
            }}
          >
            <input
              type="checkbox"
              checked={selectedSet.has(row.id)}
              onChange={(event) => {
                if (event.target.checked) {
                  onChange([...selected, row.id]);
                } else {
                  onChange(selected.filter((id) => id !== row.id));
                }
              }}
              style={{ accentColor: "var(--dero)", flexShrink: 0 }}
            />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
