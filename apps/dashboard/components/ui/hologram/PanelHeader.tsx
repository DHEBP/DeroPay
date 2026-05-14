import type { ReactNode } from "react";
import { FilledGlyph, type GlyphName } from "./FilledGlyph";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  glyph?: GlyphName;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PanelHeader({
  title,
  description,
  glyph,
  meta,
  actions,
  className,
}: Props) {
  const cls = ["commerce-panel-header", className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <div className="commerce-panel-heading">
        {glyph ? (
          <span className="commerce-panel-icon" aria-hidden>
            <FilledGlyph name={glyph} size={14} />
          </span>
        ) : null}
        <div className="commerce-panel-copy">
          <div className="commerce-panel-title">{title}</div>
          {description ? (
            <div className="commerce-panel-description">{description}</div>
          ) : null}
        </div>
        {meta ? (
          <div
            style={{
              marginLeft: "var(--s-3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--s-2)",
            }}
          >
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? <div className="commerce-panel-actions">{actions}</div> : null}
    </div>
  );
}
