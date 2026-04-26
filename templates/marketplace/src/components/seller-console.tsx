"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  MapPin,
  MessageSquare,
  PackagePlus,
  ShieldCheck,
  Store,
  Truck,
  UserRound,
} from "lucide-react";
import { useMarketplace } from "@/context/marketplace-context";
import { formatDero } from "@/lib/format";
import type { ListingInput } from "@/lib/listing-input";
import type { FulfillmentEvidence } from "@/lib/types";
import { isSellerActionRequired, sellerNextAction } from "@/lib/trust";
import { OrderStatusPill } from "./status-pill";

type SellerTab = "listings" | "actions" | "orders" | "policies";

const defaultInput: ListingInput = {
  title: "",
  subtitle: "",
  category: "Digital",
  kind: "digital",
  priceDero: 10,
  stock: 10,
  delivery: "Digital delivery after escrow funding",
};

export function SellerConsole() {
  const {
    disputes,
    listings,
    orders,
    sellers,
    createListing,
    respondToDispute,
    sellerAdvanceOrder,
    sellerSubmitEvidence,
  } = useMarketplace();
  const [input, setInput] = useState<ListingInput>(defaultInput);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<SellerTab>("actions");
  const [evidenceKind, setEvidenceKind] =
    useState<FulfillmentEvidence["kind"]>("tracking");
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [sellerResponse, setSellerResponse] = useState("");
  const localSeller = sellers.find((seller) => seller.id === "sel_local");
  const localListings = listings.filter((listing) => listing.sellerId === "sel_local");
  const sellerOrders = useMemo(
    () => orders.filter((order) => order.sellerIds.includes("sel_local")),
    [orders]
  );
  const activeOrders = sellerOrders.filter(isSellerActionRequired);
  const sellerStandards = [
    { label: "Tracking coverage", value: "Evidence required", Icon: Truck },
    { label: "Response SLA", value: "Disputes before release", Icon: MessageSquare },
    { label: "Stock accuracy", value: "Server reserved", Icon: ShieldCheck },
    { label: "Handling time", value: "Queue visible", Icon: Clock3 },
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const listing = await createListing(input);
      setNotice(`${listing.title} is live`);
      setInput(defaultInput);
      setTab("listings");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Listing could not be created");
    }
  }

  async function submitEvidence(orderId: string) {
    await sellerSubmitEvidence(orderId, {
      kind: evidenceKind,
      summary: evidenceSummary || "Seller submitted fulfillment evidence.",
    });
    setEvidenceSummary("");
  }

  async function submitDisputeResponse(orderId: string) {
    await respondToDispute(orderId, sellerResponse || "Seller acknowledged the review.");
    setSellerResponse("");
  }

  return (
    <div className="grid gap-5 pt-5">
      <section className="panel grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-lg bg-[var(--dero)] text-white">
            <Store size={27} />
          </span>
          <div>
            <h1 className="text-3xl font-black">Seller console</h1>
            <p className="mt-2 max-w-3xl text-[var(--muted)]">{localSeller?.bio}</p>
          </div>
        </div>
        <div className="stat-grid">
          <div className="stat">
            <span>Listings</span>
            <strong>{localListings.length}</strong>
          </div>
          <div className="stat">
            <span>Orders</span>
            <strong>{sellerOrders.length}</strong>
          </div>
          <div className="stat">
            <span>Action required</span>
            <strong>{activeOrders.length}</strong>
          </div>
        </div>
      </section>

      <section className="panel-flat grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Seller standards</h2>
            <p className="text-sm text-[var(--muted)]">Service metrics mirror mature marketplace expectations: resolve cases, keep stock accurate, and provide evidence fast.</p>
          </div>
          <span className="badge badge-dero">Above standard target</span>
        </div>
        <div className="stat-grid">
          {sellerStandards.map(({ label, value, Icon }) => (
            <div key={label} className="stat">
              <span className="flex items-center gap-2">
                <Icon size={15} />
                {label}
              </span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {[
          ["actions", "Action required"],
          ["listings", "Listings"],
          ["orders", "All orders"],
          ["policies", "Policies"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "btn-secondary border-[var(--dero)] text-[var(--dero-strong)]" : "btn-secondary"}
            type="button"
            onClick={() => setTab(id as SellerTab)}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <form className="panel grid content-start gap-3 p-4" onSubmit={submit}>
          <h2 className="text-xl font-black">Create listing</h2>
          {notice ? <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-sm">{notice}</div> : null}
          <label className="grid gap-1 text-sm font-bold">
            Title
            <input
              className="input"
              value={input.title}
              onChange={(event) => setInput((current) => ({ ...current, title: event.target.value }))}
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Subtitle
            <input
              className="input"
              value={input.subtitle}
              onChange={(event) => setInput((current) => ({ ...current, subtitle: event.target.value }))}
              required
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold">
              Category
              <select
                className="select"
                value={input.category}
                onChange={(event) => setInput((current) => ({ ...current, category: event.target.value }))}
              >
                <option>Digital</option>
                <option>Hardware</option>
                <option>Services</option>
                <option>Supplies</option>
                <option>Bundles</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Type
              <select
                className="select"
                value={input.kind}
                onChange={(event) => setInput((current) => ({ ...current, kind: event.target.value as ListingInput["kind"] }))}
              >
                <option value="digital">Digital</option>
                <option value="physical">Physical</option>
                <option value="bundle">Bundle</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold">
              Price DERO
              <input
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                value={input.priceDero}
                onChange={(event) => setInput((current) => ({ ...current, priceDero: Number(event.target.value) }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Stock
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                value={input.stock}
                onChange={(event) => setInput((current) => ({ ...current, stock: Number(event.target.value) }))}
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-bold">
            Delivery
            <input
              className="input"
              value={input.delivery}
              onChange={(event) => setInput((current) => ({ ...current, delivery: event.target.value }))}
            />
          </label>
          <button className="btn-primary" type="submit">
            <PackagePlus size={17} />
            Publish listing
          </button>
          <Link href="/store/my-dero-store" className="btn-secondary">
            <Store size={17} />
            Open store
          </Link>
          <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-sm text-[var(--muted)]">
            <p className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-[var(--dero)]" />
              Escrow default for every new listing
            </p>
            <p className="flex items-center gap-2">
              <Truck size={16} className="text-[var(--dero)]" />
              Delivery evidence required before release
            </p>
          </div>
        </form>

        <div className="grid content-start gap-5">
          {tab === "actions" ? (
            <SellerOrderList
              disputes={disputes}
              evidenceKind={evidenceKind}
              evidenceSummary={evidenceSummary}
              listings={listings}
              orders={activeOrders}
              sellerResponse={sellerResponse}
              setEvidenceKind={setEvidenceKind}
              setEvidenceSummary={setEvidenceSummary}
              setSellerResponse={setSellerResponse}
              submitDisputeResponse={submitDisputeResponse}
              submitEvidence={submitEvidence}
              title="Action required"
              onAdvance={sellerAdvanceOrder}
            />
          ) : null}

          {tab === "listings" ? (
            <section className="panel-flat p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-black">My listings</h2>
                <span className="badge badge-dero">
                  <ShieldCheck size={13} />
                  Server-backed
                </span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-md border border-[var(--line)] bg-white">
                {localListings.length > 0 ? (
                  <table className="commerce-table min-w-[720px] text-sm">
                    <thead>
                      <tr>
                        <th>Listing</th>
                        <th>Status</th>
                        <th>Stock</th>
                        <th>Sold</th>
                        <th>Price</th>
                        <th>Delivery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {localListings.map((listing) => (
                        <tr key={listing.id}>
                          <td>
                            <Link href={`/listing/${listing.slug}`} className="flex items-center gap-3 hover:text-[var(--dero-strong)]">
                              <img src={listing.imageUrl} alt={listing.imageAlt} className="h-14 w-16 rounded-md object-cover" />
                              <span>
                                <strong className="block">{listing.title}</strong>
                                <span className="text-sm text-[var(--muted)]">{listing.subtitle}</span>
                              </span>
                            </Link>
                          </td>
                          <td>{listing.status.replace("_", " ")}</td>
                          <td>{listing.stock}</td>
                          <td>{listing.sold}</td>
                          <td className="font-bold">{formatDero(listing.priceAtomic)}</td>
                          <td>{listing.delivery}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-3 text-sm text-[var(--muted)]">No local listings yet.</p>
                )}
              </div>
            </section>
          ) : null}

          {tab === "orders" ? (
            <SellerOrderList
              disputes={disputes}
              evidenceKind={evidenceKind}
              evidenceSummary={evidenceSummary}
              listings={listings}
              orders={sellerOrders}
              sellerResponse={sellerResponse}
              setEvidenceKind={setEvidenceKind}
              setEvidenceSummary={setEvidenceSummary}
              setSellerResponse={setSellerResponse}
              submitDisputeResponse={submitDisputeResponse}
              submitEvidence={submitEvidence}
              title="All seller orders"
              onAdvance={sellerAdvanceOrder}
            />
          ) : null}

          {tab === "policies" ? (
            <section className="panel-flat p-4">
              <h2 className="text-xl font-black">Seller policies</h2>
              <div className="mt-3 grid gap-2">
                {(localSeller?.policies ?? []).map((policy) => (
                  <p key={policy} className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-sm text-[var(--muted)]">
                    <ShieldCheck size={16} className="text-[var(--dero)]" />
                    {policy}
                  </p>
                ))}
                <p className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-sm text-[var(--muted)]">
                  <MessageSquare size={16} className="text-[var(--dero)]" />
                  Respond to disputes before escrow can be manually resolved.
                </p>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SellerOrderList({
  disputes,
  evidenceKind,
  evidenceSummary,
  listings,
  orders,
  sellerResponse,
  setEvidenceKind,
  setEvidenceSummary,
  setSellerResponse,
  submitDisputeResponse,
  submitEvidence,
  title,
  onAdvance,
}: {
  disputes: ReturnType<typeof useMarketplace>["disputes"];
  evidenceKind: FulfillmentEvidence["kind"];
  evidenceSummary: string;
  listings: ReturnType<typeof useMarketplace>["listings"];
  orders: ReturnType<typeof useMarketplace>["orders"];
  sellerResponse: string;
  setEvidenceKind: (kind: FulfillmentEvidence["kind"]) => void;
  setEvidenceSummary: (summary: string) => void;
  setSellerResponse: (response: string) => void;
  submitDisputeResponse: (orderId: string) => Promise<void>;
  submitEvidence: (orderId: string) => Promise<void>;
  title: string;
  onAdvance: (orderId: string) => Promise<void>;
}) {
  return (
    <section className="panel-flat p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black">{title}</h2>
        <span className="badge badge-dero">
          <AlertTriangle size={13} />
          Seller queue
        </span>
      </div>
      <div className="mt-3 grid gap-3">
        {orders.length > 0 ? (
          orders.map((order) => {
            const firstListing = listings.find((listing) => listing.id === order.items[0]?.listingId);
            const dispute = disputes.find((entry) => entry.orderId === order.id);
            const canAdvance = ["funded", "processing", "shipped"].includes(order.status);
            return (
              <article key={order.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="break-all">{order.id}</strong>
                      <OrderStatusPill status={order.status} />
                    </div>
                    <p className="mt-2 font-bold">{firstListing?.title ?? "Marketplace order"}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{sellerNextAction(order)}</p>
                    <div className="mt-3 grid gap-2 text-sm text-[var(--muted)] md:grid-cols-3">
                      <span className="flex items-center gap-2">
                        <UserRound size={15} />
                        {order.checkoutDetails.contactHandle}
                      </span>
                      <span className="flex items-center gap-2">
                        <MapPin size={15} />
                        {order.checkoutDetails.deliveryDestination}
                      </span>
                      <span className="flex items-center gap-2">
                        <Clock3 size={15} />
                        {new Date(order.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {canAdvance ? (
                    <button className="btn-secondary self-start" type="button" onClick={() => onAdvance(order.id)}>
                      <Truck size={17} />
                      Advance
                    </button>
                  ) : null}
                </div>
                {canAdvance ? (
                  <details className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                    <summary className="cursor-pointer font-bold">Submit fulfillment evidence</summary>
                    <div className="mt-3 grid gap-2">
                      <select
                        className="select"
                        value={evidenceKind}
                        onChange={(event) => setEvidenceKind(event.target.value as FulfillmentEvidence["kind"])}
                      >
                        <option value="tracking">Tracking</option>
                        <option value="digital_delivery">Digital delivery</option>
                        <option value="seller_note">Seller note</option>
                      </select>
                      <textarea
                        className="textarea"
                        value={evidenceSummary}
                        onChange={(event) => setEvidenceSummary(event.target.value)}
                        placeholder="Tracking number, delivery link, or completion note"
                      />
                      <button className="btn-secondary" type="button" onClick={() => submitEvidence(order.id)}>
                        <Truck size={17} />
                        Submit evidence
                      </button>
                    </div>
                  </details>
                ) : null}
                {dispute ? (
                  <details className="mt-3 rounded-lg border border-[rgba(161,98,7,0.28)] bg-[#fff7ed] p-3">
                    <summary className="cursor-pointer font-bold text-[var(--amber)]">Dispute response</summary>
                    <div className="mt-3 grid gap-2">
                      <p className="text-sm text-[var(--amber)]">{dispute.reason}</p>
                      <textarea
                        className="textarea"
                        value={sellerResponse}
                        onChange={(event) => setSellerResponse(event.target.value)}
                        placeholder="Respond with evidence or next steps"
                      />
                      <button className="btn-secondary text-[var(--amber)]" type="button" onClick={() => submitDisputeResponse(order.id)}>
                        <MessageSquare size={17} />
                        Send response
                      </button>
                    </div>
                  </details>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="text-sm text-[var(--muted)]">No seller orders in this view.</p>
        )}
      </div>
    </section>
  );
}
