/**
 * Legacy StatCard — preserved as a thin wrapper around KpiTile so
 * existing callers continue to render while the dashboard transitions.
 */
import { KpiTile } from "./kpi-tile";
import { walkData } from "./sparkline";

type StatCardProps = {
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
};

export function StatCard({ label, value, subValue, color }: StatCardProps) {
  const tone =
    color === "var(--success)" || color === "var(--dero)"
      ? "positive"
      : color === "var(--warning)" || color === "var(--amber)"
      ? "warn"
      : color === "var(--danger)" || color === "var(--vermilion)"
      ? "info"
      : "neutral";

  return (
    <KpiTile
      index="·"
      label={label}
      value={value}
      suffix={subValue}
      tone={tone as "positive" | "warn" | "info" | "neutral"}
      spark={walkData(label.length * 17 + 3, 20, 0.03, 0.12)}
    />
  );
}
