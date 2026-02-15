import type { ReactNode } from "react";

export const Section = ({
  children,
  className = "",
  id,
  style,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}) => (
  <section id={id} className={`relative ${className}`} style={{ padding: "96px 0", ...style }}>
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px" }}>{children}</div>
  </section>
);

export const SectionHeader = ({
  eyebrow,
  title,
  description,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}) => (
  <div className={className} style={{ maxWidth: "720px", margin: "0 auto 64px", textAlign: "center" }}>
    {eyebrow && (
      <p style={{ marginBottom: "16px", fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: "#10b981" }}>
        {eyebrow}
      </p>
    )}
    <h2 style={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.08, color: "#f0fdf4" }}>
      {title}
    </h2>
    {description && (
      <p style={{ marginTop: "20px", fontSize: "18px", fontWeight: 500, lineHeight: 1.6, color: "#6b7f75", maxWidth: "560px", marginLeft: "auto", marginRight: "auto" }}>
        {description}
      </p>
    )}
  </div>
);
