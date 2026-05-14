"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  CircleCheck,
  CircleAlert,
  Copy,
  Check,
  Zap,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { InvoiceTemplatesSection } from "@/components/invoice-templates-section";
import { PanelHeader, EyebrowLabel, StatusDot } from "@/components/ui";
import { formatDero } from "@/lib/format";

type Health = {
  status: string;
  engine: string;
  wallet: {
    address: string;
    balance: string;
    unlockedBalance: string;
  };
} | null;

export function SettingsPage() {
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [x402RailOn, setX402RailOn] = useState(false);

  useEffect(() => {
    const stored = typeof window === "undefined" ? null : localStorage.getItem("deropay.x402.advertise");
    if (stored === "1") setX402RailOn(true);
  }, []);

  const toggleX402Rail = useCallback(() => {
    setX402RailOn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("deropay.x402.advertise", next ? "1" : "0");
      } catch {
      }
      return next;
    });
  }, []);

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

  const copyAddr = async () => {
    if (!health) return;
    try {
      await navigator.clipboard.writeText(health.wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* silent */
    }
  };

  const endpoints: { method: "GET" | "POST"; path: string; desc: string }[] = [
    { method: "POST", path: "/api/pay/create", desc: "Create a new invoice" },
    { method: "GET", path: "/api/pay/status?invoiceId=…", desc: "Fetch invoice status" },
    { method: "GET", path: "/api/pay/invoices", desc: "List invoices" },
    { method: "GET", path: "/api/pay/stats", desc: "Get aggregate statistics" },
    { method: "GET", path: "/api/pay/health", desc: "Wallet / daemon health check" },
    { method: "POST", path: "/api/pay/escrow", desc: "Perform an escrow action" },
    { method: "GET", path: "/api/pay/escrows", desc: "List escrow invoices" },
  ];

  const envVars: { key: string; value: string; note?: string }[] = [
    { key: "WALLET_RPC_URL", value: "http://localhost:10103/json_rpc" },
    { key: "DAEMON_RPC_URL", value: "http://localhost:10102/json_rpc" },
    { key: "RPC_USERNAME", value: "—", note: "optional" },
    { key: "RPC_PASSWORD", value: "—", note: "optional" },
    { key: "WEBHOOK_URL", value: "—", note: "optional" },
    { key: "WEBHOOK_SECRET", value: "—", note: "optional" },
    { key: "DEFAULT_TTL_SECONDS", value: "900" },
    { key: "DEFAULT_CONFIRMATIONS", value: "3" },
    { key: "POLL_INTERVAL_MS", value: "5000" },
    { key: "MEMPOOL_POLL_INTERVAL_MS", value: "2000" },
    {
      key: "MEMPOOL_POLL_ENABLED",
      value: "true",
      note: "fast mempool live feed",
    },
  ];

  return (
    <DashboardShell>
      <PageHeader
        index="04"
        eyebrow="Settings"
        title="Station diagnostics."
        subtitle="Wallet connection, runtime configuration, and the API surface you'll integrate from your storefront."
        action={
          <button
            className="btn btn-ghost"
            onClick={fetchHealth}
            title="Re-check connection"
          >
            <RefreshCw size={13} />
            Recheck
          </button>
        }
      />

      {/* Connection panel */}
      <motion.section
        id="connection"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="surface corner-ticks"
        style={{ padding: "22px 24px", marginBottom: 20, scrollMarginTop: 24 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 18,
          }}
        >
          <span className="eyebrow">
            <span style={{ color: "var(--bone-quiet)" }}>a</span>
            <span style={{ margin: "0 6px", color: "var(--bone-quiet)" }}>·</span>
            Connection
          </span>
          <span aria-hidden style={{ flex: 1, height: 1, background: "var(--ink-hair)" }} />
        </div>

        {error ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "14px 16px",
                borderRadius: "var(--radius)",
                background: "var(--vermilion-wash)",
                border: "1px solid rgba(224, 93, 68, 0.3)",
              }}
            >
              <CircleAlert size={16} color="var(--vermilion)" style={{ marginTop: 1 }} />
              <div>
                <div
                  className="eyebrow"
                  style={{ color: "var(--vermilion)", marginBottom: 4 }}
                >
                  Connection Failed
                </div>
                <div style={{ fontSize: 12, color: "var(--bone-dim)" }}>{error}</div>
              </div>
            </div>
            <TroubleshootPanel />
          </div>
        ) : health ? (
          <div style={{ display: "grid", gap: 18 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 16,
              }}
            >
              <StatusCell
                label="Engine"
                value={health.engine}
                ok={health.engine === "running"}
              />
              <StatusCell
                label="Status"
                value={health.status}
                ok={health.status === "ok"}
              />
            </div>

            <div>
              <div
                className="eyebrow"
                style={{ marginBottom: 6 }}
              >
                Wallet Address
              </div>
              <button
                onClick={copyAddr}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--ink-deep)",
                  border: "1px solid var(--ink-hair)",
                  borderRadius: "var(--radius)",
                  color: "var(--bone-dim)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  wordBreak: "break-all",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s var(--ease-out)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = "var(--dero-hair)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = "var(--ink-hair)")
                }
              >
                <span style={{ flex: 1 }}>{health.wallet.address}</span>
                <span
                  style={{
                    color: copied ? "var(--dero)" : "var(--bone-mute)",
                    display: "inline-flex",
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </span>
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 16,
              }}
            >
              <BalanceCell
                label="Total Balance"
                atomic={health.wallet.balance}
              />
              <BalanceCell
                label="Unlocked"
                atomic={health.wallet.unlockedBalance}
                accent
              />
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "18px 4px",
              color: "var(--bone-quiet)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Probing wallet…
          </div>
        )}
      </motion.section>

      {/* Configuration */}
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="surface"
        style={{ padding: "22px 24px", marginBottom: 20 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <span className="eyebrow">
            <span style={{ color: "var(--bone-quiet)" }}>b</span>
            <span style={{ margin: "0 6px", color: "var(--bone-quiet)" }}>·</span>
            Environment
          </span>
          <span aria-hidden style={{ flex: 1, height: 1, background: "var(--ink-hair)" }} />
        </div>
        <p
          style={{
            fontSize: 12,
            color: "var(--bone-dim)",
            marginBottom: 14,
          }}
        >
          These values are read from{" "}
          <code
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--bone)",
              fontSize: 11.5,
            }}
          >
            .env.local
          </code>
          . Changes require restart.
        </p>

        <div
          style={{
            border: "1px solid var(--ink-hair)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
          }}
        >
          {envVars.map((v, i) => (
            <div
              key={v.key}
              style={{
                display: "grid",
                gridTemplateColumns: "220px 1fr auto",
                gap: 12,
                padding: "10px 14px",
                background:
                  i % 2 === 0 ? "var(--ink-deep)" : "transparent",
                borderBottom:
                  i < envVars.length - 1
                    ? "1px solid var(--ink-hair)"
                    : "none",
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                alignItems: "center",
              }}
            >
              <span style={{ color: "var(--bone-dim)" }}>{v.key}</span>
              <span style={{ color: "var(--bone)" }}>{v.value}</span>
              {v.note && (
                <span
                  style={{
                    color: "var(--bone-quiet)",
                    fontSize: 9.5,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                  }}
                >
                  {v.note}
                </span>
              )}
            </div>
          ))}
        </div>
      </motion.section>

      {/* Invoice Templates */}
      <InvoiceTemplatesSection />

      {/* API */}
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="surface"
        style={{ padding: "22px 24px" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <span className="eyebrow">
            <span style={{ color: "var(--bone-quiet)" }}>c</span>
            <span style={{ margin: "0 6px", color: "var(--bone-quiet)" }}>·</span>
            API Surface
          </span>
          <span aria-hidden style={{ flex: 1, height: 1, background: "var(--ink-hair)" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {endpoints.map((e, i) => (
            <div
              key={e.path}
              style={{
                display: "grid",
                gridTemplateColumns: "72px 1fr auto",
                gap: 14,
                alignItems: "center",
                padding: "9px 10px",
                borderBottom:
                  i < endpoints.length - 1
                    ? "1px dashed var(--ink-hair)"
                    : "none",
                fontSize: 12,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.2em",
                  color: e.method === "POST" ? "var(--cobalt)" : "var(--dero)",
                  padding: "3px 8px",
                  borderRadius: 4,
                  background:
                    e.method === "POST"
                      ? "var(--cobalt-wash)"
                      : "var(--dero-wash)",
                  border: `1px solid ${
                    e.method === "POST"
                      ? "rgba(106,161,255,0.25)"
                      : "var(--dero-hair)"
                  }`,
                  textAlign: "center",
                  justifySelf: "start",
                }}
              >
                {e.method}
              </span>
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--bone)",
                  fontSize: 11.5,
                }}
              >
                {e.path}
              </code>
              <span
                style={{
                  color: "var(--bone-quiet)",
                  fontSize: 11,
                }}
              >
                {e.desc}
              </span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Agent Payments (x402) */}
      <motion.section
        id="agent-payments"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12 }}
        className="surface"
        style={{ marginTop: 20, padding: 0, overflow: "hidden", scrollMarginTop: 24 }}
      >
        <PanelHeader
          glyph="bolt"
          title="Agent Payments (x402)"
          description="Accept HTTP-native payments from AI agents over the Dero rail. Privacy-preserving by default — no off-chain identity required."
          meta={<EyebrowLabel tone="accent">beta</EyebrowLabel>}
          actions={
            <StatusDot
              tone={x402RailOn ? "live" : "idle"}
              pulse={x402RailOn}
              ariaLabel={x402RailOn ? "Rail status: live" : "Rail status: idle"}
            />
          }
        />
        <div style={{ padding: "20px 24px 22px", display: "grid", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "14px 16px",
              border: "1px solid var(--ink-hair)",
              borderRadius: "var(--radius)",
              background: "var(--ink-elev)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "var(--bone)", fontSize: 13.5, fontWeight: 500, marginBottom: 4 }}>
                Advertise the x402 rail
              </div>
              <div style={{ color: "var(--bone-mute)", fontSize: 12, lineHeight: 1.5 }}>
                Your 402 responses will include a <code className="mono">dero-exact</code> entry pointing at your facilitator.
              </div>
            </div>
            <button
              type="button"
              onClick={toggleX402Rail}
              aria-pressed={x402RailOn}
              style={{
                position: "relative",
                width: 38,
                height: 22,
                borderRadius: 999,
                border: `1px solid ${x402RailOn ? "var(--dero-hair)" : "var(--ink-hair)"}`,
                background: x402RailOn ? "var(--dero-wash)" : "var(--ink-deep)",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 180ms var(--ease-out), border-color 180ms var(--ease-out)",
              }}
              aria-label={x402RailOn ? "Disable x402 rail advertising" : "Enable x402 rail advertising"}
            >
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 2,
                  left: 2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: x402RailOn ? "var(--dero)" : "var(--bone-quiet)",
                  transform: x402RailOn ? "translateX(16px)" : "translateX(0)",
                  transition:
                    "transform 180ms var(--ease-out), background 180ms var(--ease-out)",
                }}
              />
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <EyebrowLabel tone="dim">Embed snippet</EyebrowLabel>
            <pre
              className="mono"
              style={{
                margin: 0,
                padding: "14px 16px",
                background: "var(--ink-deep)",
                border: "1px solid var(--ink-hair)",
                borderRadius: "var(--radius)",
                color: "var(--bone-dim)",
                fontSize: 12,
                lineHeight: 1.6,
                overflowX: "auto",
              }}
            >
{`{
  "x402Version": 1,
  "accepts": [{
    "scheme": "dero-exact",
    "network": "dero-mainnet",
    "asset": "DERO",
    "payTo": "<your-receipt-scid>",
    "maxAmountRequired": "1000",
    "extra": { "merchantId": "your-shop", "orderId": "<uuid>" }
  }]
}`}
            </pre>
            <div style={{ color: "var(--bone-quiet)", fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
              <Zap size={12} /> Paste this into your 402 response. Agents will discover the rail and pay via your facilitator.
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <a href="/payments/agent" className="btn-link" style={{ textDecoration: "none" }}>
              View settlement log →
            </a>
            <span aria-hidden style={{ color: "var(--bone-quiet)" }}>·</span>
            <a href="https://x402.org" className="btn-link" style={{ textDecoration: "none" }}>
              x402 protocol docs ↗
            </a>
          </div>
        </div>
      </motion.section>
    </DashboardShell>
  );
}

function StatusCell({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "var(--ink-deep)",
          border: `1px solid ${ok ? "var(--dero-hair)" : "rgba(224,93,68,0.3)"}`,
          borderRadius: "var(--radius)",
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          color: ok ? "var(--dero)" : "var(--vermilion)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {ok ? <CircleCheck size={13} /> : <CircleAlert size={13} />}
        <span>{value}</span>
      </div>
    </div>
  );
}

function TroubleshootPanel() {
  const snippets = [
    {
      label: "Start derod (daemon)",
      cmd: "derod-linux-amd64 --rpc-bind=localhost:10102",
    },
    {
      label: "Start walletd (wallet RPC)",
      cmd: "dero-wallet-cli-linux-amd64 --rpc-server --rpc-bind=localhost:10103 --wallet-file=my.wallet",
    },
    {
      label: "Test wallet RPC reachability",
      cmd: 'curl -s -u user:pass http://localhost:10103/json_rpc -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","id":1,"method":"GetAddress"}\'',
    },
  ];
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--ink-hair)",
        background: "var(--ink-deep)",
      }}
    >
      <div className="eyebrow-mono" style={{ marginBottom: 10, color: "var(--bone-mute)" }}>
        Troubleshoot
      </div>
      <div style={{ fontSize: 12.5, color: "var(--bone-dim)", lineHeight: 1.55, marginBottom: 12 }}>
        The dashboard reaches walletd at{" "}
        <code style={{ fontFamily: "var(--font-mono)", color: "var(--bone)" }}>
          WALLET_RPC_URL
        </code>{" "}
        and derod at{" "}
        <code style={{ fontFamily: "var(--font-mono)", color: "var(--bone)" }}>
          DAEMON_RPC_URL
        </code>
        . Confirm both are running and bound to the right host/port.
      </div>
      <ol style={{ margin: 0, padding: "0 0 0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {snippets.map((s) => (
          <li key={s.label} style={{ listStyleType: "decimal", color: "var(--bone-mute)" }}>
            <div style={{ fontSize: 12, color: "var(--bone-dim)", marginBottom: 4 }}>
              {s.label}
            </div>
            <code
              style={{
                display: "block",
                padding: "8px 10px",
                background: "var(--ink)",
                border: "1px solid var(--ink-hair)",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--bone)",
                wordBreak: "break-all",
              }}
            >
              {s.cmd}
            </code>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BalanceCell({
  label,
  atomic,
  accent,
}: {
  label: string;
  atomic: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          padding: "10px 14px",
          background: "var(--ink-deep)",
          border: "1px solid var(--ink-hair)",
          borderRadius: "var(--radius)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
          color: accent ? "var(--dero)" : "var(--bone)",
        }}
      >
        {formatDero(atomic, 5)}{" "}
        <span
          style={{
            color: "var(--bone-quiet)",
            fontSize: 9.5,
            letterSpacing: "0.2em",
          }}
        >
          DERO
        </span>
      </div>
    </div>
  );
}
