import type { ReactNode } from "react";

export const Section = ({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) => (
  <section
    id={id}
    className={`relative overflow-hidden py-20 md:py-28 ${className}`}
    style={{ scrollMarginTop: "5rem" }}
  >
    <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-8">{children}</div>
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
  <div className={`mx-auto mb-16 max-w-[760px] text-center ${className}`}>
    {eyebrow && <p className="section-kicker mb-5">{eyebrow}</p>}
    <h2 className="text-balance font-display text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-[var(--color-text-primary)]">
      {title}
    </h2>
    {description && (
      <p className="mx-auto mt-5 max-w-[580px] text-pretty text-base font-medium leading-7 text-[var(--color-text-secondary)] md:text-lg md:leading-8">
        {description}
      </p>
    )}
  </div>
);
