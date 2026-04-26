"use client";

import { Plus } from "lucide-react";
import type { StatusFilter } from "./shared";

export function DisputeFilters({
  statusFilter,
  onStatusChange,
  counts,
  visibleCount,
  onCreate,
}: {
  statusFilter: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
  visibleCount: number;
  onCreate: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
        flexWrap: "wrap",
      }}
    >
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          color: "var(--bone-quiet)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Status
        </span>
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
          style={{
            padding: "5px 10px",
            background: "var(--ink-elev-1)",
            color: "var(--bone-dim)",
            border: "1px solid var(--ink-hair)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          <option value="all">All ({counts.all})</option>
          <option value="open">Open ({counts.open})</option>
          <option value="under_review">
            Under review ({counts.under_review})
          </option>
          <option value="resolved">Resolved ({counts.resolved})</option>
          <option value="lost">Lost ({counts.lost})</option>
          <option value="refunded">Refunded ({counts.refunded})</option>
        </select>
      </label>

      <div style={{ flex: 1 }} />

      <span className="mono" style={{ fontSize: 11, color: "var(--bone-quiet)" }}>
        {visibleCount} result{visibleCount === 1 ? "" : "s"}
      </span>

      <button
        type="button"
        className="btn btn-primary btn-mini"
        onClick={onCreate}
      >
        <Plus size={12} /> New dispute
      </button>
    </div>
  );
}
