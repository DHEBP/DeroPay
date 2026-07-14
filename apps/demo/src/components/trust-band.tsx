import { trustPillars } from "@/lib/store-catalog";

export function TrustBand() {
  return (
    <section className="px-6 pb-12 md:px-10 md:pb-16">
      <div className="mx-auto grid w-full max-w-7xl auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
        {trustPillars.map((pillar) => (
          <div
            key={pillar.title}
            className="glass-panel flex flex-col rounded-[1.6rem] p-6 transition-transform duration-200 hover:-translate-y-0.5"
          >
            <h3 className="mb-3 font-display text-lg font-semibold text-white">
              {pillar.title}
            </h3>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              {pillar.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
