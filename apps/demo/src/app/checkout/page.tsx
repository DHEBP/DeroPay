"use client";

import { Header } from "@/components/header";
import { useCart } from "@/components/cart-context";
import { useToast } from "@/components/toast";
import { formatDero } from "dero-pay";
import { InvoiceView, EscrowInvoiceView } from "dero-pay/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDeroPayContext } from "dero-pay/react";
import { Loader2, FlaskConical, ShoppingBag } from "lucide-react";

export default function CheckoutPage() {
  const { items, totalPrice, clearCart } = useCart();
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [useEscrow, setUseEscrow] = useState(false);
  const router = useRouter();
  const { currentInvoice } = useDeroPayContext();
  const { success, error, info } = useToast();

  if (items.length === 0 && !invoiceId) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <Header />
        <main className="flex-1 max-w-4xl w-full mx-auto p-6 flex items-center justify-center">
          <div className="text-center">
            <ShoppingBag className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Your cart is empty</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Add some items before checking out.</p>
            <button
              onClick={() => router.push("/")}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-95 text-white font-medium rounded-lg transition-all"
            >
              Go back to store
            </button>
          </div>
        </main>
      </div>
    );
  }

  const handleCreateInvoice = async () => {
    setIsCreating(true);
    try {
      const response = await fetch("/api/pay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Demo Store Order",
          description: `Order containing ${items.length} item${items.length !== 1 ? "s" : ""}`,
          amount: totalPrice.toString(),
          ...(useEscrow ? {
            escrow: {
              sellerAddress: "dero1qyr8yjnu6cl2c5yqkls0hmxe6rry77kn24nmc5fje6hm9jltyvdd5qq4hn5pn",
              arbitratorAddress: "dero1qyr8yjnu6cl2c5yqkls0hmxe6rry77kn24nmc5fje6hm9jltyvdd5qq4hn5pn",
              feeBasisPoints: 250,
              blockExpiration: 1000
            }
          } : {})
        }),
      });

      const data = await response.json();
      if (data.id) {
        setInvoiceId(data.id);
        clearCart();
        info("Invoice created", "Awaiting your DERO payment.");
      } else {
        error("Invoice failed", data.error || "Could not create invoice.");
      }
    } catch (err) {
      error("Network error", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsCreating(false);
    }
  };

  const simulatePayment = async () => {
    if (!currentInvoice) {
      info("Not ready", "Invoice is still loading — try again in a moment.");
      return;
    }
    setIsSimulating(true);
    try {
      const res = await fetch(
        `http://localhost:30103/mock-payment?payment_id=${currentInvoice.paymentId}&amount=${currentInvoice.amount}`
      );
      if (res.ok) {
        success("Mock payment sent!", "The invoice will update within a few seconds.");
      } else {
        error("Mock payment failed", `Server responded: ${res.status}`);
      }
    } catch (err) {
      error("Cannot reach mock wallet", "Is the mock RPC server running on port 30103?");
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Checkout</h1>

        {!invoiceId ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Order Summary */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-bold mb-4">Order Summary</h2>
              <div className="space-y-3 mb-6">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">
                      {item.quantity}× {item.name}
                    </span>
                    <span className="font-medium">
                      {formatDero(item.price * BigInt(item.quantity))} DERO
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4 flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatDero(totalPrice)} DERO</span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-100 dark:border-gray-800 h-fit">
              <h2 className="text-xl font-bold mb-4">Payment Method</h2>

              <label className="flex items-start gap-3 p-4 border border-emerald-500 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 mb-4 cursor-pointer">
                <input type="radio" checked readOnly className="mt-1 text-emerald-600 focus:ring-emerald-500" />
                <div>
                  <div className="font-semibold text-emerald-900 dark:text-emerald-100">Pay with DERO</div>
                  <div className="text-sm text-emerald-700 dark:text-emerald-300">Private, instant, secure.</div>
                </div>
              </label>

              <label className="flex items-center gap-3 mb-6 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useEscrow}
                  onChange={(e) => setUseEscrow(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium">Use DeroPay Escrow Smart Contract</span>
              </label>

              <button
                onClick={handleCreateInvoice}
                disabled={isCreating}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98] text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Invoice...
                  </>
                ) : (
                  "Generate Invoice"
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
              {useEscrow ? (
                <EscrowInvoiceView invoiceId={invoiceId} role="buyer" />
              ) : (
                <InvoiceView invoiceId={invoiceId} />
              )}

              {currentInvoice && currentInvoice.status !== "completed" && (
                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 flex items-center justify-center gap-1.5">
                    <FlaskConical className="w-3.5 h-3.5" />
                    Testing the demo?
                  </p>
                  <button
                    onClick={simulatePayment}
                    disabled={isSimulating}
                    className="inline-flex items-center gap-2 px-5 py-2 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-500/70 active:bg-emerald-100 dark:active:bg-emerald-950/60 active:scale-95 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    {isSimulating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Simulate Payment"
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
