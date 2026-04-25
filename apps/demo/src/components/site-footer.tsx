import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/[0.08] bg-black/25">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:flex-row md:items-end md:justify-between md:px-10">
        <div className="max-w-xl space-y-3">
          <p className="section-kicker">DeroPay Demo</p>
          <h2 className="font-display text-2xl font-semibold text-white md:text-3xl text-balance">
            A retail-grade storefront for private DERO payments.
          </h2>
          <p className="text-sm leading-6 text-[var(--text-secondary)] text-pretty">
            The full DeroPay flow — cart, invoice, wallet auth, and escrow — in a
            storefront you can actually show someone.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-sm text-[var(--text-secondary)]">
          <Link href="/" className="hover:text-white">
            Collection
          </Link>
          <Link href="/cart" className="hover:text-white">
            Cart
          </Link>
          <Link href="/checkout" className="hover:text-white">
            Checkout
          </Link>
          <a
            href="https://deropay.com/pay"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white"
          >
            DeroPay
          </a>
        </div>
      </div>
    </footer>
  );
}
