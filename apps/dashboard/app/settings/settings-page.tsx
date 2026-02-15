"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

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

export function SettingsPage() {
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/pay/health");
      if (response.ok) {
        setHealth(await response.json());
        setError(null);
      } else {
        const data = await response.json();
        setError(data.error || "Health check failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const sectionStyle: React.CSSProperties = {
    marginBottom: "2rem",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "0.5rem",
  };

  const valueStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "0.85rem",
    wordBreak: "break-all",
    color: "var(--text-secondary)",
    padding: "0.5rem 0.75rem",
    backgroundColor: "var(--bg)",
    borderRadius: "6px",
    border: "1px solid var(--border)",
  };

  return (
    <DashboardShell>
      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          Settings
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Wallet connection and configuration
        </p>
      </div>

      {/* Connection status */}
      <div className="card" style={sectionStyle}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
          Connection Status
        </h3>

        {error ? (
          <div
            style={{
              padding: "1rem",
              backgroundColor: "rgba(239, 68, 68, 0.05)",
              borderRadius: "8px",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            <p style={{ color: "var(--danger)", fontWeight: 500, fontSize: "0.875rem" }}>
              Connection Error
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
              {error}
            </p>
            <button
              className="btn btn-secondary"
              onClick={fetchHealth}
              style={{ marginTop: "0.75rem", fontSize: "0.8rem" }}
            >
              Retry
            </button>
          </div>
        ) : health ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <p style={labelStyle}>Engine</p>
                <div style={valueStyle}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor:
                        health.engine === "running" ? "var(--success)" : "var(--danger)",
                      marginRight: "0.5rem",
                    }}
                  />
                  {health.engine}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <p style={labelStyle}>Status</p>
                <div style={valueStyle}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor:
                        health.status === "ok" ? "var(--success)" : "var(--danger)",
                      marginRight: "0.5rem",
                    }}
                  />
                  {health.status}
                </div>
              </div>
            </div>

            <div>
              <p style={labelStyle}>Wallet Address</p>
              <div style={valueStyle}>{health.wallet.address}</div>
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <p style={labelStyle}>Balance</p>
                <div style={valueStyle}>{formatDero(health.wallet.balance)} DERO</div>
              </div>
              <div style={{ flex: 1 }}>
                <p style={labelStyle}>Unlocked Balance</p>
                <div style={valueStyle}>
                  {formatDero(health.wallet.unlockedBalance)} DERO
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        )}
      </div>

      {/* Configuration */}
      <div className="card" style={sectionStyle}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
          Configuration
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "1rem" }}>
          These values are set via environment variables. Edit your{" "}
          <code style={{ color: "var(--text-secondary)" }}>.env.local</code> file and restart.
        </p>

        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            color: "var(--text-secondary)",
          }}
        >
          <code>WALLET_RPC_URL=http://127.0.0.1:10103/json_rpc</code>
          <code>DAEMON_RPC_URL=http://127.0.0.1:10102/json_rpc</code>
          <code>RPC_USERNAME= (optional)</code>
          <code>RPC_PASSWORD= (optional)</code>
          <code>WEBHOOK_URL= (optional)</code>
          <code>WEBHOOK_SECRET= (optional)</code>
          <code>DEFAULT_TTL_SECONDS=900</code>
          <code>DEFAULT_CONFIRMATIONS=3</code>
          <code>POLL_INTERVAL_MS=5000</code>
        </div>
      </div>

      {/* API info */}
      <div className="card" style={sectionStyle}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
          API Endpoints
        </h3>
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            fontSize: "0.85rem",
          }}
        >
          {[
            { method: "POST", path: "/api/pay/create", desc: "Create a new invoice" },
            { method: "GET", path: "/api/pay/status?invoiceId=xxx", desc: "Get invoice status" },
            { method: "GET", path: "/api/pay/invoices", desc: "List invoices" },
            { method: "GET", path: "/api/pay/stats", desc: "Get statistics" },
            { method: "GET", path: "/api/pay/health", desc: "Health check" },
          ].map((endpoint) => (
            <div
              key={endpoint.path}
              style={{
                display: "flex",
                gap: "1rem",
                alignItems: "baseline",
                padding: "0.5rem 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.7rem",
                  padding: "0.125rem 0.5rem",
                  borderRadius: "4px",
                  backgroundColor:
                    endpoint.method === "POST"
                      ? "rgba(59, 130, 246, 0.15)"
                      : "rgba(16, 185, 129, 0.15)",
                  color:
                    endpoint.method === "POST" ? "#60a5fa" : "#34d399",
                  fontWeight: 600,
                }}
              >
                {endpoint.method}
              </span>
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.8rem",
                  color: "var(--text-primary)",
                }}
              >
                {endpoint.path}
              </code>
              <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                {endpoint.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
