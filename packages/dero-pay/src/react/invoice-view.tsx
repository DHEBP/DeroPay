/**
 * Invoice display component with address, QR code, countdown timer,
 * and real-time payment status.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useDeroPayContext } from "./provider.js";
import { atomicToDero } from "../core/pricing.js";

/** Props for the InvoiceView component */
export type InvoiceViewProps = {
  /** Invoice ID to display */
  invoiceId: string;
  /** Whether to show the QR code (default: true) */
  showQr?: boolean;
  /** Whether to show the countdown timer (default: true) */
  showTimer?: boolean;
  /** Whether to show the payment address (default: true) */
  showAddress?: boolean;
  /** QR code size in pixels (default: 200) */
  qrSize?: number;
  /** Additional CSS class names for the container */
  className?: string;
  /** Custom styles for the container */
  style?: React.CSSProperties;
  /** Callback when invoice is completed */
  onCompleted?: () => void;
  /** Callback when invoice expires */
  onExpired?: () => void;
};

/**
 * A full invoice display component for payment pages.
 *
 * Shows:
 * - Invoice name and amount
 * - QR code with the integrated address
 * - Copyable payment address
 * - Countdown timer
 * - Real-time payment status
 *
 * Must be used within a `<DeroPayProvider>`.
 *
 * ```tsx
 * <InvoiceView
 *   invoiceId="abc-123"
 *   onCompleted={() => router.push("/success")}
 * />
 * ```
 */
export function InvoiceView({
  invoiceId,
  showQr = true,
  showTimer = true,
  showAddress = true,
  qrSize = 200,
  className,
  style,
  onCompleted,
  onExpired,
}: InvoiceViewProps) {
  const {
    currentInvoice,
    invoiceStatus,
    isLoading,
    error,
    startPayment,
  } = useDeroPayContext();

  const [timeLeft, setTimeLeft] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Start the payment session on mount
  useEffect(() => {
    startPayment(invoiceId);
  }, [invoiceId, startPayment]);

  // Countdown timer
  useEffect(() => {
    if (!currentInvoice) return;

    const updateTimer = () => {
      const expiresAt = new Date(currentInvoice.expiresAt).getTime();
      const now = Date.now();
      const diff = expiresAt - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentInvoice]);

  // Completion/expiry callbacks
  useEffect(() => {
    if (invoiceStatus === "completed") onCompleted?.();
    if (invoiceStatus === "expired") onExpired?.();
  }, [invoiceStatus, onCompleted, onExpired]);

  const copyAddress = useCallback(async () => {
    if (!currentInvoice) return;
    try {
      await navigator.clipboard.writeText(currentInvoice.integratedAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }, [currentInvoice]);

  // QR code URL using a public API (no dependencies needed)
  const qrCodeUrl = currentInvoice
    ? `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(currentInvoice.integratedAddress)}`
    : null;

  if (isLoading && !currentInvoice) {
    return (
      <div className={className} style={{ textAlign: "center", padding: "2rem", ...style }}>
        <p style={{ color: "#6b7280" }}>Loading invoice...</p>
      </div>
    );
  }

  if (error && !currentInvoice) {
    return (
      <div className={className} style={{ textAlign: "center", padding: "2rem", ...style }}>
        <p style={{ color: "#ef4444" }}>{error}</p>
      </div>
    );
  }

  if (!currentInvoice) return null;

  const statusConfig = getStatusConfig(invoiceStatus);

  return (
    <div
      className={className}
      style={{
        maxWidth: "400px",
        margin: "0 auto",
        padding: "1.5rem",
        borderRadius: "12px",
        border: "1px solid #e5e7eb",
        backgroundColor: "#ffffff",
        color: "#111827",
        fontFamily: "system-ui, -apple-system, sans-serif",
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: "0 0 0.25rem", fontSize: "1.125rem", fontWeight: 600 }}>
          {currentInvoice.name}
        </h3>
        {currentInvoice.description && (
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
            {currentInvoice.description}
          </p>
        )}
      </div>

      {/* Amount */}
      <div
        style={{
          textAlign: "center",
          padding: "1rem",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          marginBottom: "1rem",
        }}
      >
        <span style={{ fontSize: "1.75rem", fontWeight: 700 }}>
          {atomicToDero(currentInvoice.amount)}
        </span>
        <span style={{ fontSize: "1rem", color: "#6b7280", marginLeft: "0.5rem" }}>
          DERO
        </span>
      </div>

      {/* Status indicator */}
      <div
        style={{
          textAlign: "center",
          padding: "0.5rem",
          borderRadius: "6px",
          backgroundColor: statusConfig.bgColor,
          color: statusConfig.textColor,
          fontSize: "0.875rem",
          fontWeight: 500,
          marginBottom: "1rem",
        }}
      >
        {statusConfig.label}
      </div>

      {/* QR Code */}
      {showQr && qrCodeUrl && invoiceStatus !== "completed" && invoiceStatus !== "expired" && (
        <div style={{ textAlign: "center", marginBottom: "1rem" }}>
          <img
            src={qrCodeUrl}
            alt="Payment QR Code"
            width={qrSize}
            height={qrSize}
            style={{ borderRadius: "8px" }}
          />
        </div>
      )}

      {/* Payment address */}
      {showAddress && invoiceStatus !== "completed" && invoiceStatus !== "expired" && (
        <div style={{ marginBottom: "1rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "#6b7280",
              marginBottom: "0.25rem",
            }}
          >
            Send DERO to:
          </label>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <code
              style={{
                flex: 1,
                padding: "0.5rem",
                backgroundColor: "#f3f4f6",
                color: "#111827",
                borderRadius: "6px",
                fontSize: "0.7rem",
                wordBreak: "break-all",
                lineHeight: 1.4,
              }}
            >
              {currentInvoice.integratedAddress}
            </code>
            <button
              onClick={copyAddress}
              style={{
                padding: "0.5rem 0.75rem",
                fontSize: "0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                backgroundColor: copied ? "#10b981" : "#ffffff",
                color: copied ? "#ffffff" : "#374151",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.2s",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Partial payment info */}
      {invoiceStatus === "partial" && (
        <div
          style={{
            padding: "0.5rem",
            backgroundColor: "#fffbeb",
            borderRadius: "6px",
            fontSize: "0.8rem",
            textAlign: "center",
            marginBottom: "1rem",
          }}
        >
          Received: {atomicToDero(currentInvoice.amountReceived)} /{" "}
          {atomicToDero(currentInvoice.amount)} DERO
        </div>
      )}

      {/* Timer */}
      {showTimer && invoiceStatus !== "completed" && invoiceStatus !== "expired" && (
        <div style={{ textAlign: "center", color: "#6b7280", fontSize: "0.8rem" }}>
          Expires in: <strong>{timeLeft}</strong>
        </div>
      )}

      {/* Completed message */}
      {invoiceStatus === "completed" && (
        <div style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>&#10003;</div>
          <p style={{ color: "#059669", fontWeight: 600 }}>Payment Complete</p>
        </div>
      )}
    </div>
  );
}

function getStatusConfig(status: string | null): {
  label: string;
  bgColor: string;
  textColor: string;
} {
  switch (status) {
    case "pending":
      return { label: "Awaiting Payment", bgColor: "#eff6ff", textColor: "#2563eb" };
    case "confirming":
      return { label: "Payment Confirming...", bgColor: "#fffbeb", textColor: "#d97706" };
    case "partial":
      return { label: "Partial Payment Received", bgColor: "#fffbeb", textColor: "#d97706" };
    case "completed":
      return { label: "Payment Complete", bgColor: "#ecfdf5", textColor: "#059669" };
    case "expired":
      return { label: "Invoice Expired", bgColor: "#fef2f2", textColor: "#dc2626" };
    default:
      return { label: "Loading...", bgColor: "#f3f4f6", textColor: "#6b7280" };
  }
}
