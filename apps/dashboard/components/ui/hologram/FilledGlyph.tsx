import type { CSSProperties } from "react";

export type GlyphName = "ring" | "bolt" | "hex" | "diamond" | "grid" | "rhombus";

type Props = {
  name: GlyphName;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
};

const paths: Record<GlyphName, string> = {
  ring:
    "M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zm0 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  bolt: "M9.5 1L2 9h4.2L5 15l7.5-8H8.3l1.2-6z",
  hex: "M8 1.5l5.629 3.25v6.5L8 14.5 2.371 11.25v-6.5L8 1.5z",
  diamond: "M8 1.5L14.5 8 8 14.5 1.5 8 8 1.5z",
  grid: "M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z",
  rhombus: "M8 1.5l5 6.5-5 6.5-5-6.5 5-6.5z",
};

export function FilledGlyph({
  name,
  size = 12,
  color = "var(--glyph-fill)",
  className,
  style,
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      className={className}
      style={{ flexShrink: 0, display: "inline-block", ...style }}
    >
      <path d={paths[name]} fill={color} />
    </svg>
  );
}
