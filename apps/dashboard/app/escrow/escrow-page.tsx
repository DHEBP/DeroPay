"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X, Check, AlertCircle, LayoutGrid, Rows3 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EscrowTable } from "@/components/escrow-table";
import { CreateEscrowForm } from "@/components/create-escrow-form";
import { KpiTile } from "@/components/kpi-tile";
import { walkData } from "@/components/sparkline";
import { Button, ListShell, EyebrowLabel } from "@/components/ui";
import { EscrowDetailDrawer } from "@/components/escrow/EscrowDetailDrawer";
import {
  EscrowKanban,
  type EscrowAction,
  type EscrowCard,
  type EscrowLane,
} from "@/components/escrow/EscrowKanban";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { useDrawerParam } from "@/lib/useDrawerParam";
import { useQueryParam } from "@/lib/useQueryParam";
import { truncate } from "@/lib/format";

type SerializedEscrow = Parameters<typeof EscrowTable>[0]["invoices"][number];

type ViewMode = "kanban" | "list";

// Map the raw escrowStatus from the server to the 4 Kanban lanes.
// Keep in sync with EscrowKanban's comment. Terminal-ish states
// (refunded / expired_claimed / arbitrated) live in the Released lane
// because they represent "this escrow has reached a settled outcome".
function laneFromStatus(status: string): EscrowLane {
  switch (status) {
    case "funded":
      return "funded";
    case "disputed":
      return "disputed";
    case "released":
    case "refunded":
    case "expired_claimed":
    case "arbitrated":
      return "released";
    case "deploying":
    case "awaiting_deposit":
    case "deploy_failed":
    default:
      return "proposed";
  }
}

function toCard(inv: SerializedEscrow): EscrowCard | null {
  const escrow = inv.escrow;
  if (!escrow) return null;
  const rawStatus = escrow.escrowStatus ?? "unknown";
  const counterparty = escrow.buyerAddress
    ? `Buyer · ${truncate(escrow.buyerAddress, 8, 6)}`
    : `Seller · ${truncate(escrow.sellerAddress, 8, 6)}`;
  const created = new Date(inv.createdAt).getTime();
  return {
    id: inv.id,
    scid: escrow.scid,
    amount: inv.amount,
    counterparty,
    state: laneFromStatus(rawStatus),
    rawStatus,
    age: Number.isFinite(created) ? Date.now() - created : 0,
  };
}

export function EscrowPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // View mode persisted in `?view=kanban|list`. Default: kanban.
  const [viewParam, setViewParam] = useQueryParam("view", "kanban");
  const view: ViewMode = viewParam === "list" ? "list" : "kanban";
  const setView = (v: ViewMode) => setViewParam(v);

  // Drawer state lives in `?drawer=escrow:<id>` (shared grammar across
  // list pages — see useDrawerParam). id is `scid ?? local_id`. We only
  // act on targets whose entityType matches this page.
  const { target: drawerTarget, openDrawer, closeDrawer } = useDrawerParam();
  const openId =
    drawerTarget && drawerTarget.entityType === "escrow"
      ? drawerTarget.entityId
      : "";

  // Kanban subscribes to escrow.* SSE events; list view falls back to
  // poll-only so we don't double-fetch when toggling. Using the same key
  // for both means useLiveFetch's shared cache serves whichever is mounted.
  const {
    data: escrows,
    error: fetchError,
    loading: fetchLoading,
    refresh,
  } = useLiveFetch<SerializedEscrow[]>(
    "escrows",
    async () => {
      const r = await fetch("/api/pay/escrows?limit=50");
      if (!r.ok)
        throw new Error(
          "Couldn't reach the payment gateway (HTTP " + r.status + ")",
        );
      return (await r.json()) as SerializedEscrow[];
    },
    {
      refreshInterval: view === "kanban" ? 30_000 : 10_000,
      events: view === "kanban" ? ["escrow.*"] : undefined,
    },
  );

  const handleAction = useCallback(
    async (invoiceId: string, action: string) => {
      const key = `${invoiceId}-${action}`;
      setActionLoading(key);
      setActionResult(null);

      try {
        const response = await fetch("/api/pay/escrow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId, action }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(
            (data as Record<string, string>).error || `HTTP ${response.status}`,
          );
        }

        const result = (await response.json()) as { txid: string };
        setActionResult({
          type: "success",
          message: `Action "${action}" succeeded · tx ${result.txid.slice(0, 10)}…`,
        });
        void refresh();
      } catch (err) {
        setActionResult({
          type: "error",
          message: err instanceof Error ? err.message : "Action failed",
        });
      } finally {
        setActionLoading(null);
      }
    },
    [refresh],
  );

  // Kanban drop handler — same endpoint, awaits completion so the
  // Kanban can revert its optimistic move on failure. We intentionally
  // re-use handleAction's surface (toast banner) for the happy path, but
  // throw on failure so EscrowKanban can roll back.
  const handleStateChange = useCallback(
    async (
      id: string,
      _from: EscrowLane,
      _to: EscrowLane,
      action: EscrowAction,
    ) => {
      const key = `${id}-${action}`;
      setActionLoading(key);
      setActionResult(null);
      try {
        const response = await fetch("/api/pay/escrow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: id, action }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as Record<
            string,
            string
          >;
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        const result = (await response.json()) as { txid: string };
        setActionResult({
          type: "success",
          message: `${action} succeeded · tx ${result.txid.slice(0, 10)}…`,
        });
        void refresh();
      } finally {
        setActionLoading(null);
      }
    },
    [refresh],
  );

  const rows = escrows ?? [];
  const stats = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((e) => {
        const status = e.escrow?.escrowStatus ?? "";
        return !["released", "refunded", "expired_claimed", "arbitrated", "deploy_failed"].includes(
          status,
        );
      }).length,
      disputed: rows.filter((e) => e.escrow?.escrowStatus === "disputed").length,
      completed: rows.filter((e) => {
        const status = e.escrow?.escrowStatus ?? "";
        return ["released", "expired_claimed", "arbitrated"].includes(status);
      }).length,
    };
  }, [rows]);

  const cards = useMemo<EscrowCard[]>(() => {
    const out: EscrowCard[] = [];
    for (const inv of rows) {
      const c = toCard(inv);
      if (c) out.push(c);
    }
    return out;
  }, [rows]);

  const selectedEscrow = useMemo(
    () => (openId ? rows.find((e) => e.id === openId) ?? null : null),
    [rows, openId],
  );

  const hasError = escrows === null && !!fetchError;

  const viewToggle = (
    <ViewToggle view={view} onChange={setView} />
  );

  const primaryAction = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {viewToggle}
      <Button
        variant={showCreateForm ? "ghost" : "primary"}
        leftIcon={showCreateForm ? <X size={13} /> : <Plus size={13} />}
        onClick={() => setShowCreateForm(!showCreateForm)}
      >
        {showCreateForm ? "Cancel" : "New Escrow"}
      </Button>
    </div>
  );

  return (
    <DashboardShell>
      <ListShell
        index="03"
        eyebrow="Escrow"
        title="Buyer-protected channels."
        subtitle="Smart-contract invoices with programmable release, refund, and arbitration. Each escrow is its own on-chain SCID."
        primaryAction={primaryAction}
        drawer={
          showCreateForm && (
            <div className="surface corner-ticks" style={{ padding: "22px 22px 18px" }}>
              <div style={{ marginBottom: 14 }}>
                <EyebrowLabel tone="accent">Deploy Escrow Contract</EyebrowLabel>
              </div>
              <CreateEscrowForm
                onCreated={() => {
                  setShowCreateForm(false);
                  void refresh();
                }}
              />
            </div>
          )
        }
        beforeTable={
          hasError ? undefined : (
            <>
              <div className="grid-4-2-1" style={{ marginBottom: 20 }}>
                <KpiTile
                  label="Total"
                  countUp={stats.total}
                  suffix="contracts"
                  tone="neutral"
                  spark={walkData(1, 20, 0.03, 0.1)}
                />
                <KpiTile
                  label="Active"
                  countUp={stats.active}
                  suffix="open"
                  tone="info"
                  spark={walkData(2, 20, 0.05, 0.12)}
                />
                <KpiTile
                  label="Disputed"
                  countUp={stats.disputed}
                  suffix="held"
                  tone="warn"
                  spark={walkData(3, 20, -0.02, 0.18)}
                />
                <KpiTile
                  label="Settled"
                  countUp={stats.completed}
                  suffix="released"
                  tone="positive"
                  spark={walkData(4, 20, 0.06, 0.08)}
                />
              </div>

              <AnimatePresence>
                {actionResult && (
                  <motion.div
                    key={actionResult.message}
                    role={actionResult.type === "error" ? "alert" : "status"}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "11px 14px",
                      borderRadius: "var(--radius)",
                      marginBottom: 16,
                      background:
                        actionResult.type === "success"
                          ? "var(--dero-wash)"
                          : "var(--vermilion-wash)",
                      border: `1px solid ${
                        actionResult.type === "success"
                          ? "var(--dero-hair)"
                          : "rgba(224, 93, 68, 0.3)"
                      }`,
                      color:
                        actionResult.type === "success"
                          ? "var(--dero)"
                          : "var(--vermilion)",
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {actionResult.type === "success" ? (
                      <Check size={14} />
                    ) : (
                      <AlertCircle size={14} />
                    )}
                    <span style={{ flex: 1, wordBreak: "break-all" }}>
                      {actionResult.message}
                    </span>
                    <button
                      onClick={() => setActionResult(null)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "inherit",
                        cursor: "pointer",
                        display: "inline-flex",
                        padding: 2,
                      }}
                      aria-label="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )
        }
        error={hasError ? fetchError : null}
        onRetry={() => void refresh()}
      >
        {view === "kanban" ? (
          <EscrowKanban
            escrows={cards}
            loading={fetchLoading && cards.length === 0}
            onCardClick={(id) =>
              openDrawer({ entityType: "escrow", entityId: id })
            }
            onStateChange={handleStateChange}
          />
        ) : (
          <EscrowTable
            invoices={rows}
            onRowClick={(inv) =>
              openDrawer({ entityType: "escrow", entityId: inv.id })
            }
            openRowId={openId || null}
          />
        )}
      </ListShell>

      <EscrowDetailDrawer
        invoice={selectedEscrow}
        onClose={closeDrawer}
        onAction={handleAction}
        actionLoading={actionLoading}
        initialTab={drawerTarget?.tab}
      />
    </DashboardShell>
  );
}

// ---------------------------------------------------------------------------
// View toggle — small pill-switch styled to match the rest of the chrome.
// ---------------------------------------------------------------------------

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Escrow view"
      style={{
        display: "inline-flex",
        background: "var(--ink)",
        border: "1px solid var(--ink-hair)",
        borderRadius: "var(--radius)",
        padding: 2,
        gap: 2,
      }}
    >
      <ViewToggleButton
        label="Kanban"
        icon={<LayoutGrid size={12} />}
        active={view === "kanban"}
        onClick={() => onChange("kanban")}
      />
      <ViewToggleButton
        label="List"
        icon={<Rows3 size={12} />}
        active={view === "list"}
        onClick={() => onChange("list")}
      />
    </div>
  );
}

function ViewToggleButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        fontSize: 11,
        letterSpacing: "0.08em",
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        background: active ? "var(--ink-elev-2)" : "transparent",
        border: `1px solid ${active ? "var(--dero-hair)" : "transparent"}`,
        borderRadius: 4,
        color: active ? "var(--bone)" : "var(--bone-mute)",
        cursor: "pointer",
        transition:
          "background 120ms ease, color 120ms ease, border-color 120ms ease",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
