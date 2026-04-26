"use client";

import Link from "next/link";
import { useState } from "react";
import { Clock3, PackageCheck, ShieldCheck } from "lucide-react";
import { useMarketplace } from "@/context/marketplace-context";
import { getBuyerNextAction, getBuyerOrderLabel } from "@/lib/buyer-order";
import { formatDero, shortId } from "@/lib/format";
import { OrderStatusPill } from "./status-pill";

export function OrdersView() {
  const { orders, listings, serverError } = useMarketplace();
  const [filter, setFilter] = useState("all");
  const sortedOrders = [...orders]
    .filter((order) => {
      if (filter === "payment") {
        return ["awaiting_payment", "payment_detected", "confirming", "partial_payment", "expired"].includes(order.status);
      }
      if (filter === "fulfillment") return ["funded", "processing", "shipped"].includes(order.status);
      if (filter === "action") return order.status === "delivered";
      if (filter === "completed") return ["released", "refunded"].includes(order.status);
      if (filter === "disputed") return order.status === "disputed";
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (orders.length === 0) {
    return (
      <div className="panel mt-5 grid min-h-[360px] place-items-center p-6 text-center">
        <div>
          <PackageCheck className="mx-auto text-[var(--dero)]" size={44} />
          <h1 className="mt-4 text-2xl font-black">No orders</h1>
          <p className="mt-2 text-[var(--muted)]">Marketplace orders will appear here.</p>
          <Link href="/" className="btn-primary mt-5">
            Browse market
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 pt-5">
      <section>
        <h1 className="text-3xl font-black">Order history</h1>
        <p className="text-sm text-[var(--muted)]">{sortedOrders.length} escrow orders</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["all", "All"],
            ["payment", "Needs payment"],
            ["fulfillment", "In fulfillment"],
            ["action", "Action needed"],
            ["completed", "Completed"],
            ["disputed", "Disputed"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "btn-secondary border-[var(--dero)] text-[var(--dero-strong)]" : "btn-secondary"}
              type="button"
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {serverError ? (
          <div className="mt-3 rounded-lg border border-[rgba(161,98,7,0.28)] bg-[#fff7ed] p-3 text-sm text-[var(--amber)]">
            {serverError}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3">
        {sortedOrders.length === 0 ? (
          <div className="panel-flat p-4 text-sm text-[var(--muted)]">No orders match this filter.</div>
        ) : null}
        {sortedOrders.map((order) => {
          const firstItem = order.items[0];
          const firstListing = listings.find((listing) => listing.id === firstItem?.listingId);
          return (
            <Link key={order.id} href={`/orders/${order.id}`} className="panel grid gap-3 p-4 hover:border-[var(--dero)] lg:grid-cols-[92px_1fr_auto]">
              {firstListing ? (
                <img src={firstListing.imageUrl} alt={firstListing.imageAlt} className="aspect-[4/3] w-full rounded-md object-cover lg:w-[92px]" />
              ) : (
                <span className="grid aspect-[4/3] w-full place-items-center rounded-md bg-[var(--dero-soft)] text-[var(--dero-strong)] lg:w-[92px]">
                  <ShieldCheck size={22} />
                </span>
              )}
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-lg">{shortId(order.id)}</strong>
                  <OrderStatusPill status={order.status} />
                </span>
                <span className="mt-1 block font-bold">{getBuyerOrderLabel(order)}</span>
                <span className="mt-1 block text-sm text-[var(--muted)]">{getBuyerNextAction(order)}</span>
                <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  <span>
                    {order.items.length} item{order.items.length === 1 ? "" : "s"}
                  </span>
                  <span className="badge badge-dero">
                    <ShieldCheck size={13} />
                    Protected
                  </span>
                  <span className="badge">
                    <Clock3 size={13} />
                    {new Date(order.createdAt).toLocaleString()}
                  </span>
                </span>
              </span>
              <span className="text-left lg:text-right">
                <strong className="block text-2xl">{formatDero(order.totalAtomic)}</strong>
                <span className="text-sm text-[var(--muted)]">{order.paymentRail.replaceAll("_", " ")}</span>
              </span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
