"use client";

import Link from "next/link";
import { Clock3, GitCompare, Heart, MapPin, PackagePlus, ShieldCheck, Star, Store, Truck } from "lucide-react";
import { useMarketplace } from "@/context/marketplace-context";
import { formatDero, formatUsd } from "@/lib/format";
import { isLowStock, listingProtectionSummary, sellerTrustLine } from "@/lib/trust";
import type { Listing, Seller } from "@/lib/types";

export function ProductCard({ listing, seller }: { listing: Listing; seller?: Seller }) {
  const {
    addToCart,
    isListingCompared,
    isListingWatched,
    toggleCompareListing,
    toggleWatchListing,
  } = useMarketplace();
  const unavailable = listing.status === "sold_out" || listing.stock <= 0;
  const watched = isListingWatched(listing.id);
  const compared = isListingCompared(listing.id);

  return (
    <article className="panel-flat overflow-hidden bg-white transition hover:border-[var(--dero)] hover:shadow-[var(--shadow-strong)]">
      <div className="product-image relative">
        <Link href={`/listing/${listing.slug}`} className="block h-full">
          <img src={listing.imageUrl} alt={listing.imageAlt} loading="lazy" />
        </Link>
        <button
          className="icon-btn absolute right-2 top-2 bg-[rgba(255,255,255,0.94)]"
          type="button"
          title={watched ? "Remove from saved" : "Save listing"}
          aria-label={watched ? "Remove from saved" : "Save listing"}
          onClick={() => toggleWatchListing(listing.id)}
        >
          <Heart size={17} fill={watched ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="grid gap-2 p-3">
        <div className="min-h-[74px]">
          <Link href={`/listing/${listing.slug}`} className="line-clamp-2 font-extrabold leading-snug hover:text-[var(--dero-strong)]">
            {listing.title}
          </Link>
          <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{listing.subtitle}</p>
        </div>
        <div className="flex items-end justify-between gap-2 border-t border-[var(--line)] pt-3">
          <div>
            <div className="text-xl font-black">{formatDero(listing.priceAtomic)}</div>
            <div className="text-xs text-[var(--muted)]">{formatUsd(listing.fiatEstimate)} est.</div>
          </div>
          <button
            className="icon-btn border-[var(--dero)] text-[var(--dero-strong)]"
            type="button"
            title={unavailable ? "Sold out" : "Add to cart"}
            disabled={unavailable}
            onClick={() => addToCart(listing.id)}
          >
            <PackagePlus size={18} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge">{listing.kind}</span>
          {isLowStock(listing) ? <span className="badge badge-warn">Low stock</span> : null}
          {watched ? <span className="badge">Saved</span> : null}
        </div>
        <div className="grid gap-2 text-xs text-[var(--muted)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <Star size={14} fill="currentColor" />
              {listing.rating.toFixed(2)} ({listing.reviewCount})
            </span>
            <span className="flex items-center gap-1">
              <Clock3 size={14} />
              {seller?.responseTime ?? "Response pending"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <Truck size={14} />
              {listing.delivery}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={14} />
              {listing.shipsFrom}
            </span>
          </div>
          <Link href={seller ? `/store/${seller.slug}` : "/"} className="flex items-center gap-1 font-bold hover:text-[var(--dero-strong)]">
            <Store size={14} />
            <span>{seller?.name ?? "Seller"}</span>
          </Link>
          <div className="flex flex-wrap gap-2">
            <span className="badge badge-dero">
              <ShieldCheck size={14} />
              Protected
            </span>
            <span className="badge">{sellerTrustLine(seller)}</span>
            <span className={listing.stock <= 3 ? "badge badge-warn" : "badge"}>
              {listing.stock} available
            </span>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              className={compared ? "btn-secondary min-h-9 border-[var(--dero)] px-3 text-[var(--dero-strong)]" : "btn-secondary min-h-9 px-3"}
              type="button"
              onClick={() => toggleCompareListing(listing.id)}
            >
              <GitCompare size={15} />
              {compared ? "Compared" : "Compare"}
            </button>
          </div>
          <p className="line-clamp-1">{listingProtectionSummary(listing)}</p>
        </div>
      </div>
    </article>
  );
}
