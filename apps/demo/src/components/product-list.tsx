"use client";

import { formatDero } from "dero-pay";
import { useCart } from "./cart-context";
import { useToast } from "./toast";
import { useState } from "react";
import { Check } from "lucide-react";

const PRODUCTS = [
  {
    id: "1",
    name: "Dero Hoodie",
    description: "Premium cotton hoodie with Dero logo.",
    price: 150_000n, // 1.5 DERO
    image: "https://placehold.co/400x400/10b981/ffffff?text=Hoodie",
    category: "Apparel"
  },
  {
    id: "2",
    name: "Privacy Sticker Pack",
    description: "Show your support for encrypted blockchains.",
    price: 25_000n, // 0.25 DERO
    image: "https://placehold.co/400x400/10b981/ffffff?text=Stickers",
    category: "Goods"
  },
  {
    id: "3",
    name: "Hardware Wallet",
    description: "Secure offline storage for your DERO.",
    price: 500_000n, // 5.0 DERO
    image: "https://placehold.co/400x400/10b981/ffffff?text=Wallet",
    category: "Hardware"
  },
  {
    id: "4",
    name: "Coffee Mug",
    description: "Start your day with privacy in mind.",
    price: 80_000n, // 0.8 DERO
    image: "https://placehold.co/400x400/10b981/ffffff?text=Mug",
    category: "Goods"
  },
  {
    id: "5",
    name: "VPN Subscription (1 Yr)",
    description: "Anonymous VPN access paid in DERO.",
    price: 300_000n, // 3.0 DERO
    image: "https://placehold.co/400x400/10b981/ffffff?text=VPN",
    category: "Digital"
  },
  {
    id: "6",
    name: "Consulting Hour",
    description: "1 hour of privacy tech consulting.",
    price: 1_000_000n, // 10.0 DERO
    image: "https://placehold.co/400x400/10b981/ffffff?text=Consulting",
    category: "Services"
  }
];

export function ProductList() {
  const { addItem } = useCart();
  const { success } = useToast();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleAdd = (product: typeof PRODUCTS[number]) => {
    addItem(product);
    success(`${product.name} added`, "Item is in your cart.");
    setAddedIds((prev) => new Set(prev).add(product.id));
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }, 1800);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {PRODUCTS.map((product) => {
        const added = addedIds.has(product.id);
        return (
          <div
            key={product.id}
            className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-48 object-cover bg-gray-100"
            />
            <div className="p-5">
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-500 mb-1">
                {product.category}
              </div>
              <h3 className="text-lg font-semibold mb-1">{product.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">
                {product.description}
              </p>
              <div className="flex items-center justify-between">
                <span className="font-bold text-lg">
                  {formatDero(product.price)}
                </span>
                <button
                  onClick={() => handleAdd(product)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all active:scale-95 ${
                    added
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 active:bg-gray-800 dark:active:bg-gray-200"
                  }`}
                >
                  {added ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Added
                    </>
                  ) : (
                    "Add to Cart"
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
