"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatCard } from "@/components/stat-card";
import { InvoiceTable } from "@/components/invoice-table";

type Stats = {
  total: number;
  created: number;
  pending: number;
  confirming: number;
  completed: number;
  expired: number;
  partial: number;
  totalAmountReceived: string;
};

type Health = {
  status: string;
  engine: string;
  wallet: {
    address: string;
    balance: string;
    unlockedBalance: string;
  };
} | null;

function formatDero(atomic: string): string {
  const value = BigInt(atomic || "0");
  const whole = value / 1_000_000_000_000n;
  const frac = value % 1_000_000_000_000n;
  const fracStr = frac.toString().padStart(12, "0").slice(0, 5);
  return `${whole}.${fracStr}`;
}

export function DashboardHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<Health>(null);
  const [recentInvoices, setRecentInvoices] = useState<unknown[]>([]);
  const [healthError, setHealthError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, healthRes, invoicesRes] = await Promise.allSettled([
        fetch("/api/pay/stats"),
        fetch("/api/pay/health"),
        fetch("/api/pay/invoices?limit=10"),
      ]);

      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        setStats(await statsRes.value.json());
      }

      if (healthRes.status === "fulfilled") {
        if (healthRes.value.ok) {
          setHealth(await healthRes.value.json());
          setHealthError(null);
        } else {
          const err = await healthRes.value.json();
          setHealthError(err.error || "Wallet unreachable");
        }
      }

      if (invoicesRes.status === "fulfilled" && invoicesRes.value.ok) {
        setRecentInvoices(await invoicesRes.value.json());
      }
    } catch {
      // Silently handle fetch errors — dashboard still renders
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <DashboardShell>
      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          Dashboard
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Payment processing overview
        </p>
      </div>

      {/* Health status */}
      {healthError && (
        <div
          className="card"
          style={{
            marginBottom: "1.5rem",
            borderColor: "var(--danger)",
            backgroundColor: "rgba(239, 68, 68, 0.05)",
          }}
        >
          <p style={{ color: "var(--danger)", fontSize: "0.875rem", fontWeight: 500 }}>
            Wallet Connection Error
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
            {healthError}. Make sure the DERO wallet and daemon are running.
          </p>
        </div>
      )}

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <StatCard
          label="Total Received"
          value={stats ? `${formatDero(stats.totalAmountReceived)}` : "--"}
          subValue="DERO"
          color="var(--success)"
        />
        <StatCard
          label="Completed"
          value={stats?.completed ?? "--"}
          subValue="invoices"
          color="var(--success)"
        />
        <StatCard
          label="Pending"
          value={stats ? stats.pending + stats.confirming : "--"}
          subValue="awaiting payment"
          color="var(--warning)"
        />
        <StatCard
          label="Wallet Balance"
          value={health ? formatDero(health.wallet.balance) : "--"}
          subValue="DERO"
        />
      </div>

      {/* Wallet info */}
      {health && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
            Wallet Address
          </p>
          <code
            className="mono"
            style={{
              fontSize: "0.75rem",
              wordBreak: "break-all",
              color: "var(--text-secondary)",
            }}
          >
            {health.wallet.address}
          </code>
        </div>
      )}

      {/* Recent invoices */}
      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Recent Invoices</h3>
          <a
            href="/invoices"
            style={{
              fontSize: "0.8rem",
              color: "var(--accent)",
            }}
          >
            View All
          </a>
        </div>
        <InvoiceTable invoices={recentInvoices as Parameters<typeof InvoiceTable>[0]["invoices"]} />
      </div>
    </DashboardShell>
  );
}
