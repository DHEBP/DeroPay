"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  Minus,
  Plus,
  ReceiptText,
  Route,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useMarketplace } from "@/context/marketplace-context";
import { formatDero, formatUsd } from "@/lib/format";
import type { CheckoutDetails, PaymentRail } from "@/lib/types";

const rails: Array<{
  id: PaymentRail;
  title: string;
  detail: string;
  Icon: typeof WalletCards;
}> = [
  {
    id: "dero_invoice",
    title: "Direct invoice",
    detail: "One invoice, one integrated address, merchant receives after payment completion.",
    Icon: ReceiptText,
  },
  {
    id: "dero_router",
    title: "Payment router",
    detail: "Reusable merchant route for stores that want DeroPay routing in front of fulfillment.",
    Icon: Route,
  },
  {
    id: "dero_escrow",
    title: "Escrow",
    detail: "Funds lock before fulfillment and release after delivery or dispute review.",
    Icon: ShieldCheck,
  },
];

export function CheckoutFlow() {
  const router = useRouter();
  const {
    buyerDefaults,
    cart,
    cartSummary,
    listings,
    updateQuantity,
    createCheckout,
    saveBuyerDefaults,
    serverError,
  } = useMarketplace();
  const [selectedRail, setSelectedRail] = useState<PaymentRail>("dero_escrow");
  const [checkoutDetails, setCheckoutDetails] = useState<CheckoutDetails | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const activeCheckoutDetails = checkoutDetails ?? buyerDefaults;

  const cartIssues = useMemo(
    () =>
      cart.flatMap((item) => {
        const listing = listings.find((entry) => entry.id === item.listingId);
        if (!listing) return [`Unknown listing ${item.listingId}`];
        if (listing.status === "sold_out" || listing.stock <= 0) return [`${listing.title} is sold out`];
        if (listing.stock < item.quantity) {
          return [`${listing.title} only has ${listing.stock} available`];
        }
        return [];
      }),
    [cart, listings]
  );
  const deliveryLabel = useMemo(() => {
    if (activeCheckoutDetails.deliveryType === "physical") return "Shipping address";
    if (activeCheckoutDetails.deliveryType === "service") return "Service contact";
    return "Digital delivery contact";
  }, [activeCheckoutDetails.deliveryType]);
  const detailIssues = useMemo(() => {
    const issues: string[] = [];
    if (!activeCheckoutDetails.buyerAlias.trim()) issues.push("Buyer alias is required");
    if (!activeCheckoutDetails.contactHandle.trim()) issues.push("Contact handle is required");
    if (activeCheckoutDetails.deliveryDestination.trim().length < 3) {
      issues.push(`${deliveryLabel} is required`);
    }
    return issues;
  }, [activeCheckoutDetails, deliveryLabel]);
  const blockingIssues = [...cartIssues, ...detailIssues];

  async function submit() {
    if (blockingIssues.length > 0) return;
    saveBuyerDefaults(activeCheckoutDetails);
    setSubmitting(true);
    setNotice("Creating a DeroPay invoice for the exact order total.");
    const order = await createCheckout(selectedRail, activeCheckoutDetails);
    setSubmitting(false);
    if (order) router.push(`/orders/${order.id}`);
    if (!order) setNotice("Invoice creation failed. Review the warning and retry.");
  }

  if (cart.length === 0) {
    return (
      <div className="grid gap-5 pt-5 lg:grid-cols-[1fr_360px]">
        <section className="panel grid min-h-[360px] place-items-center p-6 text-center">
          <div className="max-w-md">
            <ShoppingBag className="mx-auto text-[var(--dero)]" size={44} />
            <h1 className="mt-4 text-2xl font-black">Cart is empty</h1>
            <p className="mt-2 text-[var(--muted)]">Add marketplace items before checkout.</p>
            <Link href="/" className="btn-primary mt-5">
              Browse market
            </Link>
          </div>
        </section>
        <RecentCheckoutAside />
      </div>
    );
  }

  return (
    <div className="grid gap-4 pt-4">
      <section className="panel-flat grid gap-3 p-4 md:grid-cols-3">
        {[
          ["1", "Delivery", "Where the seller should fulfill."],
          ["2", "Review", "Confirm items and protected total."],
          ["3", "DERO invoice", "Create exact escrow payment."],
        ].map(([step, label, detail]) => (
          <div key={step} className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-white p-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--dero)] text-sm font-black text-white">
              {step}
            </span>
            <span>
              <strong className="block">{label}</strong>
              <span className="text-sm text-[var(--muted)]">{detail}</span>
            </span>
          </div>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
      <section className="panel overflow-hidden">
        <div className="border-b border-[var(--line)] p-4">
          <h1 className="text-2xl font-black">Checkout</h1>
          <p className="text-sm text-[var(--muted)]">{cartSummary.lines.length} cart lines</p>
        </div>
        <div className="grid gap-0">
          {cartSummary.lines.map((line) => (
            <article
              key={line.listing.id}
              className="grid gap-3 border-b border-[var(--line)] p-4 md:grid-cols-[112px_1fr_auto]"
            >
              <img
                src={line.listing.imageUrl}
                alt={line.listing.imageAlt}
                className="aspect-[4/3] w-full rounded-lg object-cover md:w-[112px]"
              />
              <div className="min-w-0">
                <Link href={`/listing/${line.listing.slug}`} className="font-black hover:text-[var(--dero-strong)]">
                  {line.listing.title}
                </Link>
                <p className="mt-1 text-sm text-[var(--muted)]">{line.listing.delivery}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="badge">{line.listing.kind}</span>
                  <span className="badge badge-dero">DeroPay</span>
                </div>
              </div>
              <div className="grid content-between gap-3 justify-self-start md:justify-items-end">
                <strong>{formatDero(line.lineAtomic)}</strong>
                <div className="flex items-center gap-1">
                  <button
                    className="icon-btn h-9 w-9"
                    type="button"
                    title="Decrease quantity"
                    onClick={() => updateQuantity(line.listing.id, line.quantity - 1)}
                  >
                    <Minus size={15} />
                  </button>
                  <span className="grid h-9 min-w-10 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-3 font-bold">
                    {line.quantity}
                  </span>
                  <button
                    className="icon-btn h-9 w-9"
                    type="button"
                    title="Increase quantity"
                    onClick={() => updateQuantity(line.listing.id, line.quantity + 1)}
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    className="icon-btn h-9 w-9 text-[var(--red)]"
                    type="button"
                    title="Remove item"
                    onClick={() => updateQuantity(line.listing.id, 0)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="checkout-summary-rail grid content-start gap-4">
        <section className="panel grid gap-3 p-4">
          <h2 className="text-xl font-black">Delivery details</h2>
          <label className="grid gap-1 text-sm font-bold">
            Buyer alias
            <input
              className="input"
              value={activeCheckoutDetails.buyerAlias}
              onChange={(event) =>
                setCheckoutDetails({
                  ...activeCheckoutDetails,
                  buyerAlias: event.target.value,
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Contact handle
            <input
              className="input"
              value={activeCheckoutDetails.contactHandle}
              onChange={(event) =>
                setCheckoutDetails({
                  ...activeCheckoutDetails,
                  contactHandle: event.target.value,
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Delivery type
            <select
              className="select"
              value={activeCheckoutDetails.deliveryType}
              onChange={(event) =>
                setCheckoutDetails({
                  ...activeCheckoutDetails,
                  deliveryType: event.target.value as CheckoutDetails["deliveryType"],
                })
              }
            >
              <option value="physical">Physical shipment</option>
              <option value="digital">Digital delivery</option>
              <option value="service">Service coordination</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            {deliveryLabel}
            <textarea
              className="textarea"
              value={activeCheckoutDetails.deliveryDestination}
              onChange={(event) =>
                setCheckoutDetails({
                  ...activeCheckoutDetails,
                  deliveryDestination: event.target.value,
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Order note
            <input
              className="input"
              value={activeCheckoutDetails.orderNote}
              onChange={(event) =>
                setCheckoutDetails({
                  ...activeCheckoutDetails,
                  orderNote: event.target.value,
                })
              }
            />
          </label>
        </section>

        <section className="panel grid gap-4 p-4">
          <h2 className="text-xl font-black">Order total</h2>
          <SummaryRow label="Subtotal" value={formatDero(cartSummary.subtotalAtomic)} />
          <SummaryRow label="Buyer protection" value={formatDero(cartSummary.buyerProtectionAtomic)} />
          <SummaryRow label="Network estimate" value={formatDero(cartSummary.networkFeeAtomic)} />
          <div className="border-t border-[var(--line)] pt-3">
            <div className="flex items-end justify-between gap-3">
              <span className="font-bold">Total</span>
              <span className="text-2xl font-black">{formatDero(cartSummary.totalAtomic)}</span>
            </div>
            <div className="mt-1 text-right text-sm text-[var(--muted)]">
              {formatUsd(cartSummary.totalFiatEstimate)} product estimate
            </div>
          </div>
        </section>

        <section className="panel-flat grid gap-3 p-4">
          <div>
            <h2 className="text-xl font-black">Escrow checkout</h2>
            <p className="text-sm text-[var(--muted)]">Create a server-owned DeroPay invoice for this cart.</p>
          </div>
          <div className="rounded-lg border border-[var(--dero)] bg-[var(--dero-soft)] p-3">
            <span className="flex items-center gap-2 font-black">
              <ShieldCheck size={17} className="text-[var(--dero)]" />
              Escrow
            </span>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Funds lock before fulfillment and release after delivery or dispute review.
            </p>
          </div>
          <div className="timeline rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3">
            {[
              ["Pay invoice", "Send the exact DERO amount."],
              ["Funds locked", "Escrow holds payment before fulfillment."],
              ["Release or dispute", "Confirm delivery or request review."],
            ].map(([label, detail]) => (
              <div key={label} className="timeline-row">
                <span className="timeline-dot" />
                <div>
                  <div className="font-bold">{label}</div>
                  <p className="text-sm text-[var(--muted)]">{detail}</p>
                </div>
              </div>
            ))}
          </div>
          <details className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
            <summary className="cursor-pointer font-bold">Advanced rails</summary>
            <div className="mt-3 grid gap-2">
              {rails.map(({ id, title, detail, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={
                    selectedRail === id
                      ? "w-full rounded-lg border border-[var(--dero)] bg-[var(--dero-soft)] p-3 text-left"
                      : "w-full rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-left hover:border-[var(--dero)]"
                  }
                  onClick={() => setSelectedRail(id)}
                >
                  <span className="flex items-center gap-2 font-black">
                    <Icon size={17} className="text-[var(--dero)]" />
                    {title}
                  </span>
                  <span className="mt-1 block text-sm text-[var(--muted)]">{detail}</span>
                </button>
              ))}
            </div>
          </details>
          {serverError ? (
            <div className="rounded-lg border border-[rgba(161,98,7,0.28)] bg-[#fff7ed] p-3 text-sm text-[var(--amber)]">
              {serverError}
            </div>
          ) : null}
          {blockingIssues.length > 0 ? (
            <div className="grid gap-2 rounded-lg border border-[rgba(161,98,7,0.28)] bg-[#fff7ed] p-3 text-sm text-[var(--amber)]">
              {blockingIssues.map((issue) => (
                <p key={issue} className="flex items-center gap-2">
                  <AlertTriangle size={16} />
                  {issue}
                </p>
              ))}
            </div>
          ) : null}
          {notice ? <p className="text-sm text-[var(--muted)]">{notice}</p> : null}
          <button className="btn-primary w-full" type="button" onClick={submit} disabled={submitting || blockingIssues.length > 0}>
            <WalletCards size={18} />
            {submitting ? "Creating invoice..." : "Create DeroPay invoice"}
          </button>
          <Link href="/acquire" className="btn-secondary w-full">
            <Boxes size={17} />
            Need DERO first?
          </Link>
        </section>
      </aside>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RecentCheckoutAside() {
  const { orders } = useMarketplace();
  return (
    <aside className="panel-flat p-4">
      <h2 className="text-xl font-black">Recent orders</h2>
      <div className="mt-3 grid gap-2">
        {orders.slice(0, 4).map((order) => (
          <Link key={order.id} href="/orders" className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3 hover:border-[var(--dero)]">
            <strong className="block">{order.id}</strong>
            <span className="text-sm text-[var(--muted)]">{order.status.replaceAll("_", " ")}</span>
          </Link>
        ))}
        {orders.length === 0 ? <p className="text-sm text-[var(--muted)]">No orders yet.</p> : null}
      </div>
    </aside>
  );
}
