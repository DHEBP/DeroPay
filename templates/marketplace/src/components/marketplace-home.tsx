"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownUp, BadgeCheck, GitCompare, Grid2X2, Heart, ListFilter, MessageSquare, Search, ShieldCheck, SlidersHorizontal, Star, Truck, X } from "lucide-react";
import { useMarketplace } from "@/context/marketplace-context";
import { categories } from "@/lib/marketplace-data";
import { formatDero } from "@/lib/format";
import { matchesTrustFilter, trustFilters, type TrustFilterId } from "@/lib/trust";
import { ProductCard } from "./product-card";

type SortKey = "featured" | "price_asc" | "rating" | "sold";

export function MarketplaceHome() {
  const {
    listings,
    sellers,
    cartCount,
    compareListingIds,
    recentlyViewedListingIds,
    toggleCompareListing,
    watchedListingIds,
  } = useMarketplace();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortKey>("featured");
  const [kind, setKind] = useState("all");
  const [trustFilter, setTrustFilter] = useState<TrustFilterId>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = listings.filter((listing) => {
      const seller = sellers.find((entry) => entry.id === listing.sellerId);
      const matchesQuery =
        !q ||
        [listing.title, listing.subtitle, listing.category, ...listing.tags]
          .join(" ")
          .toLowerCase()
          .includes(q);
      const matchesCategory = category === "All" || listing.category === category;
      const matchesKind = kind === "all" || listing.kind === kind;
      const matchesTrust = matchesTrustFilter(trustFilter, listing, seller, watchedListingIds);
      return matchesQuery && matchesCategory && matchesKind && matchesTrust;
    });
    return [...rows].sort((a, b) => {
      if (sort === "price_asc") return Number(BigInt(a.priceAtomic) - BigInt(b.priceAtomic));
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "sold") return b.sold - a.sold;
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    });
  }, [category, kind, listings, query, sellers, sort, trustFilter, watchedListingIds]);

  const featured = listings.filter((listing) => listing.featured).slice(0, 3);
  const savedListings = listings
    .filter((listing) => watchedListingIds.includes(listing.id))
    .slice(0, 4);
  const recentlyViewedListings = recentlyViewedListingIds
    .map((id) => listings.find((listing) => listing.id === id))
    .filter((listing): listing is NonNullable<typeof listing> => Boolean(listing))
    .slice(0, 4);
  const compareListings = compareListingIds
    .map((id) => listings.find((listing) => listing.id === id))
    .filter((listing): listing is NonNullable<typeof listing> => Boolean(listing));

  function clearFilters() {
    setQuery("");
    setCategory("All");
    setKind("all");
    setTrustFilter("all");
    setSort("featured");
  }

  const confidenceSignals = [
    { label: "Protected checkout", detail: "Escrow or invoice truth before release", Icon: ShieldCheck },
    { label: "Seller history", detail: "Sales, rating, response time", Icon: Star },
    { label: "Tracking evidence", detail: "Fulfillment proof on every order", Icon: Truck },
    { label: "Issue resolution", detail: "Review path before funds release", Icon: MessageSquare },
  ];

  return (
    <div className="grid gap-4 pt-4">
      <section className="commerce-search">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_180px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products, services, stores"
            />
          </label>
          <label className="relative">
            <ListFilter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} />
            <select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
          </label>
          <label className="relative">
            <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} />
            <select className="select" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="featured">Featured</option>
              <option value="price_asc">Lowest price</option>
              <option value="rating">Top rated</option>
              <option value="sold">Most sold</option>
            </select>
          </label>
        </div>
      </section>

      <section className="market-confidence" aria-label="Marketplace confidence">
        <div>
          <h2 className="text-sm font-black">Confidence signals</h2>
          <p className="text-xs text-[var(--muted)]">eBay-inspired trust signals adapted for DERO payment truth.</p>
        </div>
        {confidenceSignals.map(({ label, detail, Icon }) => (
          <div key={label} className="confidence-item">
            <Icon size={17} className="text-[var(--dero)]" />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </div>
        ))}
        <BadgeCheck size={18} className="hidden text-[var(--dero)] md:block" />
      </section>

      <section className="featured-strip" aria-label="Featured listings">
        {featured.map((listing) => (
          <Link
            key={listing.id}
            className="featured-card group grid min-h-[142px] overflow-hidden rounded-md border border-[var(--line)] bg-white shadow-sm md:grid-cols-[128px_1fr]"
            href={`/listing/${listing.slug}`}
          >
            <img src={listing.imageUrl} alt={listing.imageAlt} className="h-full min-h-[118px] w-full object-cover" />
            <span className="grid content-between gap-3 p-3">
              <span>
                <span className="badge badge-dero">Featured</span>
                <strong className="mt-2 block leading-snug group-hover:text-[var(--dero-strong)]">{listing.title}</strong>
              </span>
              <span className="font-black">{formatDero(listing.priceAtomic)}</span>
            </span>
          </Link>
        ))}
      </section>

      <div className="commerce-shell">
        <aside className="filter-rail">
          <div className="filter-group">
            <div className="flex items-center justify-between gap-2">
              <span className="filter-title">Filters</span>
              <button className="btn-plain min-h-8 px-2 text-xs" type="button" onClick={clearFilters}>
                Clear
              </button>
            </div>
            <div className="grid gap-1">
              {categories.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={category === entry ? "filter-option filter-option-active" : "filter-option"}
                  onClick={() => setCategory(entry)}
                >
                  <Grid2X2 size={15} />
                  {entry}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-title">Format</span>
            {["all", "physical", "digital", "bundle"].map((entry) => (
              <button
                key={entry}
                type="button"
                className={kind === entry ? "filter-option filter-option-active" : "filter-option"}
                onClick={() => setKind(entry)}
              >
                <SlidersHorizontal size={15} />
                {entry}
              </button>
            ))}
          </div>

          <div className="filter-group">
            <span className="filter-title">Trust</span>
            {trustFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={trustFilter === filter.id ? "filter-option filter-option-active" : "filter-option"}
                onClick={() => setTrustFilter(filter.id)}
              >
                <ShieldCheck size={15} />
                {filter.label}
              </button>
            ))}
          </div>

          <div className="filter-group text-sm text-[var(--muted)]">
            <span className="filter-title">Buyer protection</span>
            <p className="flex items-center gap-2">
              <ShieldCheck size={16} /> Escrow checkout by default
            </p>
            <p className="flex items-center gap-2">
              <Star size={16} /> Rated sellers and store history
            </p>
            <p className="flex items-center gap-2">
              <Truck size={16} /> Delivery evidence before release
            </p>
            <Link href={cartCount > 0 ? "/checkout" : "/orders"} className="btn-secondary mt-1 w-full">
              {cartCount > 0 ? "Review protected checkout" : "View order protection"}
            </Link>
          </div>
        </aside>

        <section className="commerce-results">
          <div className="results-toolbar">
            <div>
              <h1 className="text-2xl font-black">Marketplace</h1>
              <p className="text-sm text-[var(--muted)]">
                {filtered.length} active listings
                {trustFilter !== "all" ? ` - ${trustFilters.find((filter) => filter.id === trustFilter)?.label}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {query ? (
                <button className="badge" type="button" onClick={() => setQuery("")}>
                  <X size={13} />
                  Search: {query}
                </button>
              ) : null}
              {category !== "All" ? (
                <button className="badge" type="button" onClick={() => setCategory("All")}>
                  <X size={13} />
                  {category}
                </button>
              ) : null}
              {kind !== "all" ? (
                <button className="badge" type="button" onClick={() => setKind("all")}>
                  <X size={13} />
                  {kind}
                </button>
              ) : null}
              {trustFilter !== "all" ? (
                <button className="badge" type="button" onClick={() => setTrustFilter("all")}>
                  <X size={13} />
                  {trustFilters.find((filter) => filter.id === trustFilter)?.label}
                </button>
              ) : null}
            </div>
          </div>

          {savedListings.length > 0 ? (
            <section className="panel-flat grid gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-black">Saved listings</h2>
                <button className="btn-secondary" type="button" onClick={() => setTrustFilter("saved")}>
                  <Heart size={16} fill="currentColor" />
                  View saved
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                {savedListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/listing/${listing.slug}`}
                    className="grid gap-2 rounded-md border border-[var(--line)] bg-white p-3 hover:border-[var(--dero)]"
                  >
                    <strong className="line-clamp-1">{listing.title}</strong>
                    <span className="text-sm text-[var(--muted)]">{formatDero(listing.priceAtomic)}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {recentlyViewedListings.length > 0 ? (
            <section className="panel-flat grid gap-3 p-4">
              <h2 className="text-xl font-black">Recently viewed</h2>
              <div className="grid gap-3 md:grid-cols-4">
                {recentlyViewedListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/listing/${listing.slug}`}
                    className="grid gap-2 rounded-md border border-[var(--line)] bg-white p-3 hover:border-[var(--dero)]"
                  >
                    <strong className="line-clamp-1">{listing.title}</strong>
                    <span className="text-sm text-[var(--muted)]">{listing.delivery}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {compareListings.length > 0 ? (
            <section className="panel grid gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-xl font-black">
                  <GitCompare size={20} className="text-[var(--dero)]" />
                  Compare listings
                </h2>
                <span className="badge">{compareListings.length}/3 selected</span>
              </div>
              <div className="overflow-x-auto">
                <table className="commerce-table min-w-[720px] text-sm">
                  <thead>
                    <tr>
                      <th>Listing</th>
                      <th>Price</th>
                      <th>Delivery</th>
                      <th>Seller</th>
                      <th>Stock</th>
                      <th>Rating</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareListings.map((listing) => {
                      const seller = sellers.find((entry) => entry.id === listing.sellerId);
                      return (
                        <tr key={listing.id}>
                          <td className="font-bold">{listing.title}</td>
                          <td>{formatDero(listing.priceAtomic)}</td>
                          <td>{listing.delivery}</td>
                          <td>{seller?.name ?? "Seller"}</td>
                          <td>{listing.stock}</td>
                          <td>{listing.rating.toFixed(2)}</td>
                          <td>
                            <button className="btn-plain" type="button" onClick={() => toggleCompareListing(listing.id)}>
                              <X size={15} />
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <div className="product-grid">
            {filtered.map((listing) => (
              <ProductCard
                key={listing.id}
                listing={listing}
                seller={sellers.find((seller) => seller.id === listing.sellerId)}
              />
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className="panel-flat grid min-h-[220px] place-items-center p-6 text-center">
              <div>
                <Search className="mx-auto text-[var(--dero)]" size={36} />
                <h2 className="mt-3 text-xl font-black">No listings match</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Clear filters or search a broader term.</p>
                <button className="btn-primary mt-4" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
