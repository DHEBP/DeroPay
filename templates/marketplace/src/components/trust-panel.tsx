import type { LucideIcon } from "lucide-react";

export type TrustPanelItem = {
  title: string;
  detail: string;
  badge?: string;
  Icon: LucideIcon;
};

export function TrustPanel({
  title,
  items,
}: {
  title: string;
  items: TrustPanelItem[];
}) {
  return (
    <section className="panel-flat grid gap-3 p-4">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="grid gap-2">
        {items.map(({ title: itemTitle, detail, badge, Icon }) => (
          <div
            key={itemTitle}
            className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3 sm:grid-cols-[32px_1fr_auto]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--dero-soft)] text-[var(--dero-strong)]">
              <Icon size={17} />
            </span>
            <span>
              <strong className="block leading-snug">{itemTitle}</strong>
              <span className="text-sm text-[var(--muted)]">{detail}</span>
            </span>
            {badge ? <span className="badge badge-dero self-start">{badge}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
