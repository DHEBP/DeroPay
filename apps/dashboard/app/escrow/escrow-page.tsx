"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EscrowTable } from "@/components/escrow-table";
import { CreateEscrowForm } from "@/components/create-escrow-form";

export function EscrowPage() {
  const [escrows, setEscrows] = useState<unknown[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchEscrows = useCallback(async () => {
    try {
      const response = await fetch("/api/pay/escrows?limit=50");
      if (response.ok) {
        setEscrows(await response.json());
      }
    } catch {
      // Handle silently
    }
  }, []);

  useEffect(() => {
    fetchEscrows();
    const interval = setInterval(fetchEscrows, 10_000);
    return () => clearInterval(interval);
  }, [fetchEscrows]);

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
            (data as Record<string, string>).error || `HTTP ${response.status}`
          );
        }

        const result = (await response.json()) as { txid: string };
        setActionResult({
          type: "success",
          message: `Action "${action}" succeeded. TX: ${result.txid}`,
        });
        fetchEscrows();
      } catch (err) {
        setActionResult({
          type: "error",
          message: err instanceof Error ? err.message : "Action failed",
        });
      } finally {
        setActionLoading(null);
      }
    },
    [fetchEscrows]
  );

  // Compute summary stats
  const stats = {
    total: escrows.length,
    active: escrows.filter(
      (e: unknown) =>
        !["released", "refunded", "expired_claimed", "arbitrated", "deploy_failed"].includes(
          ((e as Record<string, Record<string, string>>).escrow?.escrowStatus) ?? ""
        )
    ).length,
    disputed: escrows.filter(
      (e: unknown) =>
        ((e as Record<string, Record<string, string>>).escrow?.escrowStatus) === "disputed"
    ).length,
    completed: escrows.filter(
      (e: unknown) =>
        ["released", "expired_claimed", "arbitrated"].includes(
          ((e as Record<string, Record<string, string>>).escrow?.escrowStatus) ?? ""
        )
    ).length,
  };

  return (
    <DashboardShell>
      <div
        style={{
          marginBottom: "2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              marginBottom: "0.25rem",
            }}
          >
            Escrow Payments
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Smart contract-based escrow invoices with buyer protection
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? "Cancel" : "+ New Escrow"}
        </button>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Active" value={stats.active} color="var(--accent)" />
        <StatCard
          label="Disputed"
          value={stats.disputed}
          color="var(--danger)"
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          color="var(--success)"
        />
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              marginBottom: "1rem",
            }}
          >
            Create Escrow Invoice
          </h3>
          <CreateEscrowForm
            onCreated={() => {
              setShowCreateForm(false);
              fetchEscrows();
            }}
          />
        </div>
      )}

      {/* Action result toast */}
      {actionResult && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            marginBottom: "1rem",
            backgroundColor:
              actionResult.type === "success"
                ? "rgba(16, 185, 129, 0.1)"
                : "rgba(239, 68, 68, 0.1)",
            color:
              actionResult.type === "success"
                ? "var(--success)"
                : "var(--danger)",
            fontSize: "0.85rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            wordBreak: "break-all",
          }}
        >
          <span>{actionResult.message}</span>
          <button
            onClick={() => setActionResult(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              fontSize: "1.2rem",
              padding: "0 0.25rem",
              flexShrink: 0,
            }}
          >
            x
          </button>
        </div>
      )}

      {/* Escrow list */}
      <div className="card" style={{ padding: 0 }}>
        <EscrowTable
          invoices={
            escrows as Parameters<typeof EscrowTable>[0]["invoices"]
          }
          onAction={handleAction}
          actionLoading={actionLoading}
        />
      </div>
    </DashboardShell>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div
      className="card"
      style={{
        textAlign: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: color ?? "var(--text-primary)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          marginTop: "0.25rem",
        }}
      >
        {label}
      </div>
    </div>
  );
}
