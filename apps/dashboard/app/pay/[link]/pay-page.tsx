"use client";

/**
 * Public pay-with-link page (Phase 3 #32).
 *
 * States:
 *   1. `loading`   — fetching the link details
 *   2. `error`     — link missing / revoked / expired / over-limit
 *   3. `ready`     — show link details + "Pay with DERO" CTA (plus amount
 *                    input for pay-what-you-want links)
 *   4. `invoice`   — invoice created; QR + integrated address + live status
 *   5. `confirmed` — payment confirmed; optional redirect countdown
 *
 * Polling strategy: when an invoice exists we poll `/api/pay/status?
 * invoiceId=...` every 4s until the invoice enters a terminal state.
 * Stops on unmount.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { PaymentLink } from "@/lib/mock-payment-links";

type Props = {
  /** The `<link>` path segment — either a short token (slug) or `pl_xxx` id. */
  linkId: string;
};

/** Invoice shape post-serialization (bigints as strings). */
type PublicInvoice = {
  id: string;
  name: string;
  description: string;
  amount: string;
  status:
    | "created"
    | "pending"
    | "confirming"
    | "completed"
    | "expired"
    | "partial";
  paymentId: string;
  integratedAddress: string;
  requiredConfirmations: number;
  expiresAt: string;
  completedAt: string | null;
  amountReceived: string;
  payments?: Array<{ confirmations: number; status: string; txid: string }>;
};

const ATOMIC_PER_DERO = 100_000n;

function formatDero(atomic: string | bigint | null | undefined): string {
  if (atomic == null) return "—";
  let v: bigint;
  try {
    v = typeof atomic === "bigint" ? atomic : BigInt(atomic);
  } catch {
    return String(atomic);
  }
  const whole = v / ATOMIC_PER_DERO;
  const frac = v % ATOMIC_PER_DERO;
  if (frac === 0n) return `${whole.toString()} DERO`;
  // Trim trailing zeroes from the 12-digit fractional part.
  const fracStr = frac.toString().padStart(5, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr} DERO`;
}

export function PayPage({ linkId }: Props) {
  const [state, setState] = useState<
    "loading" | "error" | "ready" | "invoice" | "confirmed"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [payerAmount, setPayerAmount] = useState("");
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirectIn, setRedirectIn] = useState<number | null>(null);

  // Fetch the link on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/pay/payment-links/${encodeURIComponent(linkId)}`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        if (r.status === 404) {
          setError("This payment link doesn't exist.");
          setState("error");
          return;
        }
        if (!r.ok) {
          setError(`Failed to load link (HTTP ${r.status})`);
          setState("error");
          return;
        }
        const data = (await r.json()) as { link: PaymentLink };
        const l = data.link;

        if (l.revokedAt) {
          setLink(l);
          setError("This payment link has been revoked.");
          setState("error");
          return;
        }
        if (l.expiresAt && l.expiresAt <= Date.now()) {
          setLink(l);
          setError("This payment link has expired.");
          setState("error");
          return;
        }
        const limit = l.usageLimit ?? l.maxUses ?? null;
        const used = l.usedCount ?? l.usesCount ?? 0;
        if (limit !== null && used >= limit) {
          setLink(l);
          setError("This payment link has reached its usage limit.");
          setState("error");
          return;
        }

        setLink(l);
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkId]);

  const isPWYW = useMemo(() => !link?.amountAtomic, [link?.amountAtomic]);

  const handlePay = useCallback(async () => {
    if (!link) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (isPWYW) {
        const trimmed = payerAmount.trim();
        if (!trimmed) {
          setError("Enter an amount.");
          setSubmitting(false);
          return;
        }
        let atomic: bigint;
        try {
          // Parse as DERO with up to 5 decimals, convert to atomic units.
          const m = trimmed.match(/^(\d+)(?:\.(\d{1,12}))?$/);
          if (!m) throw new Error("Invalid amount format");
          const whole = BigInt(m[1]);
          const fracStr = (m[2] ?? "").padEnd(5, "0");
          atomic = whole * ATOMIC_PER_DERO + BigInt(fracStr);
          if (atomic <= 0n) throw new Error("Amount must be positive");
        } catch {
          setError("Enter a positive amount in DERO, e.g. `5` or `0.5`.");
          setSubmitting(false);
          return;
        }
        body.amount = atomic.toString();
      }
      const r = await fetch(
        `/api/pay/payment-links/${encodeURIComponent(linkId)}/use`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        }
      );
      const data = (await r.json()) as {
        invoice?: PublicInvoice;
        error?: string;
        message?: string;
      };
      if (r.status === 410) {
        setError(data.message ?? "This link is no longer accepting payments.");
        setState("error");
        return;
      }
      if (!r.ok || !data.invoice) {
        setError(data.message ?? `Failed to create invoice (HTTP ${r.status})`);
        setSubmitting(false);
        return;
      }
      setInvoice(data.invoice);
      setState("invoice");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }, [link, linkId, isPWYW, payerAmount]);

  // Poll invoice status while an invoice is alive.
  useEffect(() => {
    if (!invoice || state === "confirmed") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(
          `/api/pay/status?invoiceId=${encodeURIComponent(invoice.id)}`,
          { cache: "no-store" }
        );
        if (!r.ok) return;
        const data = (await r.json()) as PublicInvoice;
        if (cancelled) return;
        setInvoice(data);
        if (data.status === "completed") {
          setState("confirmed");
        } else if (data.status === "expired") {
          setError("The invoice expired before payment was received.");
          setState("error");
        }
      } catch {
        // Transient — let the next tick retry.
      }
    };
    const intervalId = setInterval(tick, 4000);
    // Fire one immediately so confirmation counts update quickly.
    void tick();
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [invoice, invoice?.id, state]);

  // Redirect countdown after confirmation.
  useEffect(() => {
    if (state !== "confirmed") return;
    if (!link?.redirectUrl) return;
    setRedirectIn(3);
    const t0 = setInterval(() => {
      setRedirectIn((prev) => (prev == null ? prev : prev - 1));
    }, 1000);
    const t1 = setTimeout(() => {
      window.location.href = link.redirectUrl!;
    }, 3000);
    return () => {
      clearInterval(t0);
      clearTimeout(t1);
    };
  }, [state, link?.redirectUrl]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 480,
        background: "var(--ink-elev-1)",
        border: "1px solid var(--ink-hair)",
        borderRadius: "var(--radius, 12px)",
        padding: 28,
        boxShadow:
          "0 24px 60px -28px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.25)",
      }}
    >
      {state === "loading" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 220,
            color: "var(--bone-dim)",
            fontSize: 13,
          }}
        >
          Loading…
        </div>
      )}

      {state === "error" && (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 36,
              marginBottom: 12,
              color: "var(--vermilion)",
            }}
            aria-hidden
          >
            ✕
          </div>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 600,
              margin: 0,
              marginBottom: 8,
            }}
          >
            Can't accept payment
          </h1>
          <p style={{ color: "var(--bone-dim)", fontSize: 13, margin: 0 }}>
            {error ?? "This link is unavailable."}
          </p>
        </div>
      )}

      {state === "ready" && link && (
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              margin: 0,
              marginBottom: 6,
              letterSpacing: "-0.01em",
            }}
          >
            {link.name}
          </h1>
          {link.description && (
            <p
              style={{
                color: "var(--bone-dim)",
                fontSize: 13.5,
                margin: 0,
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              {link.description}
            </p>
          )}

          <div
            style={{
              padding: "18px 16px",
              borderRadius: 10,
              background: "var(--ink-elev-2)",
              border: "1px solid var(--ink-hair)",
              marginBottom: 20,
              textAlign: "center",
            }}
          >
            {isPWYW ? (
              <>
                <div
                  style={{
                    fontSize: 10.5,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--bone-quiet)",
                    marginBottom: 10,
                  }}
                >
                  Enter amount (DERO)
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={payerAmount}
                  onChange={(e) => setPayerAmount(e.target.value)}
                  placeholder="5.0"
                  aria-label="Amount in DERO"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 22,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    textAlign: "center",
                    background: "var(--ink-deep)",
                    color: "var(--bone)",
                    border: "1px solid var(--ink-hair)",
                    borderRadius: 8,
                  }}
                />
              </>
            ) : (
              <>
                <div
                  style={{
                    fontSize: 10.5,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--bone-quiet)",
                    marginBottom: 6,
                  }}
                >
                  Amount
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {formatDero(link.amountAtomic)}
                </div>
              </>
            )}
          </div>

          {error && (
            <div
              style={{
                padding: "10px 12px",
                marginBottom: 12,
                borderRadius: 8,
                background: "rgba(224, 93, 68, 0.1)",
                color: "var(--vermilion)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handlePay}
            disabled={submitting}
            style={{
              width: "100%",
              height: 46,
              background: "var(--dero)",
              color: "var(--ink-deep)",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Creating invoice…" : "Pay with DERO"}
          </button>
        </div>
      )}

      {(state === "invoice" || state === "confirmed") && invoice && (
        <InvoiceView
          invoice={invoice}
          link={link}
          confirmed={state === "confirmed"}
          redirectIn={redirectIn}
        />
      )}
    </div>
  );
}

function InvoiceView({
  invoice,
  link,
  confirmed,
  redirectIn,
}: {
  invoice: PublicInvoice;
  link: PaymentLink | null;
  confirmed: boolean;
  redirectIn: number | null;
}) {
  const confirmations =
    invoice.payments?.reduce((m, p) => Math.max(m, p.confirmations), 0) ?? 0;
  const required = invoice.requiredConfirmations;

  return (
    <div>
      <h1
        style={{
          fontSize: 18,
          fontWeight: 600,
          margin: 0,
          marginBottom: 4,
          letterSpacing: "-0.005em",
        }}
      >
        {link?.name ?? invoice.name}
      </h1>
      <div
        style={{
          fontSize: 12,
          color: "var(--bone-mute)",
          fontFamily: "var(--font-mono)",
          marginBottom: 18,
        }}
      >
        {formatDero(invoice.amount)} ·{" "}
        {confirmed
          ? "Confirmed"
          : invoice.status === "confirming"
            ? `Confirming (${confirmations}/${required})`
            : invoice.amountReceived && invoice.amountReceived !== "0"
              ? "Detected — waiting for confirmations"
              : "Waiting for payment"}
      </div>

      {!confirmed && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            padding: 20,
            background: "#ffffff",
            borderRadius: 12,
            border: "1px solid var(--ink-hair-strong)",
            marginBottom: 16,
          }}
        >
          <QRCodeSVG
            value={invoice.integratedAddress}
            size={240}
            bgColor="#ffffff"
            fgColor="#0a0c0a"
            level="M"
            marginSize={2}
            role="img"
            aria-label="Payment QR code"
          />
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#6b6a60",
            }}
          >
            Scan with DERO wallet
          </div>
        </div>
      )}

      {confirmed ? (
        <div
          style={{
            textAlign: "center",
            padding: "18px 16px",
            borderRadius: 10,
            background: "rgba(94, 196, 134, 0.1)",
            border: "1px solid rgba(94, 196, 134, 0.3)",
          }}
        >
          <div
            style={{ fontSize: 34, color: "var(--dero)", marginBottom: 6 }}
            aria-hidden
          >
            ✓
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            Payment confirmed
          </div>
          <div style={{ fontSize: 12, color: "var(--bone-dim)" }}>
            Thank you for paying with DERO.
          </div>
          {redirectIn !== null && link?.redirectUrl && (
            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: "var(--bone-mute)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Redirecting in {Math.max(0, redirectIn)}s…
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--bone-quiet)",
              marginBottom: 6,
            }}
          >
            Integrated address
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              background: "var(--ink-elev-2)",
              padding: 10,
              borderRadius: 6,
              wordBreak: "break-all",
              color: "var(--bone)",
              border: "1px solid var(--ink-hair)",
            }}
          >
            {invoice.integratedAddress}
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(invoice.integratedAddress);
            }}
            style={{
              marginTop: 10,
              width: "100%",
              height: 36,
              background: "var(--ink-elev-2)",
              color: "var(--bone)",
              border: "1px solid var(--ink-hair)",
              borderRadius: 8,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            Copy address
          </button>
        </>
      )}
    </div>
  );
}
