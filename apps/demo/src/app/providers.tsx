"use client";

import { DeroAuthProvider } from "dero-auth/react";
import { DeroPayProvider } from "dero-pay/react";
import { ReactNode, useMemo } from "react";
import { CartProvider } from "@/components/cart-context";
import { ToastProvider } from "@/components/toast";
import { ConsoleFilter } from "@/components/console-filter";

export function Providers({ children }: { children: ReactNode }) {
  const experimentalWasmEnabled =
    process.env.NEXT_PUBLIC_DEROPAY_EXPERIMENTAL_WASM === "true";

  const connectorConfig = useMemo(() => {
    const requestedWallet =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("wallet")
        : null;
    const preferWasm = experimentalWasmEnabled && requestedWallet === "wasm";

    return {
      experimentalWasmEnabled,
      preferWasm,
      preferredWalletConnectors: preferWasm
        ? (["wasm-webwallet"] as const)
        : (["xswd"] as const),
    };
  }, [experimentalWasmEnabled]);

  return (
    <DeroAuthProvider
      appName="DeroPay Demo Store"
      appDescription="Sign in to the DeroPay Demo Store with your DERO wallet."
      xswdUrl="ws://127.0.0.1:44326/xswd"
    >
      <DeroPayProvider
        statusEndpoint="/api/pay/status"
        preferredWalletConnectors={[...connectorConfig.preferredWalletConnectors]}
        walletPolicy={{
          allowWasmConnector: connectorConfig.experimentalWasmEnabled,
          // WASM connector remains experimental/read-sign only in demo mode.
          allowSpendOperations: !connectorConfig.preferWasm,
          requireExplicitUserConfirm: true,
        }}
      >
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
