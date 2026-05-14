import type { ReactNode } from "react";
import { FilledGlyph, type GlyphName } from "./FilledGlyph";

type Props = {
  children: ReactNode;
  glyph?: GlyphName;
  className?: string;
};

export function SectionTitle({ children, glyph, className }: Props) {
  const cls = ["commerce-section-title", className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {glyph ? <FilledGlyph name={glyph} size={12} /> : null}
      <h3>{children}</h3>
    </div>
  );
}
