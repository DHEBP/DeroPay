"use client";

import { useDeroAuthContext } from "dero-auth/react";
import { ShoppingCart, Store, Wallet, LogOut, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCart } from "./cart-context";
import { useToast } from "./toast";
import { useEffect, useRef } from "react";

export function Header() {
  const { signIn, signOut, isLoading, isAuthenticated, address, error } = useDeroAuthContext();
  const { totalItems } = useCart();
  const { error: toastError, info } = useToast();
  const prevError = useRef(error);

  // Show toast when sign-in fails instead of letting console.error bubble up
  useEffect(() => {
    if (error && error !== prevError.current) {
      if (error.code === "WALLET_NOT_FOUND") {
        toastError("Wallet not found", "Open your DERO wallet (Engram or CLI) and enable XSWD, then try again.");
      } else if (error.code === "CONNECTION_REJECTED") {
        toastError("Connection rejected", "The wallet refused the connection request.");
      } else {
        toastError("Sign-in failed", error.message);
      }
    }
    prevError.current = error;
  }, [error, toastError]);

  const handleSignIn = async () => {
    if (isAuthenticated) {
      signOut();
      info("Signed out", "Your DERO session has ended.");
    } else {
      await signIn();
    }
  };

  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-emerald-600 dark:text-emerald-500 hover:opacity-80 transition-opacity">
            <Store className="w-6 h-6" />
            <span>DeroPay Demo</span>
          </Link>
          <nav className="hidden md:flex gap-6 text-sm font-medium text-gray-600 dark:text-gray-300">
            <Link href="/" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Products</Link>
            <Link href="/cart" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Cart</Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/cart" className="relative p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <ShoppingCart className="w-5 h-5" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-gray-950">
                {totalItems}
              </span>
            )}
          </Link>
          
          <div className="h-8 w-px bg-gray-200 dark:bg-gray-800 mx-2" />

          <button
            onClick={handleSignIn}
            disabled={isLoading}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 disabled:opacity-60 disabled:cursor-wait disabled:active:scale-100 ${
              isAuthenticated
                ? "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white"
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white"
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : isAuthenticated ? (
              <>
                <LogOut className="w-4 h-4" />
                {address ? `${address.slice(0, 8)}…` : "Sign Out"}
              </>
            ) : (
              <>
                <Wallet className="w-4 h-4" />
                Sign In with DERO
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
