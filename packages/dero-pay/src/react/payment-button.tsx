/**
 * Drop-in "Pay with DERO" button component.
 *
 * Handles wallet connection and payment initiation.
 */

"use client";

import { useState } from "react";
import { useDeroPayContext } from "./provider.js";

/** Props for the PayWithDero button */
export type PayWithDeroProps = {
  /** Invoice ID to pay */
  invoiceId: string;
  /** Custom button text */
  label?: string;
  /** Loading text */
  loadingLabel?: string;
  /** Additional CSS class names */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Callback when payment transaction is submitted */
  onPaymentSubmitted?: (txid: string) => void;
  /** Render prop for fully custom UI */
  children?: (props: {
    pay: () => Promise<void>;
    isLoading: boolean;
    isPaid: boolean;
    walletConnected: boolean;
    error: string | null;
  }) => React.ReactNode;
};

/**
 * A drop-in button for paying with DERO.
 *
 * Must be used within a `<DeroPayProvider>`.
 *
 * Basic usage:
 * ```tsx
 * <PayWithDero invoiceId="abc-123" />
 * ```
 *
 * Custom UI via render prop:
 * ```tsx
 * <PayWithDero invoiceId="abc-123">
 *   {({ pay, isLoading, isPaid }) =>
 *     isPaid ? <span>Paid!</span> : <button onClick={pay}>Pay Now</button>
 *   }
 * </PayWithDero>
 * ```
 */
export function PayWithDero({
  invoiceId,
  label = "Pay with DERO",
  loadingLabel = "Processing...",
  className,
  style,
  onPaymentSubmitted,
  children,
}: PayWithDeroProps) {
  const {
    walletStatus,
    invoiceStatus,
    isLoading: ctxLoading,
    error,
    connectWallet,
    startPayment,
    payWithWallet,
  } = useDeroPayContext();

  const [isProcessing, setIsProcessing] = useState(false);
  const isLoading = ctxLoading || isProcessing;
  const isPaid = invoiceStatus === "completed";
  const walletConnected = walletStatus === "connected";

  const handlePay = async () => {
    setIsProcessing(true);
    try {
      // Step 1: Connect wallet if needed
      if (walletStatus !== "connected") {
        await connectWallet();
      }

      // Step 2: Start payment session (fetches invoice, starts polling)
      await startPayment(invoiceId);

      // Step 3: Send the payment via XSWD
      const txid = await payWithWallet();
      onPaymentSubmitted?.(txid);
    } catch {
      // Errors are handled by the provider
    } finally {
      setIsProcessing(false);
    }
  };

  // Render prop pattern
  if (children) {
    return (
      <>
        {children({
          pay: handlePay,
          isLoading,
          isPaid,
          walletConnected,
          error,
        })}
      </>
    );
  }

  // Default button
  const getButtonText = () => {
    if (isPaid) return "Paid";
    if (isLoading) return loadingLabel;
    if (invoiceStatus === "confirming") return "Confirming...";
    if (invoiceStatus === "partial") return "Partial — Pay Remaining";
    return label;
  };

  return (
    <button
      onClick={handlePay}
      disabled={isLoading || isPaid}
      className={className}
      style={{
        padding: "12px 24px",
        fontSize: "16px",
        fontWeight: 600,
        border: "none",
        borderRadius: "8px",
        cursor: isLoading || isPaid ? "default" : "pointer",
        backgroundColor: isPaid
          ? "#10b981"
          : invoiceStatus === "confirming"
            ? "#f59e0b"
            : "#3b82f6",
        color: "white",
        opacity: isLoading ? 0.7 : 1,
        transition: "all 0.2s ease",
        ...style,
      }}
    >
      {getButtonText()}
    </button>
  );
}
