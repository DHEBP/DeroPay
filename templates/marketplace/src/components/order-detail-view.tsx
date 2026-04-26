"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Clock3,
  ExternalLink,
  LifeBuoy,
  PackageCheck,
  Radio,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useMarketplace } from "@/context/marketplace-context";
import {
  getBuyerNextAction,
  getBuyerOrderLabel,
  getOrderMilestone,
  getPaymentDetailLabel,
  type BuyerMilestone,
} from "@/lib/buyer-order";
import { formatDero, shortId } from "@/lib/format";
import {
  buildOrderHelpReason,
  orderHelpReasons,
  type OrderHelpReasonId,
} from "@/lib/trust";
import { OrderStatusPill, PaymentStatusPill } from "./status-pill";
import { TrustPanel } from "./trust-panel";

const milestones: Array<{ id: BuyerMilestone; label: string }> = [
  { id: "payment", label: "Payment" },
  { id: "confirmed", label: "Confirmed" },
  { id: "fulfillment", label: "Fulfillment" },
  { id: "delivered", label: "Delivered" },
  { id: "review", label: "Review" },
  { id: "release", label: "Release" },
  { id: "refunded", label: "Refunded" },
  { id: "expired", label: "Expired" },
];

export function OrderDetailView({ orderId }: { orderId: string }) {
  const {
    orders,
    listings,
    sellers,
    paymentIntents,
    fulfillmentEvidence,
    disputes,
    releaseOrder,
    openDispute,
    pollInvoiceStatus,
    serverError,
  } = useMarketplace();
  const [copied, setCopied] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [helpReason, setHelpReason] = useState<OrderHelpReasonId>("late_delivery");

  const order = orders.find((entry) => entry.id === orderId);
  const invoice = order
    ? paymentIntents.find((entry) => entry.id === order.paymentIntentId)
    : undefined;
  const evidence = fulfillmentEvidence.filter((entry) => entry.orderId === orderId);
  const dispute = disputes.find((entry) => entry.orderId === orderId);
  const items = useMemo(
    () =>
      order
        ? order.items
            .map((item) => ({
              cart: item,
              listing: listings.find((listing) => listing.id === item.listingId),
            }))
            .filter((line) => Boolean(line.listing))
        : [],
    [listings, order]
  );

  if (!order) {
    return (
      <div className="panel mt-5 grid min-h-[320px] place-items-center p-6 text-center">
        <div>
          <PackageCheck className="mx-auto text-[var(--dero)]" size={44} />
          <h1 className="mt-4 text-2xl font-black">Order not found</h1>
          <p className="mt-2 text-[var(--muted)]">Refresh orders or return to order history.</p>
          <Link href="/orders" className="btn-primary mt-5">
            Order history
          </Link>
        </div>
      </div>
    );
  }

  const activeMilestone = getOrderMilestone(order);
  const canRelease = order.status === "delivered" && order.paymentRail === "dero_escrow";
  const canDispute = ["funded", "processing", "shipped", "delivered"].includes(
    order.status
  );
  const seller = sellers.find((entry) => order.sellerIds.includes(entry.id));

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  return (
    <div className="grid gap-5 pt-5">
      <section className="panel grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-black">{shortId(order.id)}</h1>
            <OrderStatusPill status={order.status} />
            {invoice ? <PaymentStatusPill status={invoice.status} /> : null}
          </div>
          <p className="mt-2 max-w-3xl text-[var(--muted)]">{getBuyerNextAction(order)}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {milestones.map((milestone) => {
              const active = milestone.id === activeMilestone;
              return (
                <span key={milestone.id} className={active ? "badge badge-dero" : "badge"}>
                  {milestone.label}
                </span>
              );
            })}
          </div>
        </div>
        <aside className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-4">
          <span className="text-sm font-bold text-[var(--muted)]">Current step</span>
          <strong className="mt-1 block text-2xl">{getBuyerOrderLabel(order)}</strong>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {new Date(order.updatedAt).toLocaleString()}
          </p>
        </aside>
      </section>

      {serverError ? (
        <div className="rounded-lg border border-[rgba(161,98,7,0.28)] bg-[#fff7ed] p-3 text-sm text-[var(--amber)]">
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <main className="grid content-start gap-4">
          <section className="panel-flat p-4">
            <h2 className="text-xl font-black">Items</h2>
            <div className="mt-3 grid gap-3">
              {items.map(({ cart, listing }) =>
                listing ? (
                  <div key={cart.listingId} className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3 md:grid-cols-[86px_1fr_auto]">
                    <img src={listing.imageUrl} alt={listing.imageAlt} className="aspect-[4/3] w-full rounded-md object-cover md:w-[86px]" />
                    <div>
                      <Link href={`/listing/${listing.slug}`} className="font-black hover:text-[var(--dero-strong)]">
                        {listing.title}
                      </Link>
                      <p className="text-sm text-[var(--muted)]">{listing.delivery}</p>
                    </div>
                    <div className="font-bold md:text-right">Qty {cart.quantity}</div>
                  </div>
                ) : null
              )}
            </div>
          </section>

          <section className="panel-flat p-4">
            <h2 className="text-xl font-black">Timeline</h2>
            <div className="timeline mt-3">
              {order.events.map((event) => (
                <div key={event.id} className="timeline-row">
                  <span className="timeline-dot" />
                  <div>
                    <div className="font-bold">{event.label}</div>
                    <p className="text-sm text-[var(--muted)]">{event.detail}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{new Date(event.at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {evidence.length > 0 ? (
            <section className="panel-flat p-4">
              <h2 className="text-xl font-black">Delivery evidence</h2>
              <div className="mt-3 grid gap-2">
                {evidence.map((entry) => (
                  <p key={entry.id} className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-sm text-[var(--muted)]">
                    <strong className="block text-[var(--ink)]">{entry.kind.replaceAll("_", " ")}</strong>
                    <span className="mt-1 block">{entry.summary}</span>
                    <span className="mt-1 block text-xs">{new Date(entry.createdAt).toLocaleString()}</span>
                  </p>
                ))}
              </div>
            </section>
          ) : null}

          <section className="panel-flat p-4">
            <h2 className="text-xl font-black">Delivery details</h2>
            <div className="mt-3 grid gap-2 text-sm">
              <p>
                <span className="font-bold">Buyer:</span>{" "}
                <span className="text-[var(--muted)]">{order.checkoutDetails.buyerAlias}</span>
              </p>
              <p>
                <span className="font-bold">Contact:</span>{" "}
                <span className="text-[var(--muted)]">{order.checkoutDetails.contactHandle}</span>
              </p>
              <p>
                <span className="font-bold">Destination:</span>{" "}
                <span className="text-[var(--muted)]">{order.checkoutDetails.deliveryDestination}</span>
              </p>
              {order.checkoutDetails.orderNote ? (
                <p>
                  <span className="font-bold">Note:</span>{" "}
                  <span className="text-[var(--muted)]">{order.checkoutDetails.orderNote}</span>
                </p>
              ) : null}
            </div>
          </section>
        </main>

        <aside className="grid content-start gap-4">
          {invoice ? (
            <section className="panel grid gap-4 p-4">
              <div>
                <h2 className="text-xl font-black">Invoice payment</h2>
                <p className="text-sm text-[var(--muted)]">{getPaymentDetailLabel(invoice)}</p>
              </div>
              <div className="grid aspect-square place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-strong)]">
                <div className="grid h-36 w-36 place-items-center rounded-md border border-[var(--line)] bg-[var(--dero-soft)] text-center text-xs font-bold text-[var(--dero-strong)]">
                  DERO invoice QR
                </div>
              </div>
              <div className="grid gap-2">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3">
                  <span className="text-xs font-bold uppercase text-[var(--muted)]">Send exactly</span>
                  <strong className="mt-1 block text-2xl">{formatDero(invoice.amountAtomic)}</strong>
                </div>
                <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <Clock3 size={16} />
                  Expires {new Date(invoice.expiresAt).toLocaleString()}
                </p>
              </div>
              <div className="grid gap-2">
                <p className="text-xs font-bold uppercase text-[var(--muted)]">Integrated address</p>
                <p className="break-all rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-2 text-xs text-[var(--muted)]">
                  {invoice.integratedAddress}
                </p>
                <button className="btn-secondary" type="button" onClick={() => copy(invoice.integratedAddress, "address")}>
                  <Clipboard size={17} />
                  {copied === "address" ? "Copied address" : "Copy address"}
                </button>
                <button className="btn-secondary" type="button" onClick={() => copy(`dero:${invoice.integratedAddress}?amount=${invoice.amountDero}`, "uri")}>
                  <WalletCards size={17} />
                  {copied === "uri" ? "Copied wallet URI" : "Copy wallet URI"}
                </button>
              </div>
              <button className="btn-secondary" type="button" onClick={() => pollInvoiceStatus(invoice.invoiceId)}>
                <Radio size={17} />
                Reconcile status
              </button>
              <details className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                <summary className="cursor-pointer font-bold">Payment details</summary>
                <div className="mt-3 grid gap-2 text-xs text-[var(--muted)]">
                  <p className="break-all">Invoice: {invoice.invoiceId}</p>
                  <p className="break-all">Payment ID: {invoice.paymentId}</p>
                  <p>Received: {formatDero(invoice.amountReceivedAtomic)}</p>
                  <p>Status: {invoice.status}</p>
                </div>
              </details>
            </section>
          ) : null}

          {invoice ? (
            <section className="panel-flat grid gap-3 p-4">
              <h2 className="text-xl font-black">Receipt</h2>
              <div className="grid gap-2 text-sm">
                <p className="flex justify-between gap-3">
                  <span className="text-[var(--muted)]">Order total</span>
                  <strong>{formatDero(order.totalAtomic)}</strong>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-[var(--muted)]">Rail</span>
                  <strong>{order.paymentRail.replaceAll("_", " ")}</strong>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-[var(--muted)]">Invoice</span>
                  <strong className="break-all text-right">{invoice.invoiceId}</strong>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-[var(--muted)]">Received</span>
                  <strong>{formatDero(invoice.amountReceivedAtomic)}</strong>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-[var(--muted)]">{invoice.rail === "dero_escrow" ? "Escrow" : "Settlement"}</span>
                  <strong>{invoice.escrowState.replaceAll("_", " ")}</strong>
                </p>
              </div>
            </section>
          ) : null}

          <TrustPanel
            title="Escrow protection"
            items={[
              {
                title: "Funds lock before fulfillment",
                detail: "The seller does not receive payment until delivery is accepted.",
                badge: "Escrow",
                Icon: ShieldCheck,
              },
              {
                title: "Dispute review",
                detail: "Open a review if delivery evidence does not match the listing.",
                Icon: AlertTriangle,
              },
              {
                title: seller ? seller.name : "Verified sellers",
                detail: seller
                  ? `${seller.rating || "New"} rating, ${seller.sales} completed sales`
                  : "Seller reputation is shown before purchase.",
                Icon: CheckCircle2,
              },
            ]}
          />

          <section className="panel-flat grid gap-3 p-4">
            <h2 className="text-xl font-black">Buyer actions</h2>
            {canRelease ? (
              <button className="btn-primary" type="button" onClick={() => releaseOrder(order.id)}>
                <ShieldCheck size={17} />
                Release escrow
              </button>
            ) : (
              <p className="text-sm text-[var(--muted)]">No buyer action is required right now.</p>
            )}
            <Link href="/orders" className="btn-plain">
              <ExternalLink size={16} />
              Order history
            </Link>
          </section>

          <section className="panel-flat grid gap-3 p-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black">
                <LifeBuoy size={20} className="text-[var(--dero)]" />
                Help with this order
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Choose a reason before opening marketplace review.
              </p>
            </div>
            {dispute ? (
              <div className="grid gap-3 rounded-lg border border-[rgba(161,98,7,0.28)] bg-[#fff7ed] p-3 text-sm text-[var(--amber)]">
                <strong>Dispute open</strong>
                <p>{dispute.reason}</p>
                {dispute.sellerResponse ? <p>Seller: {dispute.sellerResponse}</p> : null}
                <div className="grid gap-2">
                  {dispute.events.map((event) => (
                    <p key={event.id} className="rounded-md border border-[rgba(161,98,7,0.18)] bg-white/55 p-2">
                      <strong>{event.label}</strong>
                      <span className="mt-1 block">{event.detail}</span>
                      <span className="mt-1 block text-xs">
                        {event.actor} - {new Date(event.at).toLocaleString()}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            ) : canDispute ? (
              <div className="grid gap-3">
                <div className="grid gap-2">
                  {orderHelpReasons.map((reason) => (
                    <button
                      key={reason.id}
                      className={
                        helpReason === reason.id
                          ? "btn-secondary justify-start border-[var(--dero)] text-[var(--dero-strong)]"
                          : "btn-secondary justify-start"
                      }
                      type="button"
                      onClick={() => setHelpReason(reason.id)}
                    >
                      <AlertTriangle size={16} />
                      {reason.label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="textarea"
                  value={disputeReason}
                  onChange={(event) => setDisputeReason(event.target.value)}
                  placeholder="Add details for marketplace review"
                />
                <button
                  className="btn-secondary text-[var(--amber)]"
                  type="button"
                  onClick={() =>
                    openDispute(order.id, buildOrderHelpReason(helpReason, disputeReason))
                  }
                >
                  <AlertTriangle size={17} />
                  Open marketplace review
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                Marketplace review opens after funds are locked and before final release.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
