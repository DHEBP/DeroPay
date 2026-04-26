"use client";

import { MessageSquare, ShieldCheck, Star, Store } from "lucide-react";
import { useMarketplace } from "@/context/marketplace-context";
import { ProductCard } from "./product-card";

export function StorefrontView({ slug }: { slug: string }) {
  const { listings, sellers } = useMarketplace();
  const seller = sellers.find((entry) => entry.slug === slug);
  if (!seller) {
    return (
      <div className="panel mt-5 p-6">
        <h1 className="text-2xl font-black">Store unavailable</h1>
        <p className="mt-2 text-[var(--muted)]">This seller store is not active in the local marketplace state.</p>
      </div>
    );
  }
  const sellerListings = listings.filter((listing) => listing.sellerId === seller.id);

  return (
    <div className="grid gap-5 pt-5">
      <section className="panel grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-[var(--dero)] text-white">
            <Store size={30} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black">{seller.name}</h1>
              <span className="badge badge-dero">{seller.tier}</span>
            </div>
            <p className="mt-2 max-w-3xl text-[var(--muted)]">{seller.bio}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {seller.policies.map((policy) => (
                <span key={policy} className="badge">
                  <ShieldCheck size={13} />
                  {policy}
                </span>
              ))}
            </div>
          </div>
        </div>
        <aside className="stat-grid">
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
          <button className="btn-primary" type="button">
            <MessageSquare size={17} />
            Message
          </button>
        </aside>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">Store listings</h2>
            <p className="text-sm text-[var(--muted)]">{sellerListings.length} active items</p>
          </div>
          <span className="badge">
            <Star size={13} fill="currentColor" />
            {seller.reviewCount} reviews
          </span>
        </div>
        <div className="product-grid">
          {sellerListings.map((listing) => (
            <ProductCard key={listing.id} listing={listing} seller={seller} />
          ))}
        </div>
      </section>
    </div>
  );
}
