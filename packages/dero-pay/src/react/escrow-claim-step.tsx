/**
 * Escrow CLAIM step — Gate 2 of two-phase escrow (buyer-facing).
 *
 * An open escrow invoice starts in "quoted": the contract is NOT yet deployed and
 * NO buyer is bound. Before the buyer can deposit, they must CLAIM the invoice —
 * this binds their address as the on-chain refund/dispute-payout target and
 * triggers the contract deploy, moving the escrow to "awaiting_deposit".
 *
 * The bound address is load-bearing: refunds and dispute payouts go to THIS
 * address. So the primary path is a self-proving wallet connect (XSWD returns the
 * running wallet's own base address — the buyer cannot fat-finger someone else's).
 * A collapsed manual fallback exists for buyers without a browser wallet; it
 * format-checks the address and forces an explicit LARGE-print confirmation before
 * the claim can fire. Both paths reject deto1… (integrated) addresses, which the
 * contract cannot match against SIGNER() on-chain.
 *
 * Must be used within a `<DeroPayProvider>`.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDeroPayContext } from "./provider.js";
import { atomicToDero } from "../core/pricing.js";
import type { Invoice } from "../core/types.js";

const ACCENT = "#31df90";

/** dero1… base address only — mirrors escrow/contract.ts assertDeroAddress. */
const DERO_BASE_ADDRESS = /^dero1[0-9a-z]{40,}$/i;
const DERO_INTEGRATED_ADDRESS = /^deto1[0-9a-z]{40,}$/i;

/** Props for the EscrowClaimStep component. */
export type EscrowClaimStepProps = {
  /** The quoted escrow invoice to claim. Its escrow.escrowStatus should be "quoted". */
  invoice: Invoice;
  /** Server endpoint for the claim POST (default: /api/pay/escrow/claim). */
  claimEndpoint?: string;
  /** Server endpoint for invoice status polling (default: /api/pay/status). */
  statusEndpoint?: string;
  /** Polling interval in ms while awaiting the deploy→awaiting_deposit transition (default: 4000). */
  pollIntervalMs?: number;
  /** Additional CSS class names. */
  className?: string;
  /** Custom styles. */
  style?: React.CSSProperties;
  /**
   * Fired once the escrow reaches "awaiting_deposit" with an SCID present — i.e.
   * the contract is live and bound to the buyer. Receives the fresh invoice so the
   * parent can hand off to the deposit UI (EscrowInvoiceView).
   */
  onClaimed?: (invoice: Invoice) => void;
  /** Callback on error. */
  onError?: (error: string) => void;
};

type Phase = "collect" | "confirm" | "claiming" | "deploying";

/**
 * Buyer CLAIM step for a quoted escrow invoice.
 *
 * ```tsx
 * <EscrowClaimStep
 *   invoice={invoice}
 *   onClaimed={(inv) => setInvoice(inv)}   // hand off to EscrowInvoiceView
 * />
 * ```
 */
export function EscrowClaimStep({
  invoice,
  claimEndpoint,
  statusEndpoint,
  pollIntervalMs = 4000,
  className,
  style,
  onClaimed,
  onError,
}: EscrowClaimStepProps) {
  const {
    walletStatus,
    walletAddress,
    connectWallet,
    isLoading: ctxLoading,
  } = useDeroPayContext();

  const claimUrl = claimEndpoint ?? "/api/pay/escrow/claim";
  const statusUrl = statusEndpoint ?? "/api/pay/status";

  const [phase, setPhase] = useState<Phase>("collect");
  const [buyerAddress, setBuyerAddress] = useState<string>("");
  /** Whether the current address was self-proven via wallet connect (locked). */
  const [proven, setProven] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Stable machine code from the server on the last error (e.g. "budget_exhausted"). */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [deployTxid, setDeployTxid] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settledRef = useRef(false);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  // If the wallet connects/changes elsewhere, adopt the proven address.
  useEffect(() => {
    if (walletStatus === "connected" && walletAddress) {
      setBuyerAddress(walletAddress);
      setProven(true);
      setShowManual(false);
      setError(null);
    }
  }, [walletStatus, walletAddress]);

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      const address = await connectWallet();
      setBuyerAddress(address);
      setProven(true);
      setShowManual(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to connect wallet";
      setError(msg);
      onError?.(msg);
    }
  }, [connectWallet, onError]);

  // Manual entry: validate format, then move to the LARGE-print confirm step.
  const handleManualContinue = useCallback(() => {
    const addr = manualInput.trim();
    if (DERO_INTEGRATED_ADDRESS.test(addr)) {
      setError(
        "That is an integrated (deto1…) address. Escrow needs your base wallet address (dero1…)."
      );
      return;
    }
    if (!DERO_BASE_ADDRESS.test(addr)) {
      setError("That does not look like a DERO address (must start with dero1…).");
      return;
    }
    setError(null);
    setBuyerAddress(addr);
    setProven(false);
    setPhase("confirm");
  }, [manualInput]);

  // Poll status until the escrow deploys and binds → awaiting_deposit + scid.
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const res = await fetch(
          `${statusUrl}?invoiceId=${encodeURIComponent(invoice.id)}`
        );
        if (!res.ok) return; // transient; keep polling
        const data = (await res.json()) as Invoice;
        // Deserialize BigInt fields (mirrors EscrowInvoiceView).
        data.amount = BigInt(data.amount);
        data.amountReceived = BigInt(data.amountReceived);
        data.paymentId = BigInt(data.paymentId);
        const esc = data.escrow;
        if (
          esc &&
          esc.escrowStatus === "awaiting_deposit" &&
          esc.scid &&
          !settledRef.current
        ) {
          settledRef.current = true;
          if (pollRef.current) clearInterval(pollRef.current);
          onClaimed?.(data);
        } else if (esc && esc.escrowStatus === "deploy_failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase("collect");
          const msg =
            "Escrow contract deployment failed. You can retry the claim.";
          setError(msg);
          onError?.(msg);
        }
      } catch {
        // network blip — keep polling
      }
    };
    void tick();
    pollRef.current = setInterval(tick, pollIntervalMs);
  }, [statusUrl, invoice.id, pollIntervalMs, onClaimed, onError]);

  const submitClaim = useCallback(async () => {
    if (!buyerAddress) return;
    setPhase("claiming");
    setError(null);
    setErrorCode(null);
    settledRef.current = false;
    try {
      const res = await fetch(claimUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, buyerAddress }),
      });

      if (res.status === 409) {
        // Already claimed (another tab/worker won the race). Before adopting that
        // race winner, verify the escrow was bound to THE SAME address this user
        // proved/entered. The 409 body carries the current serialized invoice; if
        // its escrow.buyerAddress differs, the invoice now routes refunds/dispute
        // payouts to SOMEONE ELSE — we must NOT seamlessly hand the buyer onward to
        // deposit (they would deposit into a contract whose refund target is not
        // theirs). Warn and stop instead. Only auto-continue when the bound address
        // matches, or when the server did not return a bound address yet (deploy
        // still in flight — safe to poll, the address gets confirmed there).
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          invoice?: { escrow?: { buyerAddress?: string | null } };
        };
        const boundAddress = body.invoice?.escrow?.buyerAddress ?? null;
        if (
          boundAddress &&
          boundAddress.toLowerCase() !== buyerAddress.toLowerCase()
        ) {
          const msg =
            "This invoice was already claimed by a DIFFERENT address. Do not deposit — refunds and dispute payouts would go to that other wallet, not yours.";
          setError(msg);
          onError?.(msg);
          setPhase(proven ? "collect" : "confirm");
          return;
        }
        // Same address (or not yet bound): the deploy is happening/done — poll for
        // the awaiting_deposit state.
        setPhase("deploying");
        startPolling();
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        // Capture the stable machine code (e.g. "budget_exhausted") so the render
        // path can branch on it instead of substring-matching the human message.
        if (body.code) setErrorCode(body.code);
        throw new Error(body.error ?? `Claim failed (HTTP ${res.status})`);
      }

      // A 200 means the deploy was BROADCAST — the returned invoice carries the
      // deploy txid/scid, but "done" is the escrowStatus === awaiting_deposit
      // transition, which we still confirm by polling (the POST returning is not
      // itself success). If the response already shows awaiting_deposit we settle
      // immediately; otherwise we poll.
      const data = (await res.json()) as Invoice;
      data.amount = BigInt(data.amount);
      data.amountReceived = BigInt(data.amountReceived);
      data.paymentId = BigInt(data.paymentId);
      setDeployTxid(data.escrow?.deployTxid ?? null);
      if (
        data.escrow?.escrowStatus === "awaiting_deposit" &&
        data.escrow.scid
      ) {
        settledRef.current = true;
        onClaimed?.(data);
        return;
      }
      setPhase("deploying");
      startPolling();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Claim failed";
      setError(msg);
      onError?.(msg);
      setPhase(proven ? "collect" : "confirm");
    }
  }, [buyerAddress, claimUrl, invoice.id, proven, startPolling, onClaimed, onError]);

  const escrow = invoice.escrow;
  const feePct = escrow ? escrow.feeBasisPoints / 100 : 0;
  // Prefer the stable server code; fall back to substring-matching the message
  // for older servers that don't yet return a code.
  const budgetExhausted =
    errorCode === "budget_exhausted" ||
    (!!error &&
      /budget exhausted|too many times|contact support|parked/i.test(error));

  // ---- Render ------------------------------------------------------------

  return (
    <div className={className} style={{ ...containerStyle, ...style }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <div style={badgeStyle}>Escrow · Claim</div>
        <h3 style={{ margin: "0 0 0.25rem", fontSize: "1.125rem", fontWeight: 600 }}>
          {invoice.name}
        </h3>
        <p style={{ margin: 0, color: "#8a94a6", fontSize: "0.85rem" }}>
          Bind your address, then deposit into escrow.
        </p>
      </div>

      {/* Amount */}
      <div style={amountBoxStyle}>
        <span style={{ fontSize: "1.6rem", fontWeight: 700 }}>
          {atomicToDero(invoice.amount)}
        </span>
        <span style={{ fontSize: "0.95rem", color: "#8a94a6", marginLeft: "0.5rem" }}>
          DERO
        </span>
        <div style={{ fontSize: "0.72rem", color: "#8a94a6", marginTop: "0.25rem" }}>
          Escrow fee: {feePct}% · seller-borne on release
        </div>
      </div>

      {/* Progress bar (Connect → Confirm → Deploy) */}
      <ProgressBar phase={phase} proven={proven} />

      {/* Error block (reused idiom from EscrowInvoiceView) */}
      {error && (
        <div style={budgetExhausted ? errorBlockAlarm : errorBlock}>
          {error}
          {budgetExhausted && (
            <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", opacity: 0.9 }}>
              This escrow could not be deployed after several attempts. Please
              contact support to resolve it — do not deposit any funds.
            </div>
          )}
        </div>
      )}

      {/* Deploying state */}
      {(phase === "deploying" || phase === "claiming") && (
        <div style={deployingBox}>
          <Spinner />
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              {phase === "claiming"
                ? "Submitting claim…"
                : "Deploying escrow contract…"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#8a94a6", marginTop: "2px" }}>
              This binds your address on-chain. It can take a few blocks.
            </div>
            {deployTxid && (
              <div style={txidStyle}>tx: {deployTxid}</div>
            )}
          </div>
        </div>
      )}

      {/* Collect phase — connect wallet (primary) + manual fallback */}
      {phase === "collect" && !budgetExhausted && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {proven ? (
            <div style={provenBox}>
              <div style={{ fontSize: "0.7rem", color: ACCENT, fontWeight: 600, letterSpacing: "0.04em" }}>
                WALLET CONNECTED · SELF-PROVEN
              </div>
              <div style={provenAddress}>{buyerAddress}</div>
              <div style={{ fontSize: "0.72rem", color: "#8a94a6" }}>
                Refunds and dispute payouts will go to this address.
              </div>
            </div>
          ) : (
            <>
              <ClaimButton
                label="Connect Wallet"
                onClick={handleConnect}
                loading={ctxLoading}
                disabled={ctxLoading}
                primary
              />
              {!showManual ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowManual(true);
                    setError(null);
                  }}
                  style={linkButtonStyle}
                >
                  No wallet? Enter your DERO address
                </button>
              ) : (
                <div style={manualBox}>
                  <label style={fieldLabel}>Your DERO base address (dero1…)</label>
                  <input
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="dero1qy…"
                    spellCheck={false}
                    autoCapitalize="none"
                    style={inputStyle}
                  />
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <ClaimButton
                      label="Continue"
                      onClick={handleManualContinue}
                      loading={false}
                      disabled={!manualInput.trim()}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowManual(false);
                        setManualInput("");
                        setError(null);
                      }}
                      style={ghostButtonStyle}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Proven wallet ready → Claim. Suppressed when an error is showing so
              the dedicated "Retry Claim" button below is the ONLY primary button
              on a failed attempt (avoids two stacked green claim buttons). */}
          {proven && !error && (
            <ClaimButton
              label="Claim & Deploy Escrow"
              onClick={submitClaim}
              loading={false}
              disabled={!buyerAddress}
              primary
            />
          )}
        </div>
      )}

      {/* Confirm phase — LARGE-print manual address confirmation */}
      {phase === "confirm" && !budgetExhausted && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={confirmWarnBox}>
            <div style={{ fontSize: "0.72rem", color: "#f5a623", fontWeight: 700, letterSpacing: "0.04em" }}>
              ⚠ DOUBLE-CHECK THIS ADDRESS
            </div>
            <div style={confirmAddress}>{buyerAddress}</div>
            <div style={{ fontSize: "0.78rem", color: "#c9cfda" }}>
              Funds and refunds are tied to <strong>THIS address</strong>. If it is
              wrong, a refund or dispute payout could go to someone else and be
              unrecoverable. Confirm it matches your wallet exactly.
            </div>
          </div>
          <ClaimButton
            label="Address is correct — Claim & Deploy"
            onClick={submitClaim}
            loading={false}
            disabled={false}
            primary
          />
          <button
            type="button"
            onClick={() => {
              setPhase("collect");
              setShowManual(true);
            }}
            style={ghostButtonStyle}
          >
            Go back and edit
          </button>
        </div>
      )}

      {/* Retry after a deploy failure (non-terminal) */}
      {phase === "collect" && error && !budgetExhausted && buyerAddress && (
        <div style={{ marginTop: "0.75rem" }}>
          <ClaimButton
            label="Retry Claim"
            onClick={submitClaim}
            loading={false}
            disabled={false}
            primary
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ClaimButton({
  label,
  onClick,
  loading,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: "0.7rem 1rem",
        fontSize: "0.9rem",
        fontWeight: 600,
        border: primary ? "none" : "1px solid rgba(255,255,255,0.14)",
        borderRadius: "10px",
        cursor: disabled || loading ? "default" : "pointer",
        backgroundColor: primary ? ACCENT : "transparent",
        color: primary ? "#04120b" : "#e7ebf2",
        opacity: disabled || loading ? 0.55 : 1,
        transition: "opacity 0.2s, transform 0.1s",
        width: "100%",
      }}
    >
      {loading ? "Processing…" : label}
    </button>
  );
}

function ProgressBar({ phase, proven }: { phase: Phase; proven: boolean }) {
  // 3 conceptual steps: identify → confirm → deploy.
  let done = 0;
  if (phase === "confirm" || (phase === "collect" && proven)) done = 1;
  if (phase === "claiming") done = 2;
  if (phase === "deploying") done = 3;
  const pct = (done / 3) * 100;
  return (
    <div
      style={{
        height: "4px",
        borderRadius: "2px",
        background: "rgba(255,255,255,0.08)",
        overflow: "hidden",
        margin: "0.5rem 0 1rem",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: ACCENT,
          transition: "width 0.35s ease",
        }}
      />
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: "18px",
        height: "18px",
        borderRadius: "50%",
        border: `2px solid rgba(49,223,144,0.25)`,
        borderTopColor: ACCENT,
        animation: "deropay-spin 0.8s linear infinite",
        flex: "none",
      }}
    >
      <style>{"@keyframes deropay-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — dark HUD idiom, accent #31df90 (matches apps/web tokens)
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  maxWidth: "480px",
  margin: "0 auto",
  padding: "1.5rem",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(12,16,20,0.9)",
  color: "#e7ebf2",
  fontFamily: "system-ui, -apple-system, sans-serif",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.25rem 0.75rem",
  borderRadius: "999px",
  background: "rgba(49,223,144,0.12)",
  color: ACCENT,
  fontSize: "0.7rem",
  fontWeight: 600,
  marginBottom: "0.5rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const amountBoxStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "1rem",
  background: "rgba(255,255,255,0.03)",
  borderRadius: "12px",
  marginBottom: "0.5rem",
};

const errorBlock: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  background: "rgba(245,166,35,0.1)",
  color: "#f5a623",
  border: "1px solid rgba(245,166,35,0.25)",
  borderRadius: "8px",
  fontSize: "0.8rem",
  marginBottom: "1rem",
};

const errorBlockAlarm: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  background: "rgba(239,68,68,0.1)",
  color: "#ef4444",
  border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: "8px",
  fontSize: "0.8rem",
  marginBottom: "1rem",
};

const deployingBox: React.CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "flex-start",
  padding: "0.85rem",
  background: "rgba(49,223,144,0.06)",
  border: "1px solid rgba(49,223,144,0.18)",
  borderRadius: "10px",
  marginBottom: "1rem",
};

const txidStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "0.68rem",
  color: "#8a94a6",
  wordBreak: "break-all",
  marginTop: "4px",
};

const provenBox: React.CSSProperties = {
  padding: "0.85rem",
  background: "rgba(49,223,144,0.06)",
  border: "1px solid rgba(49,223,144,0.22)",
  borderRadius: "10px",
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const provenAddress: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "0.8rem",
  color: "#e7ebf2",
  wordBreak: "break-all",
  lineHeight: 1.4,
};

const manualBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "0.85rem",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "10px",
};

const fieldLabel: React.CSSProperties = {
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#8a94a6",
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  padding: "0.6rem 0.7rem",
  fontSize: "0.85rem",
  fontFamily: "ui-monospace, monospace",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(0,0,0,0.3)",
  color: "#e7ebf2",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const confirmWarnBox: React.CSSProperties = {
  padding: "1rem",
  background: "rgba(245,166,35,0.08)",
  border: "1px solid rgba(245,166,35,0.3)",
  borderRadius: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
};

const confirmAddress: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "1rem",
  fontWeight: 600,
  color: "#ffffff",
  wordBreak: "break-all",
  lineHeight: 1.5,
  padding: "0.5rem 0.6rem",
  background: "rgba(0,0,0,0.35)",
  borderRadius: "8px",
};

const linkButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#8a94a6",
  fontSize: "0.82rem",
  fontWeight: 500,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
  padding: "0.2rem",
};

const ghostButtonStyle: React.CSSProperties = {
  padding: "0.7rem 1rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "10px",
  background: "transparent",
  color: "#c9cfda",
  cursor: "pointer",
  width: "100%",
};
