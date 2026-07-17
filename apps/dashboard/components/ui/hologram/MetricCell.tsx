import type { ReactNode } from "react";

type Align = "left" | "right";
type Divider = "left" | "right" | "none";

type Props = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  align?: Align;
  divider?: Divider;
  className?: string;
};

export function MetricCell({
  label,
  value,
  hint,
  align = "left",
  divider = "none",
  className,
}: Props) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-1)",
        padding: "var(--s-3) var(--s-4)",
        borderLeft:
          divider === "left" ? "1px solid var(--ink-hair-faint)" : undefined,
        borderRight:
          divider === "right" ? "1px solid var(--ink-hair-faint)" : undefined,
        textAlign: align,
        minWidth: 0,
      }}
    >
      <span className="eyebrow-mono" style={{ fontSize: 10 }}>
        {label}
      </span>
      <span
        className="num"
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: "var(--bone)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
      {hint ? (
        <span
          style={{
            fontSize: 11,
            color: "var(--bone-mute)",
            lineHeight: 1.3,
          }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}
