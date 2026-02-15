"use client";

import { useState } from "react";

type SerializedEscrowInvoice = {
  id: string;
  name: string;
  description: string;
  amount: string;
  status: string;
  createdAt: string;
  escrow: {
    scid: string;
    deployTxid: string;
    escrowStatus: string;
    sellerAddress: string;
    arbitratorAddress: string;
    feeBasisPoints: number;
    blockExpiration: number;
    buyerAddress: string | null;
    depositHeight: number | null;
    disputedAt: string | null;
    resolution: string | null;
  } | null;
};

type EscrowTableProps = {
  invoices: SerializedEscrowInvoice[];
  onAction?: (invoiceId: string, action: string) => void;
  actionLoading?: string | null;
};

function formatAmount(atomic: string): string {
  const value = BigInt(atomic);
  const whole = value / 1_000_000_000_000n;
  const frac = value % 1_000_000_000_000n;
  const fracStr = frac.toString().padStart(12, "0").slice(0, 5);
  return `${whole}.${fracStr}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(str: string, len: number = 12): string {
  if (str.length <= len) return str;
  return `${str.slice(0, 6)}...${str.slice(-4)}`;
}

function getEscrowStatusBadge(status: string): string {
  switch (status) {
    case "deploying":
      return "badge-pending";
    case "awaiting_deposit":
      return "badge-pending";
    case "funded":
      return "badge-confirming";
    case "released":
    case "expired_claimed":
    case "arbitrated":
      return "badge-completed";
    case "refunded":
      return "badge-expired";
    case "disputed":
      return "badge-partial";
    case "deploy_failed":
      return "badge-expired";
    default:
      return "";
  }
}

function formatEscrowStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EscrowTable({ invoices, onAction, actionLoading }: EscrowTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (invoices.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "3rem 1rem",
          color: "var(--text-muted)",
        }}
      >
        <p>No escrow invoices yet</p>
        <p style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
          Create an escrow-backed invoice to start using smart contract payments.
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Amount</th>
            <th>Escrow Status</th>
            <th>SCID</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const escrow = inv.escrow;
            const isExpanded = expandedId === inv.id;
            const escrowStatus = escrow?.escrowStatus ?? "unknown";
            const isTerminal = [
              "released",
              "refunded",
              "expired_claimed",
              "arbitrated",
              "deploy_failed",
            ].includes(escrowStatus);

            return (
              <>
                <tr
                  key={inv.id}
                  onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <code className="mono">{truncate(inv.id)}</code>
                  </td>
                  <td>{inv.name}</td>
                  <td className="mono">{formatAmount(inv.amount)} DERO</td>
                  <td>
                    <span className={`badge ${getEscrowStatusBadge(escrowStatus)}`}>
                      <span
                        style={{
                          display: "inline-block",
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: "currentColor",
                        }}
                        className={
                          !isTerminal && escrowStatus !== "deploy_failed"
                            ? "pulse"
                            : ""
                        }
                      />
                      {formatEscrowStatus(escrowStatus)}
                    </span>
                  </td>
                  <td>
                    <code className="mono">
                      {escrow?.scid ? truncate(escrow.scid) : "—"}
                    </code>
                  </td>
                  <td style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {formatDate(inv.createdAt)}
                  </td>
                  <td>
                    {!isTerminal && escrow && (
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        {escrowStatus === "funded" && (
                          <>
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                              disabled={!!actionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                onAction?.(inv.id, "refundBuyer");
                              }}
                            >
                              {actionLoading === `${inv.id}-refundBuyer`
                                ? "..."
                                : "Refund"}
                            </button>
                          </>
                        )}
                        {escrowStatus === "disputed" && (
                          <>
                            <button
                              className="btn btn-primary"
                              style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                              disabled={!!actionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                onAction?.(inv.id, "arbitrateRelease");
                              }}
                            >
                              {actionLoading === `${inv.id}-arbitrateRelease`
                                ? "..."
                                : "Release"}
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                              disabled={!!actionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                onAction?.(inv.id, "arbitrateRefund");
                              }}
                            >
                              {actionLoading === `${inv.id}-arbitrateRefund`
                                ? "..."
                                : "Refund"}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {isTerminal && escrow?.resolution && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {formatEscrowStatus(escrow.resolution)}
                      </span>
                    )}
                  </td>
                </tr>
                {/* Expanded details row */}
                {isExpanded && escrow && (
                  <tr key={`${inv.id}-details`}>
                    <td
                      colSpan={7}
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        padding: "1rem",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "0.75rem",
                          fontSize: "0.8rem",
                        }}
                      >
                        <div>
                          <strong style={{ color: "var(--text-muted)" }}>
                            SCID:
                          </strong>
                          <br />
                          <code className="mono" style={{ fontSize: "0.7rem" }}>
                            {escrow.scid}
                          </code>
                        </div>
                        <div>
                          <strong style={{ color: "var(--text-muted)" }}>
                            Deploy TX:
                          </strong>
                          <br />
                          <code className="mono" style={{ fontSize: "0.7rem" }}>
                            {escrow.deployTxid}
                          </code>
                        </div>
                        <div>
                          <strong style={{ color: "var(--text-muted)" }}>
                            Seller:
                          </strong>
                          <br />
                          <code className="mono" style={{ fontSize: "0.7rem" }}>
                            {escrow.sellerAddress}
                          </code>
                        </div>
                        <div>
                          <strong style={{ color: "var(--text-muted)" }}>
                            Arbitrator:
                          </strong>
                          <br />
                          <code className="mono" style={{ fontSize: "0.7rem" }}>
                            {escrow.arbitratorAddress}
                          </code>
                        </div>
                        <div>
                          <strong style={{ color: "var(--text-muted)" }}>
                            Buyer:
                          </strong>
                          <br />
                          {escrow.buyerAddress ? (
                            <code className="mono" style={{ fontSize: "0.7rem" }}>
                              {escrow.buyerAddress}
                            </code>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>
                              Not yet deposited
                            </span>
                          )}
                        </div>
                        <div>
                          <strong style={{ color: "var(--text-muted)" }}>
                            Fee / Expiry:
                          </strong>
                          <br />
                          {escrow.feeBasisPoints / 100}% /{" "}
                          {escrow.blockExpiration} blocks
                        </div>
                        {escrow.resolution && (
                          <div>
                            <strong style={{ color: "var(--text-muted)" }}>
                              Resolution:
                            </strong>
                            <br />
                            {formatEscrowStatus(escrow.resolution)}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
