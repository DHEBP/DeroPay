"use client";

import React from "react";
import { motion } from "framer-motion";
import type { Dispute, DisputeStatus } from "@/lib/commerce-types";
import { formatDate } from "@/lib/format";

export function DisputeList({
  visible,
  gatewayInvoiceLinkBase,
  onResolveClick,
  onLostClick,
  onRefundClick,
}: {
  visible: Dispute[];
  gatewayInvoiceLinkBase: string;
  onResolveClick: (d: Dispute) => void;
  onLostClick: (d: Dispute) => void;
  onRefundClick: (d: Dispute) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="surface"
      style={{ padding: 0, overflowX: "auto" }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>Invoice</Th>
            <Th>Reason</Th>
            <Th>Status</Th>
            <Th>Created</Th>
            <Th>Resolved</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((d) => {
            const reasonFull = d.reason ?? "";
            const reasonShort =
              reasonFull.length > 80
                ? `${reasonFull.slice(0, 80)}…`
                : reasonFull;
            return (
              <tr key={d.id}>
                <Td>
                  <a
                    href={`${gatewayInvoiceLinkBase}?id=${encodeURIComponent(
                      d.invoiceId,
                    )}`}
                    className="mono"
                    style={{
                      fontSize: 11.5,
                      color: "var(--dero)",
                      textDecoration: "none",
                    }}
                  >
                    {d.invoiceId}
                  </a>
                </Td>
                <Td>
                  <span
                    title={reasonFull}
                    style={{
                      color: "var(--bone-dim)",
                      fontSize: 12.5,
                      maxWidth: 340,
                      display: "inline-block",
                      lineHeight: 1.4,
                    }}
                  >
                    {reasonShort || (
                      <span style={{ color: "var(--bone-quiet)" }}>—</span>
                    )}
                  </span>
                </Td>
                <Td>
                  <DisputeStatusBadge status={d.status} />
                </Td>
                <Td mono>
                  <span style={{ fontSize: 11, color: "var(--bone-dim)" }}>
                    {formatDate(new Date(d.createdAt).toISOString())}
                  </span>
                </Td>
                <Td mono>
                  <span style={{ fontSize: 11, color: "var(--bone-dim)" }}>
                    {d.resolvedAt
                      ? formatDate(new Date(d.resolvedAt).toISOString())
                      : "—"}
                  </span>
                </Td>
                <Td align="right">
                  <DisputeActions
                    dispute={d}
                    onResolveClick={() => onResolveClick(d)}
                    onLostClick={() => onLostClick(d)}
                    onRefundClick={() => onRefundClick(d)}
                  />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </motion.div>
  );
}

function DisputeActions({
  dispute,
  onResolveClick,
  onLostClick,
  onRefundClick,
}: {
  dispute: Dispute;
  onResolveClick: () => void;
  onLostClick: () => void;
  onRefundClick: () => void;
}) {
  if (dispute.status === "open" || dispute.status === "under_review") {
    return (
      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-ghost btn-mini"
          onClick={onResolveClick}
          title="Mark resolved"
        >
          Resolve
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-mini"
          onClick={onLostClick}
          title="Mark lost"
        >
          Lost
        </button>
        <button
          type="button"
          className="btn btn-primary btn-mini"
          onClick={onRefundClick}
          title="Issue refund payout"
        >
          Refund
        </button>
      </span>
    );
  }
  if (dispute.status === "refunded" && dispute.refundPayoutId) {
    return (
      <a
        href={`/payouts?id=${encodeURIComponent(dispute.refundPayoutId)}`}
        className="btn btn-ghost btn-mini"
        style={{ textDecoration: "none" }}
        title={`Open payout ${dispute.refundPayoutId}`}
      >
        View payout
      </a>
    );
  }
  return <span style={{ color: "var(--bone-quiet)", fontSize: 11 }}>—</span>;
}

function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  const tones: Record<
    DisputeStatus,
    { bg: string; color: string; border: string; label: string }
  > = {
    open: {
      bg: "var(--vermilion-wash)",
      color: "var(--vermilion)",
      border: "rgba(224,93,68,0.28)",
      label: "Open",
    },
    under_review: {
      bg: "var(--amber-wash)",
      color: "var(--amber)",
      border: "rgba(232,177,74,0.28)",
      label: "Under review",
    },
    resolved: {
      bg: "var(--dero-wash)",
      color: "var(--dero)",
      border: "var(--dero-hair)",
      label: "Resolved",
    },
    lost: {
      bg: "rgba(255,255,255,0.04)",
      color: "var(--bone-dim)",
      border: "var(--ink-hair-strong)",
      label: "Lost",
    },
    refunded: {
      bg: "var(--dero-wash)",
      color: "var(--dero)",
      border: "var(--dero-hair)",
      label: "Refunded",
    },
    resolved_merchant_favor: {
      bg: "var(--dero-wash)",
      color: "var(--dero)",
      border: "var(--dero-hair)",
      label: "Merchant favor",
    },
    resolved_customer_favor: {
      bg: "var(--amber-wash)",
      color: "var(--amber)",
      border: "rgba(232,177,74,0.28)",
      label: "Customer favor",
    },
    withdrawn: {
      bg: "rgba(255,255,255,0.04)",
      color: "var(--bone-dim)",
      border: "var(--ink-hair-strong)",
      label: "Withdrawn",
    },
  };
  const t = tones[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 999,
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: t.color,
        }}
      />
      {t.label}
    </span>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      style={{
        textAlign: align,
        padding: "10px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--bone-quiet)",
        fontWeight: 500,
        borderBottom: "1px solid var(--ink-hair)",
        background: "var(--ink-elev-1)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td
      className={mono ? "num" : undefined}
      style={{
        textAlign: align,
        padding: "12px 14px",
        borderBottom: "1px solid var(--ink-hair)",
        color: "var(--bone)",
        fontSize: 13,
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}
