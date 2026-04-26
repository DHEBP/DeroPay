"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, GitCompare, Heart, MapPin, MessageSquare, PackagePlus, ShieldCheck, Star, Store, Truck } from "lucide-react";
import { useMarketplace } from "@/context/marketplace-context";
import { reviews as baseReviews } from "@/lib/marketplace-data";
import { formatDero, formatUsd } from "@/lib/format";
import { isLowStock, listingProtectionSummary } from "@/lib/trust";
import { TrustPanel } from "./trust-panel";

export function ListingDetail({ slug }: { slug: string }) {
  const router = useRouter();
  const {
    listings,
    sellers,
    addToCart,
    isListingCompared,
    isListingWatched,
    toggleCompareListing,
    toggleWatchListing,
    trackRecentlyViewedListing,
  } = useMarketplace();
  const [sellerQuestion, setSellerQuestion] = useState("");
  const [questionSent, setQuestionSent] = useState(false);
  const listing = listings.find((entry) => entry.slug === slug);

  useEffect(() => {
    if (listing) trackRecentlyViewedListing(listing.id);
  }, [listing, trackRecentlyViewedListing]);

  if (!listing) {
    return (
      <div className="panel mt-5 p-6">
        <h1 className="text-2xl font-black">Listing unavailable</h1>
        <p className="mt-2 text-[var(--muted)]">This listing is not active in the local marketplace state.</p>
      </div>
    );
  }
  const seller = sellers.find((entry) => entry.id === listing.sellerId);
  const reviews = baseReviews.filter((review) => review.listingId === listing.id);
  const watched = isListingWatched(listing.id);
  const compared = isListingCompared(listing.id);
  const unavailable = listing.status === "sold_out" || listing.stock <= 0;

  return (
    <div className="grid gap-5 pt-5">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1fr)_360px]">
        <section className="panel overflow-hidden">
          <div className="product-image">
            <img src={listing.imageUrl} alt={listing.imageAlt} />
          </div>
          <div className="grid grid-cols-4 gap-2 border-t border-[var(--line)] p-3">
            {[listing.imageUrl, listing.imageUrl, listing.imageUrl, listing.imageUrl].map((image, index) => (
              <button
                key={`${image}-${index}`}
                className="overflow-hidden rounded-md border border-[var(--line)] bg-white"
                type="button"
                title={`View image ${index + 1}`}
              >
                <img src={image} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </section>

        <section className="panel grid content-start gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            {listing.tags.map((tag) => (
              <span key={tag} className="badge">
                {tag}
              </span>
            ))}
          </div>
          <div>
            <h1 className="text-3xl font-black leading-tight">{listing.title}</h1>
            <p className="mt-2 text-[var(--muted)]">{listing.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <span className="flex items-center gap-1">
              <Star size={16} fill="currentColor" className="text-[var(--amber)]" />
              {listing.rating.toFixed(2)} from {listing.reviewCount} reviews
            </span>
            <span>{listing.sold} sold</span>
            <span>{listing.stock} available</span>
          </div>
          <p className="leading-7 text-[var(--muted)]">{listing.description}</p>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(listing.specs).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3">
                  <div className="text-xs font-bold text-[var(--muted)]">{key}</div>
                  <div className="mt-1 font-extrabold">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="sticky-buy-box grid content-start gap-4">
          <section className="panel grid gap-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="mb-1 text-xl font-black">Purchase box</h2>
                <div className="text-3xl font-black">{formatDero(listing.priceAtomic)}</div>
                <div className="text-sm text-[var(--muted)]">{formatUsd(listing.fiatEstimate)} estimate</div>
              </div>
              <span className={listing.status === "low_stock" ? "badge badge-warn" : "badge badge-dero"}>
                {listing.status.replace("_", " ")}
              </span>
            </div>

            <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-sm">
              <p className="flex items-center gap-2">
                <Truck size={17} className="text-[var(--dero)]" />
                {listing.delivery}
              </p>
              <p className="flex items-center gap-2">
                <MapPin size={17} className="text-[var(--dero)]" />
                Ships from {listing.shipsFrom}
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck size={17} className="text-[var(--dero)]" />
                {listingProtectionSummary(listing)}
              </p>
              <p className="flex items-center gap-2">
                <Star size={17} fill="currentColor" className="text-[var(--amber)]" />
                {listing.rating.toFixed(2)} from {listing.reviewCount} reviews
              </p>
              <p className="flex items-center gap-2">
                <Clock3 size={17} className="text-[var(--dero)]" />
                {seller?.responseTime ?? "Response pending"}
              </p>
            </div>

            <div className="timeline rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3">
              {[
                ["Pay exact invoice", "DERO goes to an integrated address tied to this order."],
                ["Escrow locks", "Seller prepares delivery only after funding is complete."],
                ["Review evidence", "Release funds or open a dispute from order detail."],
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

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <button
                className="btn-primary"
                type="button"
                disabled={unavailable}
                onClick={() => {
                  addToCart(listing.id);
                  router.push("/checkout");
                }}
              >
                <PackagePlus size={17} />
                Buy with DERO
              </button>
              <button className="btn-secondary" type="button" disabled={unavailable} onClick={() => addToCart(listing.id)}>
                <PackagePlus size={17} />
                Add to cart
              </button>
              <button className="btn-secondary" type="button" onClick={() => toggleWatchListing(listing.id)}>
                <Heart size={17} fill={watched ? "currentColor" : "none"} />
                {watched ? "Saved" : "Save listing"}
              </button>
              <button className="btn-secondary" type="button" onClick={() => toggleCompareListing(listing.id)}>
                <GitCompare size={17} />
                {compared ? "Compared" : "Compare"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={isLowStock(listing) ? "badge badge-warn" : "badge"}>
                {listing.stock} available
              </span>
              <span className="badge badge-dero">
                <ShieldCheck size={13} />
                Escrow default
              </span>
            </div>
          </section>

        </aside>
      </div>

      <section className="grid items-start gap-3 lg:grid-cols-[1fr_360px]">
        <div className="panel-flat p-4">
          <h2 className="text-xl font-black">Reviews</h2>
          <div className="mt-3 grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3 sm:grid-cols-3">
            <div>
              <span className="text-xs font-bold text-[var(--muted)]">Rating</span>
              <strong className="mt-1 block text-2xl">{listing.rating.toFixed(2)}</strong>
            </div>
            <div>
              <span className="text-xs font-bold text-[var(--muted)]">Reviews</span>
              <strong className="mt-1 block text-2xl">{listing.reviewCount}</strong>
            </div>
            <div>
              <span className="text-xs font-bold text-[var(--muted)]">Sold</span>
              <strong className="mt-1 block text-2xl">{listing.sold}</strong>
            </div>
          </div>
          <div className="mt-3 grid gap-3">
            {reviews.length > 0 ? (
              reviews.map((review) => (
                <article key={review.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <strong>{review.buyerAlias}</strong>
                    <span className="badge">
                      <Star size={13} fill="currentColor" />
                      {review.rating}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">{review.text}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-[var(--muted)]">No reviews yet.</p>
            )}
          </div>
        </div>
        <div className="grid content-start gap-4">
          {seller ? (
            <section className="panel-flat grid gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--dero-soft)] text-[var(--dero-strong)]">
                  <Store size={21} />
                </span>
                <div className="min-w-0">
                  <Link href={`/store/${seller.slug}`} className="font-black hover:text-[var(--dero-strong)]">
                    {seller.name}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">{seller.location}</p>
                </div>
              </div>
              <div className="stat-grid">
                <div className="stat">
                  <span>Rating</span>
                  <strong>{seller.rating || "New"}</strong>
                </div>
                <div className="stat">
                  <span>Sales</span>
                  <strong>{seller.sales}</strong>
                </div>
                <div className="stat">
                  <span>Response</span>
                  <strong>{seller.responseTime}</strong>
                </div>
              </div>
              <button className="btn-secondary" type="button">
                <MessageSquare size={17} />
                Message seller
              </button>
              <details className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                <summary className="cursor-pointer font-bold">Ask seller</summary>
                <div className="mt-3 grid gap-2">
                  <textarea
                    className="textarea"
                    value={sellerQuestion}
                    onChange={(event) => {
                      setSellerQuestion(event.target.value);
                      setQuestionSent(false);
                    }}
                    placeholder="Ask about stock, delivery, or escrow evidence"
                  />
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setQuestionSent(Boolean(sellerQuestion.trim()))}
                  >
                    <MessageSquare size={17} />
                    Draft question
                  </button>
                  {questionSent ? (
                    <p className="text-sm text-[var(--muted)]">Question drafted for seller messaging.</p>
                  ) : null}
                </div>
              </details>
            </section>
          ) : null}

          <TrustPanel
            title="Protected purchase"
            items={[
              {
                title: "Escrow funded before fulfillment",
                detail: "DERO is locked before the seller prepares delivery.",
                badge: "Escrow",
                Icon: ShieldCheck,
              },
              {
                title: "Release after delivery",
                detail: "The seller is paid after you review the delivery evidence.",
                Icon: CheckCircle2,
              },
              {
                title: seller ? `${seller.sales} sales` : "Seller history",
                detail: seller
                  ? `${seller.rating || "New"} rating, ${seller.responseTime} response time`
                  : "Seller trust data appears before purchase.",
                Icon: Star,
              },
            ]}
          />

          <div className="panel-flat p-4">
            <h2 className="text-xl font-black">Protection</h2>
            <div className="mt-3 grid gap-2">
              {listing.protection.map((item) => (
                <p key={item} className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <CheckCircle2 size={16} className="text-[var(--dero)]" />
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mobile-buy-bar">
        <div className="min-w-0">
          <strong>{formatDero(listing.priceAtomic)}</strong>
          <span>Protected DERO checkout</span>
        </div>
        <button
          className="btn-primary"
          type="button"
          disabled={unavailable}
          onClick={() => {
            addToCart(listing.id);
            router.push("/checkout");
          }}
        >
          <PackagePlus size={17} />
          Buy
        </button>
      </div>
    </div>
  );
}
