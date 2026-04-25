"use client";

import { DeroAuthProvider } from "dero-auth/react";
import { DeroPayProvider } from "dero-pay/react";
import { ReactNode } from "react";
import { CartProvider } from "@/components/cart-context";
import { ToastProvider } from "@/components/toast";
import { ConsoleFilter } from "@/components/console-filter";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DeroAuthProvider
      appName="DeroPay Demo Store"
      appDescription="Sign in to the DeroPay Demo Store with your DERO wallet."
      xswdUrl="ws://127.0.0.1:44326/xswd"
    >
      <DeroPayProvider statusEndpoint="/api/pay/status">
        <CartProvider>
          <ToastProvider>
            <ConsoleFilter />
            {children}
          </ToastProvider>
        </CartProvider>
      </DeroPayProvider>
    </DeroAuthProvider>
  );
}
