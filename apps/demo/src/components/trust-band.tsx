import { trustPillars } from "@/lib/store-catalog";

export function TrustBand() {
  return (
    <section className="px-6 pb-8 md:px-10 md:pb-12">
      <div className="mx-auto grid w-full max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-4">
        {trustPillars.map((pillar) => (
          <div
            key={pillar.title}
            className="glass-panel rounded-[1.6rem] px-5 py-6"
          >
            <h3 className="mb-2 font-display text-base font-semibold text-white">
              {pillar.title}
            </h3>
            <p className="text-sm leading-6 text-[var(--text-secondary)] text-pretty">
              {pillar.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
