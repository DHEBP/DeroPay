"use client";

import { useCallback, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { InvoiceStatus } from "dero-pay";
import { formatDero, formatDate, truncate } from "@/lib/format";
import { StatusPill } from "@/components/status-pill";

export type InvoiceSortKey =
  | "id"
  | "name"
  | "amount"
  | "received"
  | "createdAt"
  | "payments";
export type InvoiceSortDir = "asc" | "desc";

type SerializedInvoice = {
  id: string;
  name: string;
  description: string;
  amount: string;
  status: string;
  paymentId: string;
  integratedAddress: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  amountReceived: string;
  payments: Array<{
    txid: string;
    amount: string;
    confirmations: number;
    status: string;
  }>;
};

/**
 * Bulk-selection adapter. Preferred over the legacy
 * `selectable/selectedIds/onSelectionChange` triple — pass the return value
 * of `useMultiSelect` through directly. When `selection` is supplied the
 * table renders checkboxes regardless of `selectable`.
 */
export type InvoiceTableSelection = {
  isSelected: (id: string) => boolean;
  toggle: (id: string, event?: MouseEvent | KeyboardEvent) => void;
  selectAll: () => void;
  clear: () => void;
  selectedCount: number;
  /** Total items across the page; used to compute the header checkbox state. */
  total: number;
};

type InvoiceTableProps = {
  invoices: SerializedInvoice[];
  /** New-style adapter. If present, overrides the legacy trio below. */
  selection?: InvoiceTableSelection;
  /** @deprecated Prefer `selection`. */
  selectable?: boolean;
  /** @deprecated Prefer `selection`. */
  selectedIds?: Set<string>;
  /** @deprecated Prefer `selection`. */
  onSelectionChange?: (next: Set<string>) => void;
  /** Row click — opens detail (distinct from bulk-selection checkbox). */
  onRowClick?: (invoice: SerializedInvoice) => void;
  /** Id of the row currently shown in a detail drawer (for highlight). */
  openRowId?: string | null;
  /** Active sort column, or null for fetched order. */
  sortKey?: InvoiceSortKey | null;
  sortDir?: InvoiceSortDir | null;
  onSortChange?: (next: {
    sortKey: InvoiceSortKey | null;
    sortDir: InvoiceSortDir | null;
  }) => void;
  /**
   * Fired when the inline StatusPill successfully (optimistically) changes a
   * row's status. The parent should update its local list state so the row
   * re-renders without waiting for the next refetch; on server rejection the
   * StatusPill will call this again with the previous status to revert.
   */
  onStatusChanged?: (id: string, next: InvoiceStatus) => void;
};

export function InvoiceTable({
  invoices,
  selection,
  selectable = false,
  selectedIds,
  onSelectionChange,
  onRowClick,
  openRowId = null,
  sortKey = null,
  sortDir = null,
  onSortChange,
  onStatusChanged,
}: InvoiceTableProps) {
  const lastToggledRef = useRef<number | null>(null);
  // `selection` takes precedence over the legacy trio; when both are
  // supplied the new adapter wins. Callers should migrate and drop the
  // trio — see the JSDoc on `InvoiceTableSelection`.
  const useSelection = !!selection;
  const showCheckboxes = useSelection || selectable;

  const cycleSort = useCallback(
    (key: InvoiceSortKey) => {
      if (!onSortChange) return;
      if (sortKey !== key) {
        onSortChange({ sortKey: key, sortDir: "asc" });
        return;
      }
      if (sortDir === "asc") onSortChange({ sortKey: key, sortDir: "desc" });
      else if (sortDir === "desc") onSortChange({ sortKey: null, sortDir: null });
      else onSortChange({ sortKey: key, sortDir: "asc" });
    },
    [onSortChange, sortKey, sortDir],
  );

  const renderSortHeader = (
    key: InvoiceSortKey,
    label: string,
    align: "left" | "right" = "left",
  ) => {
    const active = sortKey === key && (sortDir === "asc" || sortDir === "desc");
    const arrow =
      active && sortDir === "asc" ? (
        <ChevronUp size={12} style={{ color: "var(--bone)" }} aria-hidden />
      ) : active && sortDir === "desc" ? (
        <ChevronDown size={12} style={{ color: "var(--bone)" }} aria-hidden />
      ) : null;
    const sortable = !!onSortChange;
    const ariaSort: "ascending" | "descending" | "none" = active
      ? sortDir === "asc"
        ? "ascending"
        : "descending"
      : "none";
    if (!sortable) {
      return <span>{label}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => cycleSort(key)}
        aria-sort={ariaSort}
        aria-label={`Sort by ${label}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "none",
          border: 0,
          padding: 0,
          margin: 0,
          font: "inherit",
          color: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
          cursor: "pointer",
          flexDirection: align === "right" ? "row-reverse" : "row",
        }}
      >
        <span>{label}</span>
        {arrow}
      </button>
    );
  };

  const isRowSelected = useCallback(
    (id: string): boolean => {
      if (useSelection) return selection!.isSelected(id);
      return !!selectedIds?.has(id);
    },
    [useSelection, selection, selectedIds],
  );

  const allSelected =
    showCheckboxes &&
    invoices.length > 0 &&
    invoices.every((inv) => isRowSelected(inv.id));
  const selectedCount = useSelection
    ? selection!.selectedCount
    : (selectedIds?.size ?? 0);
  const someSelected = showCheckboxes && selectedCount > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    if (useSelection) {
      if (allSelected) selection!.clear();
      else selection!.selectAll();
      return;
    }
    if (!onSelectionChange) return;
    if (allSelected) onSelectionChange(new Set());
    else onSelectionChange(new Set(invoices.map((inv) => inv.id)));
  }, [useSelection, selection, allSelected, invoices, onSelectionChange]);

  const toggleOne = useCallback(
    (idx: number, event: MouseEvent | KeyboardEvent) => {
      const id = invoices[idx]!.id;
      if (useSelection) {
        selection!.toggle(id, event);
        lastToggledRef.current = idx;
        return;
      }
      if (!onSelectionChange || !selectedIds) return;
      const shiftKey =
        "shiftKey" in event && (event as { shiftKey?: boolean }).shiftKey === true;
      const next = new Set(selectedIds);
      if (shiftKey && lastToggledRef.current !== null) {
        const [a, b] = [lastToggledRef.current, idx].sort((x, y) => x - y);
        const targetState = !selectedIds.has(id);
        for (let i = a; i <= b; i++) {
          const ivId = invoices[i]?.id;
          if (!ivId) continue;
          if (targetState) next.add(ivId);
          else next.delete(ivId);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      lastToggledRef.current = idx;
      onSelectionChange(next);
    },
    [invoices, onSelectionChange, selectedIds, useSelection, selection],
  );

  if (invoices.length === 0) {
    return (
      <div style={{ padding: "56px 24px", textAlign: "center" }}>
        <div
          className="eyebrow-mono"
          style={{ fontSize: 11, color: "var(--bone-mute)" }}
        >
          — No invoices on ledger —
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--bone-quiet)",
          }}
        >
          Create your first invoice to begin accepting DERO payments.
        </div>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {showCheckboxes && (
              <th style={{ width: 36, paddingLeft: 18, paddingRight: 4 }}>
                <label style={{ display: "inline-flex", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !!someSelected;
                    }}
                    onChange={toggleAll}
                    aria-label={allSelected ? "Deselect all" : "Select all"}
                    style={{ cursor: "pointer" }}
                  />
                </label>
              </th>
            )}
            <th style={{ width: 120 }}>{renderSortHeader("id", "ID")}</th>
            <th>{renderSortHeader("name", "Name")}</th>
            <th style={{ textAlign: "right" }}>
              {renderSortHeader("amount", "Amount", "right")}
            </th>
            <th style={{ textAlign: "right" }}>
              {renderSortHeader("received", "Received", "right")}
            </th>
            <th>Status</th>
            <th>{renderSortHeader("createdAt", "Created")}</th>
            <th style={{ textAlign: "right" }}>
              {renderSortHeader("payments", "Pay #", "right")}
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv, idx) => {
            const isSelected = isRowSelected(inv.id);
            const isOpen = inv.id === openRowId;
            const clickable = !!onRowClick;
            return (
              <tr
                key={inv.id}
                aria-selected={showCheckboxes ? isSelected : isOpen || undefined}
                onClick={onRowClick ? () => onRowClick(inv) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onRowClick(inv);
                          return;
                        }
                        // Space on the row body toggles selection when the
                        // table has a checkbox column. Keeps the "pick rows"
                        // flow reachable even for keyboard-only users who
                        // aren't tabbing into each checkbox. Enter still
                        // opens the drawer so the two actions don't collide.
                        if (e.key === " " && showCheckboxes) {
                          e.preventDefault();
                          toggleOne(idx, e);
                        }
                      }
                    : undefined
                }
                tabIndex={clickable ? 0 : undefined}
                style={{
                  background: isSelected
                    ? "var(--dero-wash)"
                    : isOpen
                      ? "var(--ink-elev-2)"
                      : undefined,
                  cursor: clickable ? "pointer" : undefined,
                  outline: isOpen ? "1px solid var(--dero-hair)" : undefined,
                  outlineOffset: isOpen ? "-1px" : undefined,
                }}
              >
                {showCheckboxes && (
                  <td
                    style={{ paddingLeft: 18, paddingRight: 4 }}
                    // Stop row-click from firing when the user clicks the
                    // checkbox cell's padding (not just the input itself).
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        /* state updates via onClick below */
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleOne(idx, e);
                      }}
                      aria-label={`Select invoice ${inv.id}`}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                )}
                <td>
                  <code
                    className="mono"
                    style={{ fontSize: 11, color: "var(--bone-dim)" }}
                  >
                    {truncate(inv.id, 5, 4)}
                  </code>
                </td>
                <td
                  style={{
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <div style={{ color: "var(--bone)" }}>{inv.name}</div>
                  {inv.description && (
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--bone-quiet)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {inv.description}
                    </div>
                  )}
                </td>
                <td className="num" style={{ textAlign: "right", color: "var(--bone)" }}>
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
                <td
                  className="num"
                  style={{
                    textAlign: "right",
                    color:
                      inv.amountReceived === inv.amount
                        ? "var(--dero)"
                        : "var(--bone-dim)",
                  }}
                >
                  {formatDero(inv.amountReceived, 5)}
                </td>
                <td>
                  <StatusPill
                    status={inv.status as InvoiceStatus}
                    invoiceId={inv.id}
                    onStatusChanged={(next) => onStatusChanged?.(inv.id, next)}
                    readonly={!onStatusChanged}
                  />
                </td>
                <td
                  className="mono"
                  style={{ fontSize: 11, color: "var(--bone-dim)" }}
                >
                  {formatDate(inv.createdAt)}
                </td>
                <td
                  className="num"
                  style={{
                    textAlign: "right",
                    color: "var(--bone-mute)",
                    fontSize: 11.5,
                  }}
                >
                  {inv.payments.length}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
