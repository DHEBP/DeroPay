/**
 * Escrow-backed invoice display component.
 *
 * Shows the full escrow lifecycle with buyer/seller/arbitrator actions:
 * - Deposit funds into escrow
 * - Confirm delivery (releases to seller)
 * - Raise a dispute
 * - View escrow status and on-chain state
 *
 * Requires the buyer to have a DERO wallet connected via XSWD.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDeroPayContext } from "./provider.js";
import { EscrowClaimStep } from "./escrow-claim-step.js";
import { atomicToDero } from "../core/pricing.js";
import type { Invoice, InvoiceEscrow, EscrowInvoiceStatus } from "../core/types.js";

/**
 * Shared escrow-flow accent. This view and EscrowClaimStep are two halves of the
 * SAME buyer flow (claim → deposit), so they share ONE dark-HUD palette: the
 * handoff from the claim card to this card must not jump themes/colors.
 */
const ACCENT = "#31df90";
const ACCENT_INK = "#04120b";

/** Props for the EscrowInvoiceView component */
export type EscrowInvoiceViewProps = {
  /** Invoice ID to display */
  invoiceId: string;
  /** User's role in this escrow */
  role?: "buyer" | "seller" | "arbitrator" | "viewer";
  /** Server endpoint for invoice status polling */
  statusEndpoint?: string;
  /** Server endpoint for escrow actions (POST) */
  escrowActionEndpoint?: string;
  /** Server endpoint for the Gate-2 buyer claim (POST, default: /api/pay/escrow/claim) */
  claimEndpoint?: string;
  /** Polling interval in ms (default: 5000) */
  pollIntervalMs?: number;
  /** Additional CSS class names */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Callback when escrow is released to seller */
  onReleased?: () => void;
  /** Callback when escrow is refunded to buyer */
  onRefunded?: () => void;
  /** Callback when dispute is raised */
  onDisputed?: () => void;
  /** Callback on error */
  onError?: (error: string) => void;
};

/** Escrow status step for the progress indicator */
type EscrowStep = {
  label: string;
  status: "completed" | "active" | "pending";
};

/**
 * Full escrow-backed invoice display with lifecycle management.
 *
 * Must be used within a `<DeroPayProvider>`.
 *
 * ```tsx
 * <EscrowInvoiceView
 *   invoiceId="abc-123"
 *   role="buyer"
 *   onReleased={() => router.push("/success")}
 * />
 * ```
 */
export function EscrowInvoiceView({
  invoiceId,
  role = "viewer",
  statusEndpoint,
  escrowActionEndpoint,
  claimEndpoint,
  pollIntervalMs = 5000,
  className,
  style,
  onReleased,
  onRefunded,
  onDisputed,
  onError,
}: EscrowInvoiceViewProps) {
  const {
    walletStatus,
    walletAddress,
    connectWallet,
    isLoading: ctxLoading,
  } = useDeroPayContext();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTxid, setLastTxid] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const endpoint = statusEndpoint ?? "/api/pay/status";
  const actionEndpoint = escrowActionEndpoint ?? "/api/pay/escrow";

  // Fetch invoice
  const fetchInvoice = useCallback(async () => {
    try {
      const res = await fetch(`${endpoint}?invoiceId=${encodeURIComponent(invoiceId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Invoice;
      // Deserialize BigInt fields
      data.amount = BigInt(data.amount);
      data.amountReceived = BigInt(data.amountReceived);
      data.paymentId = BigInt(data.paymentId);
      setInvoice(data);
      setIsLoading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch invoice";
      setError(msg);
      setIsLoading(false);
    }
  }, [endpoint, invoiceId]);

  // Start polling
  useEffect(() => {
    fetchInvoice();
    pollRef.current = setInterval(fetchInvoice, pollIntervalMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchInvoice, pollIntervalMs]);

  // Fire callbacks on status changes
  useEffect(() => {
    if (!invoice?.escrow) return;
    const status = invoice.escrow.escrowStatus;
    if (status === "released" || status === "expired_claimed") onReleased?.();
    if (status === "refunded") onRefunded?.();
    if (status === "disputed") onDisputed?.();
  }, [invoice?.escrow?.escrowStatus, onReleased, onRefunded, onDisputed]);

  // Perform an escrow action via the server
  const performAction = useCallback(
    async (action: string) => {
      setActionLoading(action);
      setError(null);
      setLastTxid(null);
      try {
        const res = await fetch(actionEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId, action }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as Record<string, string>).error ?? `HTTP ${res.status}`);
        }
        const result = (await res.json()) as { txid: string };
        setLastTxid(result.txid);
        // Refresh invoice
        await fetchInvoice();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Action failed";
        setError(msg);
        onError?.(msg);
      } finally {
        setActionLoading(null);
      }
    },
    [actionEndpoint, invoiceId, fetchInvoice, onError]
  );

  if (isLoading) {
    return (
      <div className={className} style={{ textAlign: "center", padding: "2rem", ...style }}>
        <p style={{ color: "#8a94a6" }}>Loading escrow invoice...</p>
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div className={className} style={{ textAlign: "center", padding: "2rem", ...style }}>
        <p style={{ color: "#f5a623" }}>{error}</p>
      </div>
    );
  }

  if (!invoice || !invoice.escrow) {
    return (
      <div className={className} style={{ textAlign: "center", padding: "2rem", ...style }}>
        <p style={{ color: "#8a94a6" }}>No escrow data for this invoice.</p>
      </div>
    );
  }

  // Gate 2 — a "quoted" escrow has no deployed contract and no bound buyer yet.
  // The buyer must CLAIM (bind their address + deploy) before any deposit UI is
  // meaningful. Delegate that entire step to EscrowClaimStep; on success it hands
  // back the fresh invoice, which we adopt so this view flips to the deposit-onward
  // lifecycle below without a full reload. Only the buyer drives the claim; other
  // roles just see the monitoring/lifecycle view (which will show "quoted" state).
  if (invoice.escrow.escrowStatus === "quoted" && role === "buyer") {
    return (
      <EscrowClaimStep
        invoice={invoice}
        claimEndpoint={claimEndpoint}
        statusEndpoint={endpoint}
        className={className}
        style={style}
        onClaimed={(updated) => setInvoice(updated)}
        onError={onError}
      />
    );
  }

  const escrow = invoice.escrow;
  const escrowStatus = escrow.escrowStatus;
  const steps = buildSteps(escrowStatus);
  const statusInfo = getEscrowStatusInfo(escrowStatus);
  const isTerminal = [
    "released",
    "refunded",
    "expired_claimed",
    "arbitrated",
    "deploy_failed",
  ].includes(escrowStatus);

  return (
    <div
      className={className}
      style={{
        maxWidth: "480px",
        margin: "0 auto",
        padding: "1.5rem",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(12,16,20,0.9)",
        color: "#e7ebf2",
        fontFamily: "system-ui, -apple-system, sans-serif",
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <div
          style={{
            display: "inline-block",
            padding: "0.25rem 0.75rem",
            borderRadius: "999px",
            background: "rgba(49,223,144,0.12)",
            color: ACCENT,
            fontSize: "0.7rem",
            fontWeight: 600,
            marginBottom: "0.5rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Escrow Payment
        </div>
        <h3 style={{ margin: "0 0 0.25rem", fontSize: "1.125rem", fontWeight: 600 }}>
          {invoice.name}
        </h3>
        {invoice.description && (
          <p style={{ margin: 0, color: "#8a94a6", fontSize: "0.875rem" }}>
            {invoice.description}
          </p>
        )}
      </div>

      {/* Amount */}
      <div
        style={{
          textAlign: "center",
          padding: "1rem",
          background: "rgba(255,255,255,0.03)",
          borderRadius: "12px",
          marginBottom: "1rem",
        }}
      >
        <span style={{ fontSize: "1.75rem", fontWeight: 700 }}>
          {atomicToDero(invoice.amount)}
        </span>
        <span style={{ fontSize: "1rem", color: "#8a94a6", marginLeft: "0.5rem" }}>
          DERO
        </span>
        <div style={{ fontSize: "0.72rem", color: "#8a94a6", marginTop: "0.25rem" }}>
          Fee: {escrow.feeBasisPoints / 100}%
        </div>
      </div>

      {/* Status badge */}
      <div
        style={{
          textAlign: "center",
          padding: "0.5rem 1rem",
          borderRadius: "6px",
          backgroundColor: statusInfo.bgColor,
          color: statusInfo.textColor,
          fontSize: "0.875rem",
          fontWeight: 500,
          marginBottom: "1rem",
        }}
      >
        {statusInfo.icon} {statusInfo.label}
      </div>

      {/* Progress steps */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
          {/* Track line */}
          <div
            style={{
              position: "absolute",
              top: "12px",
              left: "20px",
              right: "20px",
              height: "2px",
              backgroundColor: "rgba(255,255,255,0.1)",
              zIndex: 0,
            }}
          />
          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
                zIndex: 1,
                flex: 1,
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  backgroundColor:
                    step.status === "completed"
                      ? ACCENT
                      : step.status === "active"
                        ? ACCENT
                        : "rgba(255,255,255,0.1)",
                  color:
                    step.status === "pending" ? "#8a94a6" : ACCENT_INK,
                  marginBottom: "0.25rem",
                }}
              >
                {step.status === "completed" ? "\u2713" : i + 1}
              </div>
              <span
                style={{
                  fontSize: "0.65rem",
                  color: step.status === "pending" ? "#8a94a6" : "#c9cfda",
                  textAlign: "center",
                  maxWidth: "70px",
                  lineHeight: 1.2,
                }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Escrow details */}
      <div
        style={{
          padding: "0.75rem",
          background: "rgba(255,255,255,0.03)",
          borderRadius: "10px",
          fontSize: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <DetailRow label="SCID" value={escrow.scid ? truncateScid(escrow.scid) : "— not yet deployed"} mono />
        <DetailRow label="Seller" value={truncateAddress(escrow.sellerAddress)} mono />
        {escrow.buyerAddress && (
          <DetailRow label="Buyer" value={truncateAddress(escrow.buyerAddress)} mono />
        )}
        <DetailRow label="Arbitrator" value={truncateAddress(escrow.arbitratorAddress)} mono />
        <DetailRow label="Expiry" value={`${escrow.blockExpiration} blocks`} />
      </div>

      {/* Error display */}
      {error && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            background: "rgba(245,166,35,0.1)",
            color: "#f5a623",
            border: "1px solid rgba(245,166,35,0.25)",
            borderRadius: "8px",
            fontSize: "0.8rem",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {/* TX confirmation */}
      {lastTxid && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            background: "rgba(49,223,144,0.08)",
            color: ACCENT,
            border: "1px solid rgba(49,223,144,0.2)",
            borderRadius: "8px",
            fontSize: "0.75rem",
            marginBottom: "1rem",
            wordBreak: "break-all",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          TX: {lastTxid}
        </div>
      )}

      {/* Actions — conditional on role and status */}
      {!isTerminal && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {/* Buyer: Deposit */}
          {role === "buyer" && escrowStatus === "awaiting_deposit" && (
            <ActionButton
              label="Deposit into Escrow"
              color={ACCENT}
              loading={actionLoading === "deposit"}
              disabled={!!actionLoading}
              onClick={() => performAction("deposit")}
            />
          )}

          {/* Buyer: Confirm Delivery */}
          {role === "buyer" && escrowStatus === "funded" && (
            <>
              <ActionButton
                label="Confirm Delivery"
                color={ACCENT}
                loading={actionLoading === "confirmDelivery"}
                disabled={!!actionLoading}
                onClick={() => performAction("confirmDelivery")}
              />
              <ActionButton
                label="Raise Dispute"
                color="#f59e0b"
                loading={actionLoading === "dispute"}
                disabled={!!actionLoading}
                onClick={() => performAction("dispute")}
              />
            </>
          )}

          {/* Seller: Refund */}
          {role === "seller" && escrowStatus === "funded" && (
            <>
              <ActionButton
                label="Refund Buyer"
                color="#6b7280"
                loading={actionLoading === "refundBuyer"}
                disabled={!!actionLoading}
                onClick={() => performAction("refundBuyer")}
              />
              <ActionButton
                label="Claim After Expiry"
                color="#f59e0b"
                loading={actionLoading === "claimAfterExpiry"}
                disabled={!!actionLoading}
                onClick={() => performAction("claimAfterExpiry")}
              />
            </>
          )}

          {/* Arbitrator: Resolve */}
          {role === "arbitrator" && escrowStatus === "disputed" && (
            <>
              <ActionButton
                label="Release to Seller"
                color={ACCENT}
                loading={actionLoading === "arbitrateRelease"}
                disabled={!!actionLoading}
                onClick={() => performAction("arbitrateRelease")}
              />
              <ActionButton
                label="Refund to Buyer"
                color="#ef4444"
                loading={actionLoading === "arbitrateRefund"}
                disabled={!!actionLoading}
                onClick={() => performAction("arbitrateRefund")}
              />
            </>
          )}

          {/* Viewer — no actions */}
          {role === "viewer" && (
            <p
              style={{
                textAlign: "center",
                color: "#8a94a6",
                fontSize: "0.8rem",
                margin: 0,
              }}
            >
              Monitoring escrow status...
            </p>
          )}
        </div>
      )}

      {/* Terminal state message */}
      {isTerminal && (
        <div style={{ textAlign: "center", padding: "0.5rem" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
            {escrowStatus === "released" || escrowStatus === "expired_claimed"
              ? "\u2713"
              : escrowStatus === "refunded"
                ? "\u21A9"
                : escrowStatus === "arbitrated"
                  ? "\u2696"
                  : "\u2717"}
          </div>
          <p
            style={{
              color: statusInfo.textColor,
              fontWeight: 600,
              fontSize: "0.875rem",
              margin: 0,
            }}
          >
            {statusInfo.label}
          </p>
          {escrow.resolution && (
            <p style={{ color: "#8a94a6", fontSize: "0.75rem", marginTop: "0.25rem" }}>
              Resolution: {formatResolution(escrow.resolution)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionButton({
  label,
  color,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  // On the shared accent, use dark ink for contrast (matches EscrowClaimStep's
  // primary button); other semantic colors keep white text.
  const textColor = color === ACCENT ? ACCENT_INK : "#ffffff";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "0.7rem 1rem",
        fontSize: "0.875rem",
        fontWeight: 600,
        border: "none",
        borderRadius: "10px",
        cursor: disabled ? "default" : "pointer",
        backgroundColor: color,
        color: textColor,
        opacity: disabled ? 0.6 : 1,
        transition: "opacity 0.2s",
        width: "100%",
      }}
    >
      {loading ? "Processing..." : label}
    </button>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.25rem 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span style={{ color: "#8a94a6" }}>{label}</span>
      <span
        style={{
          color: "#e7ebf2",
          fontWeight: 500,
          fontFamily: mono ? "ui-monospace, monospace" : "inherit",
          fontSize: mono ? "0.7rem" : "0.75rem",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSteps(status: EscrowInvoiceStatus): EscrowStep[] {
  const steps: EscrowStep[] = [
    { label: "Deployed", status: "pending" },
    { label: "Funded", status: "pending" },
    { label: "Resolved", status: "pending" },
  ];

  if (status === "deploying") {
    steps[0].status = "active";
  } else if (status === "awaiting_deposit") {
    steps[0].status = "completed";
    steps[1].status = "active";
  } else if (status === "funded") {
    steps[0].status = "completed";
    steps[1].status = "completed";
    steps[2].status = "active";
  } else if (status === "disputed") {
    steps[0].status = "completed";
    steps[1].status = "completed";
    steps[2].status = "active";
  } else if (
    status === "released" ||
    status === "refunded" ||
    status === "expired_claimed" ||
    status === "arbitrated"
  ) {
    steps[0].status = "completed";
    steps[1].status = "completed";
    steps[2].status = "completed";
  }

  return steps;
}

function getEscrowStatusInfo(status: EscrowInvoiceStatus): {
  label: string;
  icon: string;
  bgColor: string;
  textColor: string;
} {
  // Dark-HUD tints (translucent on the rgba(12,16,20,0.9) card) so the status
  // badge shares the palette with EscrowClaimStep. Red is reserved for TRUE
  // alarms (dispute/deploy-failed); normal progress is accent/cyan, caution amber.
  switch (status) {
    case "deploying":
      return {
        label: "Deploying Contract...",
        icon: "\u23F3",
        bgColor: "rgba(255,255,255,0.06)",
        textColor: "#8a94a6",
      };
    case "awaiting_deposit":
      return {
        label: "Awaiting Deposit",
        icon: "\u23F3",
        bgColor: "rgba(49,223,144,0.1)",
        textColor: ACCENT,
      };
    case "funded":
      return {
        label: "Funds in Escrow",
        icon: "\uD83D\uDD12",
        bgColor: "rgba(49,223,144,0.12)",
        textColor: ACCENT,
      };
    case "released":
      return {
        label: "Released to Seller",
        icon: "\u2713",
        bgColor: "rgba(49,223,144,0.12)",
        textColor: ACCENT,
      };
    case "refunded":
      return {
        label: "Refunded to Buyer",
        icon: "\u21A9",
        bgColor: "rgba(96,165,250,0.12)",
        textColor: "#93c5fd",
      };
    case "expired_claimed":
      return {
        label: "Claimed After Expiry",
        icon: "\u23F0",
        bgColor: "rgba(245,166,35,0.12)",
        textColor: "#f5a623",
      };
    case "disputed":
      return {
        label: "Dispute Raised",
        icon: "\u26A0",
        bgColor: "rgba(239,68,68,0.12)",
        textColor: "#ef4444",
      };
    case "arbitrated":
      return {
        label: "Resolved by Arbitrator",
        icon: "\u2696",
        bgColor: "rgba(167,139,250,0.14)",
        textColor: "#c4b5fd",
      };
    case "deploy_failed":
      return {
        label: "Deployment Failed",
        icon: "\u2717",
        bgColor: "rgba(239,68,68,0.12)",
        textColor: "#ef4444",
      };
    default:
      return {
        label: "Unknown",
        icon: "?",
        bgColor: "rgba(255,255,255,0.06)",
        textColor: "#8a94a6",
      };
  }
}

function truncateScid(scid: string): string {
  if (scid.length <= 16) return scid;
  return `${scid.slice(0, 8)}...${scid.slice(-8)}`;
}

function truncateAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

function formatResolution(resolution: string): string {
  return resolution
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
