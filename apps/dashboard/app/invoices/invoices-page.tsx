"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Plus,
  X,
  Archive,
  Webhook,
  FileDown,
  FileJson,
} from "lucide-react";
import type { InvoiceStatus } from "dero-pay";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  InvoiceTable,
  type InvoiceSortDir,
  type InvoiceSortKey,
  type InvoiceTableSelection,
} from "@/components/invoice-table";
import { CreateInvoiceForm } from "@/components/create-invoice-form";
import { InvoiceDetailDrawer } from "@/components/invoices/InvoiceDetailDrawer";
import { useToast } from "@/components/toast";
import { Button, ListShell, EyebrowLabel } from "@/components/ui";
import { BulkToolbar, type BulkAction } from "@/components/bulk-toolbar";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { useQueryParam } from "@/lib/useQueryParam";
import { useDrawerParam } from "@/lib/useDrawerParam";
import { useUndoableAction } from "@/lib/useUndoableAction";
import { useMultiSelect } from "@/lib/useMultiSelect";
import { exportCsv, exportJson } from "@/lib/export";
import { SavedViewBar } from "@/components/saved-view-bar";
import { GroupedList, type Group } from "@/components/grouped-list";
import { useSavedViews } from "@/lib/useSavedViews";
import type { FilterChip } from "@/components/ui";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirming", label: "Confirming" },
  { value: "completed", label: "Completed" },
  { value: "expired", label: "Expired" },
  { value: "partial", label: "Partial" },
] as const satisfies ReadonlyArray<FilterChip>;

type FilterValue = (typeof FILTERS)[number]["value"];

type SerializedInvoice = Parameters<typeof InvoiceTable>[0]["invoices"][number];

const FILTER_SET = new Set<string>(FILTERS.map((f) => f.value));

const SORT_KEYS = new Set<InvoiceSortKey>([
  "id",
  "name",
  "amount",
  "received",
  "createdAt",
  "payments",
]);

function toBigInt(v: string | null | undefined): bigint {
  if (!v) return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

// Facet keys this page's SavedViewBar owns (everything else on the URL —
// drawer, feature flags — is left alone by applyView).
const INVOICES_FILTER_KEYS = ["status", "q"] as const;

export function InvoicesPage() {
  const { toast } = useToast();

  // URL-backed state. Filter + search + open-id all live in the URL so
  // links are shareable, refresh-stable, and browser back/forward works.
  //
  // Multi-value aware: a SavedView (e.g. built-in "Unpaid") can put a CSV
  // like `status=pending,confirming,partial` into the URL. We recognise the
  // comma and treat it as a synthetic "multi" filter — the single-select
  // FilterChips bar falls back to "All" for its highlight in that case
  // (the SavedViewBar pill carries the active indicator instead).
  const [rawFilter, setFilter] = useQueryParam("status", "all");
  const statusMulti = useMemo(
    () =>
      rawFilter.includes(",")
        ? rawFilter.split(",").filter(Boolean)
        : null,
    [rawFilter],
  );
  const filter: FilterValue =
    statusMulti !== null
      ? "all"
      : FILTER_SET.has(rawFilter)
        ? (rawFilter as FilterValue)
        : "all";
  const [search, setSearch] = useQueryParam("q");

  // Drawer state lives in `?drawer=invoice:<id>` (shared grammar across
  // list pages — see useDrawerParam). We only act on targets whose
  // entityType matches this page; `?drawer=escrow:…` on /invoices is
  // intentionally ignored so stale/cross-page links don't misfire.
  const { target: drawerTarget, openDrawer, closeDrawer } = useDrawerParam();
  const openId =
    drawerTarget && drawerTarget.entityType === "invoice"
      ? drawerTarget.entityId
      : "";

  const [rawSortKey, setSortKeyParam] = useQueryParam("sort");
  const [rawSortDir, setSortDirParam] = useQueryParam("dir");

  const sortKey: InvoiceSortKey | null = SORT_KEYS.has(
    rawSortKey as InvoiceSortKey,
  )
    ? (rawSortKey as InvoiceSortKey)
    : null;
  const sortDir: InvoiceSortDir | null =
    rawSortDir === "asc" || rawSortDir === "desc" ? rawSortDir : null;

  // Create-form is ephemeral UI, not worth a URL param.
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Local status overlay: when the StatusPill fires an optimistic change, we
  // stash `{id: newStatus}` here so the row re-renders immediately without
  // waiting for the next useLiveFetch poll to merge server truth back in.
  // On server rejection the pill calls us again with the previous status;
  // entries for ids that match the server's value are harmless until the
  // next refresh wipes them.
  const [statusOverride, setStatusOverride] = useState<
    Record<string, InvoiceStatus>
  >({});

  // Client-side hide set for invoices that have just been archived. The
  // server flag (`archived_at`) is authoritative, but until the list GET
  // honors `?includeArchived=false` we keep a local mirror so the "row
  // fades out immediately" UX works end-to-end. When the Undo fires,
  // we remove the id from this set and the row reappears.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const undoable = useUndoableAction<string>();
  // Separate instance for the bulk-archive flow — its rollback payload
  // is the list of ids that were successfully archived, not a single id,
  // so a second `useUndoableAction<string[]>()` keeps the types honest
  // without lying via `as`.
  const undoableBulk = useUndoableAction<string[]>();

  // When a multi-value status filter is active, we fetch *all* invoices and
  // do the OR-match client-side (the gateway only understands a single
  // `status` scalar). Single-value path remains server-side to keep the
  // existing request shape and cache keys stable.
  const fetchKey =
    statusMulti !== null
      ? "invoices-all"
      : filter === "all"
        ? "invoices-all"
        : `invoices-${filter}`;
  const {
    data: invoices,
    error: fetchError,
    refresh,
  } = useLiveFetch<SerializedInvoice[]>(
    fetchKey,
    async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (statusMulti === null && filter !== "all") {
        params.set("status", filter);
      }
      const r = await fetch(`/api/pay/invoices?${params.toString()}`);
      if (!r.ok) throw new Error("Couldn't reach the payment gateway (HTTP " + r.status + ")");
      return (await r.json()) as SerializedInvoice[];
    },
    { refreshInterval: 10_000 },
  );

  const rawRows = invoices ?? [];
  // Apply the local optimistic-status overlay before anything else reads the
  // list, so filters and sorts see the pending state too.
  const rows = useMemo(() => {
    if (Object.keys(statusOverride).length === 0) return rawRows;
    return rawRows.map((inv) =>
      statusOverride[inv.id] && statusOverride[inv.id] !== inv.status
        ? { ...inv, status: statusOverride[inv.id]! }
        : inv,
    );
  }, [rawRows, statusOverride]);

  // Rows visible to the table (list operations) — `rows` is preserved for the
  // drawer-lookup step below so the drawer can still resolve an invoice by id
  // even while its row is transiently hidden for the Undo window.
  const visibleRows = useMemo(
    () => (hiddenIds.size === 0 ? rows : rows.filter((r) => !hiddenIds.has(r.id))),
    [rows, hiddenIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const multiSet = statusMulti ? new Set(statusMulti) : null;
    let rowsOut = visibleRows;
    if (multiSet) {
      rowsOut = rowsOut.filter((inv) => multiSet.has(inv.status));
    }
    if (!q) return rowsOut;
    return rowsOut.filter((inv) => {
      return (
        inv.id.toLowerCase().includes(q) ||
        inv.name.toLowerCase().includes(q) ||
        (inv.description?.toLowerCase().includes(q) ?? false) ||
        inv.paymentId.toLowerCase().includes(q)
      );
    });
  }, [visibleRows, search, statusMulti]);

  const displayed = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    const sorted = [...filtered];
    const mult = sortDir === "desc" ? -1 : 1;
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id":
          cmp = a.id.localeCompare(b.id);
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "createdAt":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
        case "amount": {
          const av = toBigInt(a.amount);
          const bv = toBigInt(b.amount);
          cmp = av === bv ? 0 : av < bv ? -1 : 1;
          break;
        }
        case "received": {
          const av = toBigInt(a.amountReceived);
          const bv = toBigInt(b.amountReceived);
          cmp = av === bv ? 0 : av < bv ? -1 : 1;
          break;
        }
        case "payments":
          cmp = a.payments.length - b.payments.length;
          break;
      }
      return cmp * mult;
    });
    return sorted;
  }, [filtered, sortKey, sortDir]);

  // Saved views — reads current URL facets (including groupBy) and provides
  // the applyView / create hooks to the SavedViewBar below.
  const { currentFacets } = useSavedViews("invoices", INVOICES_FILTER_KEYS);
  const groupBy = currentFacets.groupBy ?? null;

  // Multi-select is scoped to the currently *displayed* rows. When the
  // saved-view/filter flips to a different list the hook auto-prunes ids
  // that vanish, so we don't carry phantom selections across view changes.
  const {
    selected: selectedIds,
    isSelected,
    toggle: toggleSelection,
    selectAll,
    clear: clearSelection,
    selectedItems,
    selectedCount,
  } = useMultiSelect<SerializedInvoice>(displayed);

  // `selection` adapter passed to the table. Memoised so the table doesn't
  // re-render on every unrelated parent update.
  const tableSelection = useMemo<InvoiceTableSelection>(
    () => ({
      isSelected,
      toggle: toggleSelection,
      selectAll,
      clear: clearSelection,
      selectedCount,
      total: displayed.length,
    }),
    [isSelected, toggleSelection, selectAll, clearSelection, selectedCount, displayed.length],
  );

  // Drawer target — look in unfiltered rows so a shared link still opens
  // even if the current filter would hide the row.
  const selectedInvoice = useMemo(
    () => (openId ? rows.find((inv) => inv.id === openId) ?? null : null),
    [rows, openId],
  );

  // Flatten an invoice to a plain row suitable for CSV — keeps atomic
  // amounts as strings so CSV consumers don't lose precision.
  const flattenForExport = (inv: SerializedInvoice) => ({
    id: inv.id,
    name: inv.name,
    description: inv.description ?? "",
    status: inv.status,
    amount_atomic: inv.amount,
    amount_received_atomic: inv.amountReceived,
    created_at: inv.createdAt,
    expires_at: inv.expiresAt,
    completed_at: inv.completedAt ?? "",
    payment_id: inv.paymentId,
    payments: inv.payments.length,
  });

  const todayStamp = () => new Date().toISOString().slice(0, 10);

  /**
   * Archive an invoice with Gmail-style Undo.
   *
   * Flow:
   *   1. `perform` hides the row client-side AND PATCHes `archived=true` on
   *      the server. The drawer closes so the list view makes sense.
   *   2. The toast appears with "Invoice archived — Undo (5s)". If the user
   *      hits Undo, `revert` PATCHes `archived=false` and un-hides the row.
   *   3. If the window elapses, `commit` is a no-op — the archive flag is
   *      already persisted. The nightly purge job (if/when one ships) will
   *      lean on `deleted_at`, NOT `archived_at`; archive is permanent-but-
   *      reversible, not two-phase.
   */
  const archiveInvoice = useCallback(
    (inv: SerializedInvoice) => {
      const id = inv.id;
      void undoable({
        perform: async () => {
          // Optimistic UI first — the server PATCH below can race with a
          // poll, so the setState is the reliable "row disappears" signal.
          setHiddenIds((prev) => {
            const n = new Set(prev);
            n.add(id);
            return n;
          });
          // Close the drawer if it was showing this invoice; the row is
          // gone from the list below, and keeping the drawer open would
          // leave a stale surface.
          if (openId === id) closeDrawer();

          const res = await fetch(
            `/api/pay/invoices/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ archived: true }),
            },
          );
          if (!res.ok) {
            // Roll back the client-side hide so the row reappears — the user
            // sees their invoice untouched and `useUndoableAction` will
            // re-throw so no Undo toast appears (caller shows its own error).
            setHiddenIds((prev) => {
              const n = new Set(prev);
              n.delete(id);
              return n;
            });
            let msg = `HTTP ${res.status}`;
            try {
              const body = (await res.json()) as { message?: string };
              if (body.message) msg = body.message;
            } catch {
              /* ignore */
            }
            toast({
              title: "Couldn't archive invoice",
              description: msg,
              tone: "error",
            });
            throw new Error(msg);
          }
          return id;
        },
        commit: async () => {
          // No-op: archive is already persisted by `perform`. A future
          // "hard delete after N days" job would live as a separate cron,
          // reading `archived_at` rather than running here.
        },
        revert: async (revId: string) => {
          const res = await fetch(
            `/api/pay/invoices/${encodeURIComponent(revId)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ archived: false }),
            },
          );
          if (!res.ok) {
            let msg = `HTTP ${res.status}`;
            try {
              const body = (await res.json()) as { message?: string };
              if (body.message) msg = body.message;
            } catch {
              /* ignore */
            }
            // Row stays hidden on the client — the server state is still
            // archived=true, so un-hiding it would misrepresent reality.
            throw new Error(msg);
          }
          // Server-side archive cleared; un-hide the row on the client so
          // it reappears in the list.
          setHiddenIds((prev) => {
            const n = new Set(prev);
            n.delete(revId);
            return n;
          });
          // Kick off a refresh so the row's archivedAt flag syncs from
          // the authoritative list endpoint on the next poll.
          void refresh();
        },
        message: "Invoice archived",
        description: inv.name
          ? `"${inv.name}" is hidden from the active list.`
          : `${id.slice(0, 12)}… is hidden from the active list.`,
      });
    },
    [undoable, openId, closeDrawer, toast, refresh],
  );

  /**
   * Bulk archive — one undoable transaction covers N invoices. The
   * `perform` leg PATCHes `archived=true` on every row in parallel; any
   * individual failure rolls back just the row that failed while the
   * rest stay archived, matching how the single-row archive flow
   * behaves. The Undo button un-archives every id that was successfully
   * flipped.
   */
  const bulkArchiveInvoices = useCallback(
    (items: SerializedInvoice[]) => {
      if (items.length === 0) return;
      const ids = items.map((i) => i.id);
      void undoableBulk({
        perform: async () => {
          // Mirror client-side hide up-front.
          setHiddenIds((prev) => {
            const n = new Set(prev);
            for (const id of ids) n.add(id);
            return n;
          });
          if (openId && ids.includes(openId)) closeDrawer();

          const results = await Promise.allSettled(
            ids.map((id) =>
              fetch(`/api/pay/invoices/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ archived: true }),
              }).then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return id;
              }),
            ),
          );
          const ok: string[] = [];
          const failed: string[] = [];
          results.forEach((r, idx) => {
            if (r.status === "fulfilled") ok.push(r.value);
            else failed.push(ids[idx]!);
          });
          if (failed.length > 0) {
            // Un-hide the failed ids so they reappear in the list.
            setHiddenIds((prev) => {
              const n = new Set(prev);
              for (const id of failed) n.delete(id);
              return n;
            });
            toast({
              title:
                failed.length === ids.length
                  ? "Couldn't archive invoices"
                  : `${failed.length} invoice${failed.length === 1 ? "" : "s"} couldn't be archived`,
              tone: "error",
            });
          }
          if (ok.length === 0) {
            // Nothing succeeded — short-circuit so no Undo toast appears.
            throw new Error("All archive requests failed");
          }
          return ok;
        },
        commit: async () => {
          // No-op: archive flag already persisted per id.
        },
        revert: async (okIds) => {
          await Promise.allSettled(
            okIds.map((id) =>
              fetch(`/api/pay/invoices/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ archived: false }),
              }),
            ),
          );
          setHiddenIds((prev) => {
            const n = new Set(prev);
            for (const id of okIds) n.delete(id);
            return n;
          });
          void refresh();
        },
        message: `${ids.length} invoice${ids.length === 1 ? "" : "s"} archived`,
      });
      clearSelection();
    },
    [undoableBulk, openId, closeDrawer, toast, refresh, clearSelection],
  );

  /**
   * Resend the latest webhook delivery for each selected invoice. Deliveries
   * are tagged with an `invoice_id` in the server response, so we fetch the
   * current delivery page, bucket by invoice, and POST to the resend endpoint
   * for each latest attempt. Invoices without a delivery on file are reported
   * as skipped.
   */
  const bulkResendWebhooks = useCallback(
    async (items: SerializedInvoice[]) => {
      if (items.length === 0) return;
      const wantIds = new Set(items.map((i) => i.id));
      try {
        const r = await fetch(`/api/pay/webhooks/deliveries?limit=1000`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as {
          deliveries?: Array<{
            id: string;
            invoice_id?: string;
            invoiceId?: string;
            created_at?: string;
            createdAt?: string;
          }>;
        };
        const latestByInvoice = new Map<string, { deliveryId: string; ts: string }>();
        for (const d of body.deliveries ?? []) {
          const invId = d.invoice_id ?? d.invoiceId;
          if (!invId || !wantIds.has(invId)) continue;
          const ts = d.created_at ?? d.createdAt ?? "";
          const prev = latestByInvoice.get(invId);
          if (!prev || ts > prev.ts) {
            latestByInvoice.set(invId, { deliveryId: d.id, ts });
          }
        }
        const targets = [...latestByInvoice.entries()];
        const skipped = items.length - targets.length;
        const results = await Promise.allSettled(
          targets.map(([, { deliveryId }]) =>
            fetch(
              `/api/pay/webhooks/deliveries/${encodeURIComponent(deliveryId)}/resend`,
              { method: "POST" },
            ).then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
            }),
          ),
        );
        const ok = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.length - ok;
        toast({
          title:
            ok > 0
              ? `Re-sent ${ok} webhook${ok === 1 ? "" : "s"}`
              : "No webhooks resent",
          description:
            skipped > 0 || failed > 0
              ? [
                  skipped > 0 ? `${skipped} had no delivery on file` : null,
                  failed > 0 ? `${failed} failed` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined,
          tone: ok > 0 ? "success" : "info",
        });
      } catch (err) {
        toast({
          title: "Couldn't resend webhooks",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      } finally {
        clearSelection();
      }
    },
    [toast, clearSelection],
  );

  const bulkActions = useMemo<BulkAction<SerializedInvoice>[]>(
    () => [
      {
        key: "archive",
        label: "Archive",
        icon: <Archive size={13} />,
        destructive: true,
        onRun: (items) => bulkArchiveInvoices(items),
        disabledReason: (items) =>
          items.some((i) => !["completed", "expired"].includes(i.status))
            ? "Only completed/expired invoices can be archived"
            : null,
        confirmDescription: (items) => (
          <>
            Archive <strong>{items.length}</strong> invoice
            {items.length === 1 ? "" : "s"}? They&apos;ll move out of the
            active list — you can undo for 5 seconds, or unarchive later from
            the invoice detail.
          </>
        ),
      },
      {
        key: "resend-webhook",
        label: "Resend webhook",
        icon: <Webhook size={13} />,
        onRun: (items) => bulkResendWebhooks(items),
      },
      {
        key: "export-csv",
        label: "Export CSV",
        icon: <FileDown size={13} />,
        onRun: (items) => {
          if (items.length === 0) return;
          exportCsv(items.map(flattenForExport), `invoices-${todayStamp()}.csv`);
          toast({
            title: `Exported ${items.length} invoice${items.length === 1 ? "" : "s"}`,
            tone: "success",
          });
          clearSelection();
        },
      },
      {
        key: "export-json",
        label: "Export JSON",
        icon: <FileJson size={13} />,
        onRun: (items) => {
          if (items.length === 0) return;
          exportJson(items, `invoices-${todayStamp()}.json`);
          toast({
            title: `Exported ${items.length} invoice${items.length === 1 ? "" : "s"}`,
            tone: "success",
          });
          clearSelection();
        },
      },
    ],
    [bulkArchiveInvoices, bulkResendWebhooks, toast, clearSelection],
  );

  return (
    <DashboardShell>
      <ListShell<FilterValue>
        index="02"
        eyebrow="Invoices"
        title="Ledger of payments."
        subtitle="Every invoice is a one-time integrated DERO address. Pending entries listen for incoming confirmations in real time."
        primaryAction={
          <Button
            variant={showCreateForm ? "ghost" : "primary"}
            leftIcon={showCreateForm ? <X size={13} /> : <Plus size={13} />}
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? "Cancel" : "New Invoice"}
          </Button>
        }
        drawer={
          showCreateForm && (
            <div className="surface corner-ticks" style={{ padding: "20px 22px" }}>
              <div style={{ marginBottom: 14 }}>
                <EyebrowLabel tone="accent">New Invoice · Draft</EyebrowLabel>
              </div>
              <CreateInvoiceForm
                onCreated={() => {
                  setShowCreateForm(false);
                  void refresh();
                }}
              />
            </div>
          )
        }
        filters={FILTERS}
        filterValue={filter}
        onFilterChange={setFilter}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Search id, name, description…",
        }}
        error={invoices === null ? fetchError : null}
        onRetry={() => void refresh()}
      >
        {/*
         * Stacking order (top → bottom) below the filter bar:
         *   1. SavedViewBar (peer — Phase 2 #14/#15)
         *   2. BulkToolbar  (this wave — only renders when selectedCount > 0)
         *   3. Table or grouped view
         */}
        <SavedViewBar
          pageKey="invoices"
          filterKeys={INVOICES_FILTER_KEYS}
        />
        <BulkToolbar<SerializedInvoice>
          items={selectedItems}
          selectedCount={selectedCount}
          onClear={clearSelection}
          actions={bulkActions}
        />
        {groupBy ? (
          <InvoiceGroupedView
            invoices={displayed}
            groupBy={groupBy}
            selection={tableSelection}
            onRowClick={(inv) =>
              openDrawer({ entityType: "invoice", entityId: inv.id })
            }
            openRowId={openId || null}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={({ sortKey: k, sortDir: d }) => {
              setSortKeyParam(k ?? "");
              setSortDirParam(d ?? "");
            }}
            onStatusChanged={(id, next) => {
              setStatusOverride((prev) => ({ ...prev, [id]: next }));
              void refresh();
            }}
          />
        ) : (
          <InvoiceTable
            invoices={displayed}
            selection={tableSelection}
            onRowClick={(inv) =>
              openDrawer({ entityType: "invoice", entityId: inv.id })
            }
            openRowId={openId || null}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={({ sortKey: k, sortDir: d }) => {
              setSortKeyParam(k ?? "");
              setSortDirParam(d ?? "");
            }}
            onStatusChanged={(id, next) => {
              setStatusOverride((prev) => ({ ...prev, [id]: next }));
              // Kick off a refresh so the authoritative server state replaces
              // our local overlay as soon as it's available.
              void refresh();
            }}
          />
        )}
      </ListShell>

      <InvoiceDetailDrawer
        invoice={selectedInvoice}
        onClose={closeDrawer}
        initialTab={drawerTarget?.tab}
        onArchive={(inv) => {
          // The drawer hands us its InvoiceDetail shape; look up the serialized
          // row from our list state (which is what `archiveInvoice` expects)
          // via id rather than trust a cross-type cast.
          const row = rows.find((r) => r.id === inv.id);
          if (row) archiveInvoice(row);
        }}
      />
    </DashboardShell>
  );
}

// ---------------------------------------------------------------------------
// Grouped rendering
// ---------------------------------------------------------------------------

type GroupedProps = {
  invoices: SerializedInvoice[];
  groupBy: string;
  selection: InvoiceTableSelection;
  onRowClick: (inv: SerializedInvoice) => void;
  openRowId: string | null;
  sortKey: InvoiceSortKey | null;
  sortDir: InvoiceSortDir | null;
  onSortChange: (next: {
    sortKey: InvoiceSortKey | null;
    sortDir: InvoiceSortDir | null;
  }) => void;
  onStatusChanged: (id: string, next: InvoiceStatus) => void;
};

const AMOUNT_BUCKETS: Array<{ key: string; label: string; max: bigint }> = [
  // Atomic units → 1 DERO = 1e12 atomic. Boundaries in atomic units.
  { key: "0-10", label: "0 – 10 DERO", max: 10_000_000_000_000n },
  { key: "10-100", label: "10 – 100 DERO", max: 100_000_000_000_000n },
  { key: "100-1k", label: "100 – 1,000 DERO", max: 1_000_000_000_000_000n },
  { key: "1k-10k", label: "1,000 – 10,000 DERO", max: 10_000_000_000_000_000n },
  { key: "10k+", label: "10,000+ DERO", max: -1n }, // sentinel for "no upper bound"
];

function amountBucketKey(atomic: string): string {
  let v = 0n;
  try {
    v = BigInt(atomic);
  } catch {
    return "0-10";
  }
  for (const b of AMOUNT_BUCKETS) {
    if (b.max === -1n) return b.key;
    if (v < b.max) return b.key;
  }
  return "10k+";
}

function dayKey(iso: string): string {
  // Bucket to UTC date — calling Date methods on a Z-suffixed ISO gives us
  // local-tz buckets by default, which muddies "day" semantics across the
  // dateline. We slice the YYYY-MM-DD prefix off the ISO string, which is
  // always UTC.
  if (!iso) return "unknown";
  return iso.slice(0, 10);
}

function InvoiceGroupedView({
  invoices,
  groupBy,
  selection,
  onRowClick,
  openRowId,
  sortKey,
  sortDir,
  onSortChange,
  onStatusChanged,
}: GroupedProps) {
  const partitioner = useMemo<(inv: SerializedInvoice) => string>(() => {
    switch (groupBy) {
      case "status":
        return (inv) => inv.status || "unknown";
      case "customer":
        // We don't have a dedicated `customer` field on invoices yet — the
        // name column is the closest proxy. Document this so future work
        // swapping in a customer_id is a one-line change.
        return (inv) => inv.name || "—";
      case "day":
        return (inv) => dayKey(inv.createdAt);
      case "amount-bucket":
        return (inv) => amountBucketKey(inv.amount);
      default:
        return (inv) => inv.status || "unknown";
    }
  }, [groupBy]);

  const labelFor = useCallback(
    (key: string) => {
      switch (groupBy) {
        case "status":
          return key.charAt(0).toUpperCase() + key.slice(1);
        case "day":
          // YYYY-MM-DD → "Apr 23, 2026" for humans.
          if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
          const d = new Date(`${key}T00:00:00Z`);
          return d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        case "amount-bucket": {
          const b = AMOUNT_BUCKETS.find((x) => x.key === key);
          return b ? b.label : key;
        }
        default:
          return key;
      }
    },
    [groupBy],
  );

  // Group ordering: for "day" and amount-bucket we want a specific order
  // (date desc, bucket ascending); for status/customer fall back to alpha.
  const { order, groupOrder } = useMemo<{
    order: "alpha" | "custom";
    groupOrder?: (a: Group<SerializedInvoice>, b: Group<SerializedInvoice>) => number;
  }>(() => {
    if (groupBy === "day") {
      return {
        order: "custom",
        // ISO date keys compare lexically in the same order as temporally,
        // so descending sort = newest first.
        groupOrder: (a, b) => b.key.localeCompare(a.key),
      };
    }
    if (groupBy === "amount-bucket") {
      const idx = new Map(AMOUNT_BUCKETS.map((b, i) => [b.key, i]));
      return {
        order: "custom",
        groupOrder: (a, b) =>
          (idx.get(a.key) ?? 999) - (idx.get(b.key) ?? 999),
      };
    }
    return { order: "alpha" };
  }, [groupBy]);

  return (
    <GroupedList
      items={invoices}
      groupBy={partitioner}
      labelFor={labelFor}
      order={order}
      groupOrder={groupOrder}
      renderRow={() => null /* unused — we render whole-group tables below */}
      renderGroupBody={(g) => (
        // Render the full InvoiceTable for each bucket. This keeps the
        // table internals (checkboxes, status pills, sort headers) intact
        // without touching invoice-table.tsx. The tradeoff: each group has
        // its own <thead>. That's consistent with "grouped list" expectations
        // in most dashboards and makes column widths self-adjust per bucket.
        <div style={{ padding: "0 0 6px" }}>
          <InvoiceTable
            invoices={g.items}
            selection={selection}
            onRowClick={onRowClick}
            openRowId={openRowId}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
            onStatusChanged={onStatusChanged}
          />
        </div>
      )}
    />
  );
}
