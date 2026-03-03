"use client";

import { Header } from "@/components/header";
import { useCart } from "@/components/cart-context";
import { formatDero } from "dero-pay";
import Link from "next/link";
import { Trash2 } from "lucide-react";

export default function CartPage() {
  const { items, removeItem, totalPrice } = useCart();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Your Cart</h1>

        {items.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
            <p className="text-gray-500 dark:text-gray-400 mb-4">Your cart is empty.</p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-95 text-white font-medium rounded-lg transition-all"
            >
              Continue Shopping
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div>
                    <h3 className="font-semibold">{item.name}</h3>
                    <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium">{formatDero(item.price * BigInt(item.quantity))}</span>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 active:bg-red-100 dark:active:bg-red-950/50 active:scale-90 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-100 dark:border-gray-800 h-fit">
              <h2 className="text-xl font-bold mb-4">Order Summary</h2>
              <div className="flex justify-between mb-4 text-lg">
                <span className="text-gray-600 dark:text-gray-400">Total</span>
                <span className="font-bold">{formatDero(totalPrice)}</span>
              </div>
              <Link
                href="/checkout"
                className="block w-full text-center px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98] text-white font-medium rounded-lg transition-all"
              >
                Proceed to Checkout
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
