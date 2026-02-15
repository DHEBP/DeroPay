/**
 * Minimal payment status indicator component.
 *
 * A smaller alternative to InvoiceView — just shows the current
 * status with a colored indicator dot.
 */

"use client";

import { useEffect } from "react";
import { useDeroPayContext } from "./provider.js";
import { atomicToDero } from "../core/pricing.js";

/** Props for the PaymentStatus component */
export type PaymentStatusProps = {
  /** Invoice ID to monitor */
  invoiceId: string;
  /** Whether to show the amount (default: true) */
  showAmount?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
};

/**
 * A compact payment status indicator.
 *
 * Must be used within a `<DeroPayProvider>`.
 *
 * ```tsx
 * <PaymentStatus invoiceId="abc-123" />
 * ```
 */
export function PaymentStatus({
  invoiceId,
  showAmount = true,
  className,
  style,
}: PaymentStatusProps) {
  const { currentInvoice, invoiceStatus, startPayment } = useDeroPayContext();

  useEffect(() => {
    startPayment(invoiceId);
  }, [invoiceId, startPayment]);

  if (!currentInvoice) {
    return (
      <div className={className} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", ...style }}>
        <StatusDot color="#d1d5db" />
        <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>Loading...</span>
      </div>
    );
  }

  const config = getStatusDisplay(invoiceStatus);

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.375rem 0.75rem",
        borderRadius: "999px",
        backgroundColor: config.bgColor,
        fontSize: "0.875rem",
        fontWeight: 500,
        color: config.textColor,
        ...style,
      }}
    >
      <StatusDot color={config.dotColor} pulse={config.pulse} />
      <span>{config.label}</span>
      {showAmount && invoiceStatus === "partial" && (
        <span style={{ opacity: 0.8, fontSize: "0.75rem" }}>
          ({atomicToDero(currentInvoice.amountReceived)}/{atomicToDero(currentInvoice.amount)})
        </span>
      )}
    </div>
  );
}

function StatusDot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        backgroundColor: color,
        animation: pulse ? "deropay-pulse 1.5s ease-in-out infinite" : undefined,
      }}
    />
  );
}

function getStatusDisplay(status: string | null): {
  label: string;
  dotColor: string;
  bgColor: string;
  textColor: string;
  pulse: boolean;
} {
  switch (status) {
    case "pending":
      return {
        label: "Awaiting Payment",
        dotColor: "#3b82f6",
        bgColor: "#eff6ff",
        textColor: "#1d4ed8",
        pulse: true,
      };
    case "confirming":
      return {
        label: "Confirming",
        dotColor: "#f59e0b",
        bgColor: "#fffbeb",
        textColor: "#b45309",
        pulse: true,
      };
    case "partial":
      return {
        label: "Partial",
        dotColor: "#f59e0b",
        bgColor: "#fffbeb",
        textColor: "#b45309",
        pulse: true,
      };
    case "completed":
      return {
        label: "Paid",
        dotColor: "#10b981",
        bgColor: "#ecfdf5",
        textColor: "#047857",
        pulse: false,
      };
    case "expired":
      return {
        label: "Expired",
        dotColor: "#ef4444",
        bgColor: "#fef2f2",
        textColor: "#b91c1c",
        pulse: false,
      };
    default:
      return {
        label: "Loading",
        dotColor: "#d1d5db",
        bgColor: "#f9fafb",
        textColor: "#6b7280",
        pulse: false,
      };
  }
}
