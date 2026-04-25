"use client";

import { formatDero, formatDate, truncate } from "@/lib/format";
import { Badge } from "@/components/ui";

type BadgeTone = "positive" | "warn" | "info" | "danger" | "neutral";

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
  onRowClick?: (invoice: SerializedEscrowInvoice) => void;
  openRowId?: string | null;
};

function statusTone(status: string): { tone: BadgeTone; pulse: boolean } {
  switch (status) {
    case "deploying":
    case "awaiting_deposit":
      return { tone: "info", pulse: true };
    case "funded":
      return { tone: "warn", pulse: true };
    case "released":
    case "expired_claimed":
    case "arbitrated":
      return { tone: "positive", pulse: false };
    case "refunded":
      return { tone: "neutral", pulse: false };
    case "disputed":
      return { tone: "warn", pulse: false };
    case "deploy_failed":
      return { tone: "danger", pulse: false };
    default:
      return { tone: "neutral", pulse: false };
  }
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EscrowTable({
  invoices,
  onRowClick,
  openRowId = null,
}: EscrowTableProps) {
  if (invoices.length === 0) {
    return (
      <div style={{ padding: "56px 24px", textAlign: "center" }}>
        <div
          className="eyebrow-mono"
          style={{ fontSize: 11, color: "var(--bone-mute)" }}
        >
          — No escrow contracts on ledger —
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--bone-quiet)" }}>
          Deploy your first escrow-backed invoice to open a buyer-protected channel.
        </div>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th style={{ width: 120 }}>ID</th>
            <th>Name</th>
            <th style={{ textAlign: "right" }}>Amount</th>
            <th>Escrow</th>
            <th>SCID</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const escrow = inv.escrow;
            const escrowStatus = escrow?.escrowStatus ?? "unknown";
            const isOpen = inv.id === openRowId;
            const clickable = !!onRowClick;
            const { tone, pulse } = statusTone(escrowStatus);

            return (
              <tr
                key={inv.id}
                aria-selected={isOpen || undefined}
                onClick={onRowClick ? () => onRowClick(inv) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(inv);
                        }
                      }
                    : undefined
                }
                tabIndex={clickable ? 0 : undefined}
                style={{
                  cursor: clickable ? "pointer" : undefined,
                  background: isOpen ? "var(--ink-elev-2)" : undefined,
                  outline: isOpen ? "1px solid var(--dero-hair)" : undefined,
                  outlineOffset: isOpen ? "-1px" : undefined,
                }}
              >
                <td>
                  <code
                    className="mono"
                    style={{ fontSize: 11, color: "var(--bone-dim)" }}
                  >
                    {truncate(inv.id, 5, 4)}
                  </code>
                </td>
                <td style={{ color: "var(--bone)" }}>{inv.name}</td>
                <td
                  className="num"
                  style={{ textAlign: "right", color: "var(--bone)" }}
                >
                  {formatDero(inv.amount, 5)}{" "}
                  <span
                    style={{
                      color: "var(--bone-quiet)",
                      fontSize: 9.5,
                      letterSpacing: "0.14em",
                    }}
                  >
                    DERO
                  </span>
                </td>
                <td>
                  <Badge tone={tone} pulse={pulse}>
                    {humanize(escrowStatus)}
                  </Badge>
                </td>
                <td>
                  <code
                    className="mono"
                    style={{ fontSize: 10.5, color: "var(--bone-mute)" }}
                  >
                    {escrow?.scid ? truncate(escrow.scid, 4, 4) : "—"}
                  </code>
                </td>
                <td
                  className="mono"
                  style={{ fontSize: 11, color: "var(--bone-dim)" }}
                >
                  {formatDate(inv.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
