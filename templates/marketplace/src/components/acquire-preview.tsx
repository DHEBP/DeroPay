import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Landmark,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

const routes = [
  {
    title: "Already have DERO",
    detail: "Send DERO from your wallet to the invoice integrated address shown at checkout.",
    badge: "cleanest",
    Icon: WalletCards,
  },
  {
    title: "Exchange route",
    detail: "Acquire DERO on a venue that actually lists it, then withdraw to your wallet before checkout.",
    badge: "external",
    Icon: Building2,
  },
  {
    title: "Bridge asset route",
    detail: "Use a licensed card or bank provider for a supported asset, then swap separately where available.",
    badge: "indirect",
    Icon: RefreshCw,
  },
];

export function AcquirePreview() {
  return (
    <div className="grid gap-5 pt-5">
      <section className="panel grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-lg bg-[var(--dero)] text-white">
              <Landmark size={24} />
            </span>
            <div>
              <h1 className="text-3xl font-black">DERO Acquire</h1>
              <p className="text-sm text-[var(--muted)]">Funding guide outside checkout</p>
            </div>
          </div>
          <p className="mt-4 max-w-3xl leading-7 text-[var(--muted)]">
            Checkout is DeroPay-native now. This page stays separate because PayPal, Stripe,
            card onramps, and most hosted crypto providers do not deliver DERO directly.
          </p>
        </div>
        <aside className="rounded-lg border border-[rgba(161,98,7,0.28)] bg-[#fff7ed] p-4 text-sm text-[var(--amber)]">
          <strong className="flex items-center gap-2">
            <AlertTriangle size={17} />
            Not a live onramp
          </strong>
          <p className="mt-2">
            This prototype does not move fiat, custody coins, quote liquidity, or claim direct
            PayPal-to-DERO support.
          </p>
        </aside>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">Practical funding paths</h2>
            <p className="text-sm text-[var(--muted)]">Keep fiat acquisition out of settlement until a real partner exists.</p>
          </div>
          <Link href="/checkout" className="btn-primary">
            Checkout flow
            <ArrowRight size={17} />
          </Link>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {routes.map(({ title, detail, badge, Icon }) => (
            <article key={title} className="panel-flat grid content-between gap-4 p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--dero-soft)] text-[var(--dero-strong)]">
                    <Icon size={19} />
                  </span>
                  <span className="badge badge-dero">{badge}</span>
                </div>
                <h3 className="mt-3 text-xl font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</p>
              </div>

              <p className="flex items-center gap-2 text-sm text-[var(--dero-strong)]">
                <ShieldCheck size={16} />
                Marketplace settlement still uses the DeroPay invoice.
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
