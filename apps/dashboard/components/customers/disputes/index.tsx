"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispute, DisputeStatus } from "@/lib/commerce-types";
import { useToast } from "@/components/toast";
import { useInitialTestMode } from "@/lib/test-mode-context";
import {
  apiFetch,
  DEMO_DISPUTES,
  type StatusFilter,
} from "./shared";
import { DisputeFilters } from "./Filters";
import { DisputeList } from "./List";
import { EmptyCard, LoadingCard } from "./Empty";
import {
  ConfirmStatusModal,
  CreateDisputeModal,
  RefundDisputeModal,
} from "./Modals";

export interface DisputesTabProps {
  /** Base URL for invoice links. Defaults to `/invoices`. */
  gatewayInvoiceLinkBase?: string;
}

export function DisputesTab({
  gatewayInvoiceLinkBase = "/invoices",
}: DisputesTabProps) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();

  const [disputes, setDisputes] = useState<Dispute[]>(
    isDemo ? DEMO_DISPUTES : [],
  );
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [showCreate, setShowCreate] = useState(false);
  const [refundTarget, setRefundTarget] = useState<Dispute | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{
    dispute: Dispute;
    next: Extract<DisputeStatus, "resolved" | "lost">;
  } | null>(null);

  const fetchDisputes = useCallback(async () => {
    if (isDemo) {
      setDisputes(DEMO_DISPUTES);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    const path = `/api/pay/customers/disputes${
      qs.toString() ? `?${qs}` : ""
    }`;
    const result = await apiFetch<{ disputes: Dispute[] }>(path);
    if (result.ok) {
      setDisputes(result.value?.disputes ?? []);
    } else {
      setError(result.error);
      setDisputes([]);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const visible = useMemo(() => {
    if (!isDemo) return disputes;
    if (statusFilter === "all") return disputes;
    return disputes.filter((d) => d.status === statusFilter);
  }, [disputes, statusFilter]);

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = {
      all: disputes.length,
      open: 0,
      under_review: 0,
      resolved: 0,
      resolved_merchant_favor: 0,
      resolved_customer_favor: 0,
      withdrawn: 0,
      lost: 0,
      refunded: 0,
    };
    for (const d of disputes) base[d.status] += 1;
    return base;
  }, [disputes]);

  const updateLocal = useCallback(
    (id: string, patch: Partial<Dispute>) => {
      setDisputes((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      );
    },
    [],
  );

  const doStatusChange = useCallback(
    async (dispute: Dispute, next: DisputeStatus) => {
      if (isDemo) {
        updateLocal(dispute.id, {
          status: next,
          resolvedAt:
            next === "resolved" || next === "lost" || next === "refunded"
              ? Date.now()
              : dispute.resolvedAt ?? null,
        });
        toast({
          title: `Dispute marked ${next.replace("_", " ")}`,
          tone: "success",
        });
        return true;
      }
      const result = await apiFetch<Dispute>(
        `/api/pay/customers/disputes/${encodeURIComponent(
          dispute.id,
        )}/status`,
        {
          method: "POST",
          body: JSON.stringify({ status: next }),
        },
      );
      if (!result.ok) {
        toast({
          title: "Status update failed",
          description: result.error,
          tone: "error",
        });
        return false;
      }
      toast({
        title: `Dispute marked ${next.replace("_", " ")}`,
        tone: "success",
      });
      fetchDisputes();
      return true;
    },
    [fetchDisputes, toast, updateLocal],
  );

  return (
    <div>
      <DisputeFilters
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        counts={counts}
        visibleCount={visible.length}
        onCreate={() => setShowCreate(true)}
      />

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 14,
            padding: "12px 16px",
            background: "var(--vermilion-wash)",
            border: "1px solid rgba(224,93,68,0.28)",
            borderRadius: "var(--radius-sm)",
            color: "var(--bone)",
            fontSize: 12.5,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-ghost btn-mini"
            onClick={fetchDisputes}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <LoadingCard label="Loading disputes…" />
      ) : visible.length === 0 ? (
        <EmptyCard onCreate={() => setShowCreate(true)} />
      ) : (
        <DisputeList
          visible={visible}
          gatewayInvoiceLinkBase={gatewayInvoiceLinkBase}
          onResolveClick={(d) =>
            setConfirmStatus({ dispute: d, next: "resolved" })
          }
          onLostClick={(d) => setConfirmStatus({ dispute: d, next: "lost" })}
          onRefundClick={(d) => setRefundTarget(d)}
        />
      )}

      <CreateDisputeModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(d) => {
          if (isDemo) {
            setDisputes((prev) => [d, ...prev]);
          } else {
            fetchDisputes();
          }
          setShowCreate(false);
          toast({ title: "Dispute created", tone: "success" });
        }}
      />

      <ConfirmStatusModal
        target={confirmStatus}
        onClose={() => setConfirmStatus(null)}
        onConfirm={async () => {
          if (!confirmStatus) return;
          const ok = await doStatusChange(
            confirmStatus.dispute,
            confirmStatus.next,
          );
          if (ok) setConfirmStatus(null);
        }}
      />

      <RefundDisputeModal
        target={refundTarget}
        onClose={() => setRefundTarget(null)}
        onRefunded={(updated) => {
          if (isDemo) {
            updateLocal(updated.id, updated);
          } else {
            fetchDisputes();
          }
          setRefundTarget(null);
        }}
      />
    </div>
  );
}
