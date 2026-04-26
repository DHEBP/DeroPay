"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Copy, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { PaymentLink } from "@/lib/mock-payment-links";

type Props = {
  linkId: string;
};

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
  let value: bigint;
  try {
    value = typeof atomic === "bigint" ? atomic : BigInt(atomic);
  } catch {
    return String(atomic);
  }
  const whole = value / ATOMIC_PER_DERO;
  const frac = value % ATOMIC_PER_DERO;
  if (frac === 0n) return `${whole.toString()}.00000`;
  return `${whole.toString()}.${frac.toString().padStart(5, "0").slice(0, 5)}`;
}

function parseDeroInput(value: string): bigint | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,5}))?$/);
  if (!match) return null;
  const whole = BigInt(match[1] ?? "0");
  const frac = BigInt((match[2] ?? "").padEnd(5, "0"));
  const atomic = whole * ATOMIC_PER_DERO + frac;
  return atomic > 0n ? atomic : null;
}

function secondsUntil(iso: string): string {
  const delta = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
  const minutes = Math.floor(delta / 60);
  const seconds = delta % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function PayPage({ linkId }: Props) {
  const [state, setState] = useState<
    "loading" | "error" | "ready" | "invoice" | "confirmed"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [payerAmount, setPayerAmount] = useState("5.0");
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirectIn, setRedirectIn] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/pay/payment-links/${encodeURIComponent(linkId)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (response.status === 404) {
          setError("This payment link does not exist.");
          setState("error");
          return;
        }
        if (!response.ok) {
          setError(`Failed to load link (HTTP ${response.status})`);
          setState("error");
          return;
        }

        const data = (await response.json()) as { link: PaymentLink };
        const nextLink = data.link;
        if (nextLink.revokedAt) {
          setLink(nextLink);
          setError("This payment link has been revoked.");
          setState("error");
          return;
        }
        if (nextLink.expiresAt && nextLink.expiresAt <= Date.now()) {
          setLink(nextLink);
          setError("This payment link has expired.");
          setState("error");
          return;
        }
        const limit = nextLink.usageLimit ?? nextLink.maxUses ?? null;
        const used = nextLink.usedCount ?? nextLink.usesCount ?? 0;
        if (limit !== null && used >= limit) {
          setLink(nextLink);
          setError("This payment link has reached its usage limit.");
          setState("error");
          return;
        }

        setLink(nextLink);
        if (nextLink.amountAtomic) {
          setPayerAmount(formatDero(nextLink.amountAtomic));
        }
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

  const isPayWhatYouWant = useMemo(() => !link?.amountAtomic, [link?.amountAtomic]);

  const handlePay = useCallback(async () => {
    if (!link) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (isPayWhatYouWant) {
        const atomic = parseDeroInput(payerAmount);
        if (atomic === null) {
          setError("Enter a positive DERO amount, like 5 or 0.5.");
          setSubmitting(false);
          return;
        }
        body.amount = atomic.toString();
      }

      const response = await fetch(
        `/api/pay/payment-links/${encodeURIComponent(linkId)}/use`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        },
      );
      const data = (await response.json()) as {
        invoice?: PublicInvoice;
        error?: string;
        message?: string;
      };
      if (response.status === 410) {
        setError(data.message ?? "This link is no longer accepting payments.");
        setState("error");
        return;
      }
      if (!response.ok || !data.invoice) {
        setError(data.message ?? `Failed to create invoice (HTTP ${response.status})`);
        return;
      }
      setInvoice(data.invoice);
      setState("invoice");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }, [isPayWhatYouWant, link, linkId, payerAmount]);

  useEffect(() => {
    if (!invoice || state === "confirmed") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch(
          `/api/pay/status?invoiceId=${encodeURIComponent(invoice.id)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as PublicInvoice;
        if (cancelled) return;
        setInvoice(data);
        if (data.status === "completed") setState("confirmed");
        if (data.status === "expired") {
          setError("The invoice expired before payment was received.");
          setState("error");
        }
      } catch {
        // Let the next polling tick retry.
      }
    };
    const interval = window.setInterval(tick, 4000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [invoice, invoice?.id, state]);

  useEffect(() => {
    if (state !== "confirmed" || !link?.redirectUrl) return;
    setRedirectIn(3);
    const interval = window.setInterval(() => {
      setRedirectIn((prev) => (prev == null ? prev : prev - 1));
    }, 1000);
    const timeout = window.setTimeout(() => {
      window.location.href = link.redirectUrl!;
    }, 3000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [link?.redirectUrl, state]);

  return (
    <CheckoutCard>
      {state === "loading" && <LoadingState />}
      {state === "error" && <ErrorState message={error ?? "This link is unavailable."} />}
      {state === "ready" && link && (
        <ReadyState
          link={link}
          amount={payerAmount}
          isPayWhatYouWant={isPayWhatYouWant}
          error={error}
          submitting={submitting}
          onAmountChange={setPayerAmount}
          onPay={handlePay}
        />
      )}
      {(state === "invoice" || state === "confirmed") && invoice && (
        <InvoiceState
          invoice={invoice}
          link={link}
          confirmed={state === "confirmed"}
          redirectIn={redirectIn}
        />
      )}
    </CheckoutCard>
  );
}

const IS_DEMO_MODE =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function CheckoutCard({ children }: { children: React.ReactNode }) {
  const isDemo =
    IS_DEMO_MODE ||
    (typeof window !== "undefined" && window.location.search.includes("demo=true"));

  return (
    <section
      style={{
        width: "100%",
        maxWidth: 420,
        margin: "0 auto",
        overflow: "hidden",
        borderRadius: 16,
        background: "#0a0f0d",
        border: "1px solid rgba(37, 211, 145, 0.18)",
        boxShadow: "0 32px 80px rgba(0, 0, 0, 0.55)",
      }}
    >
      {isDemo && (
        <div
          style={{
            height: 28,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(90deg, #14b978, #25d391)",
            color: "#03120b",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.01em",
          }}
        >
          Simulation — no real DERO is transferred
        </div>
      )}
      <header
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 24px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <DeroGlyph />
        <strong style={{ color: "#f3f6ef", fontSize: 15, fontWeight: 600 }}>
          DeroPay
        </strong>
      </header>
      <div style={{ padding: "28px 24px 24px" }}>{children}</div>
      <footer
        style={{
          padding: "16px 24px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          textAlign: "center",
          color: "rgba(243, 246, 239, 0.38)",
          fontSize: 11.5,
        }}
      >
        Powered by <span style={{ color: "#25d391" }}>DeroPay</span> — Private
        payments on DERO
      </footer>
    </section>
  );
}

function ReadyState({
  link,
  amount,
  isPayWhatYouWant,
  error,
  submitting,
  onAmountChange,
  onPay,
}: {
  link: PaymentLink;
  amount: string;
  isPayWhatYouWant: boolean;
  error: string | null;
  submitting: boolean;
  onAmountChange: (value: string) => void;
  onPay: () => void;
}) {
  return (
    <div>
      <TitleBlock title={link.name} subtitle={link.description ?? undefined} />
      <div
        style={{
          padding: "16px",
          borderRadius: 12,
          background: "rgba(94, 196, 134, 0.06)",
          border: "1px solid rgba(94, 196, 134, 0.12)",
          marginBottom: 16,
          textAlign: "center",
        }}
      >
        <div style={eyebrowStyle}>Amount (DERO)</div>
        {isPayWhatYouWant ? (
          <input
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            inputMode="decimal"
            aria-label="Amount in DERO"
            style={{
              width: "100%",
              height: 48,
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              background: "#020706",
              color: "#f3f6ef",
              textAlign: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 21,
              fontWeight: 700,
              outline: "none",
            }}
          />
        ) : (
          <AmountText amount={link.amountAtomic} />
        )}
      </div>
      {error && <InlineError message={error} />}
      <PrimaryButton onClick={onPay} disabled={submitting}>
        {submitting ? "Creating invoice..." : "Pay with DERO"}
      </PrimaryButton>
    </div>
  );
}

function InvoiceState({
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
    invoice.payments?.reduce((max, payment) => Math.max(max, payment.confirmations), 0) ??
    0;
  const isDemo =
    IS_DEMO_MODE ||
    (typeof window !== "undefined" && window.location.search.includes("demo=true"));

  const handleSimulate = async () => {
    try {
      await fetch(`/api/pay/simulate?invoiceId=${encodeURIComponent(invoice.id)}`, {
        method: "POST",
      });
    } catch {
      // Simulation endpoint may not exist; ignore
    }
  };

  return (
    <div>
      <TitleBlock title={link?.name ?? invoice.name} subtitle={link?.description ?? undefined} />
      {!confirmed && (
        <div style={{ display: "grid", placeItems: "center", marginBottom: 20 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              background: "#ffffff",
              boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
            }}
          >
            <QRCodeSVG
              value={invoice.integratedAddress}
              size={200}
              bgColor="#ffffff"
              fgColor="#0a0c0a"
              level="M"
              marginSize={2}
              role="img"
              aria-label="Payment QR code"
            />
          </div>
        </div>
      )}
      <AmountText amount={invoice.amount} large />
      {!confirmed ? (
        <>
          <div style={eyebrowStyle}>Send to this address:</div>
          <AddressBlock value={invoice.integratedAddress} />
          <StatusPanel>
            {invoice.status === "confirming"
              ? `Confirming (${confirmations}/${invoice.requiredConfirmations})`
              : invoice.amountReceived && invoice.amountReceived !== "0"
                ? "Payment detected..."
                : "⏳ Waiting for payment..."}
          </StatusPanel>
          <div
            style={{
              marginTop: 10,
              color: "rgba(243,246,239,0.42)",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Expires in {secondsUntil(invoice.expiresAt)}
          </div>
          {isDemo && (
            <button
              type="button"
              onClick={handleSimulate}
              style={{
                width: "100%",
                marginTop: 14,
                height: 44,
                border: "1.5px solid #25d391",
                borderRadius: 10,
                background: "transparent",
                color: "#25d391",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Simulate Payment
            </button>
          )}
        </>
      ) : (
        <div
          style={{
            textAlign: "center",
            padding: "20px 16px",
            borderRadius: 12,
            background: "rgba(37, 211, 145, 0.08)",
            border: "1px solid rgba(37, 211, 145, 0.25)",
          }}
        >
          <Check size={36} color="#25d391" />
          <div style={{ marginTop: 8, color: "#f3f6ef", fontSize: 17, fontWeight: 700 }}>
            Payment Confirmed
          </div>
          <div style={{ marginTop: 6, color: "rgba(243,246,239,0.55)", fontSize: 13 }}>
            Thank you for paying with DERO.
          </div>
          {redirectIn !== null && link?.redirectUrl && (
            <div style={{ marginTop: 12, color: "rgba(243,246,239,0.42)", fontSize: 11.5 }}>
              Redirecting in {Math.max(0, redirectIn)}s...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ minHeight: 260, display: "grid", placeItems: "center", color: "#25d391" }}>
      <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ minHeight: 220, display: "grid", placeItems: "center", textAlign: "center" }}>
      <div>
        <div style={{ color: "#e05d44", fontSize: 36, marginBottom: 10 }}>×</div>
        <h1 style={{ margin: 0, color: "#f3f6ef", fontSize: 19 }}>Cannot accept payment</h1>
        <p style={{ margin: "8px 0 0", color: "rgba(243,246,239,0.58)", fontSize: 13 }}>
          {message}
        </p>
      </div>
    </div>
  );
}

function TitleBlock({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 20 }}>
      <h1
        style={{
          margin: 0,
          color: "#f3f6ef",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            margin: "6px auto 0",
            maxWidth: 300,
            color: "rgba(243,246,239,0.5)",
            fontSize: 13,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function AmountText({
  amount,
  large = false,
}: {
  amount: string | bigint | null | undefined;
  large?: boolean;
}) {
  return (
    <div
      style={{
        marginBottom: large ? 18 : 0,
        textAlign: "center",
        color: "#f3f6ef",
        fontFamily: "var(--font-mono)",
        fontSize: large ? 34 : 26,
        fontWeight: 800,
        letterSpacing: "-0.03em",
      }}
    >
      {formatDero(amount)}{" "}
      <span
        style={{
          color: "#25d391",
          fontSize: large ? 14 : 11,
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
      >
        DERO
      </span>
    </div>
  );
}

function AddressBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "#060a08",
        color: "#f3f6ef",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <code
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          lineHeight: 1.4,
          wordBreak: "break-all",
          color: "rgba(243,246,239,0.85)",
        }}
      >
        {value}
      </code>
      {copied ? (
        <Check size={16} color="#25d391" />
      ) : (
        <Clipboard size={16} color="rgba(243,246,239,0.45)" />
      )}
    </button>
  );
}

function StatusPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 16,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 10,
        border: "1.5px solid rgba(37,211,145,0.5)",
        background: "rgba(37,211,145,0.06)",
        color: "#f3f6ef",
        fontSize: 13.5,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        height: 48,
        border: "none",
        borderRadius: 10,
        background: "linear-gradient(90deg, #25d391, #6ae0a8)",
        color: "#03120b",
        fontWeight: 900,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.75 : 1,
      }}
    >
      {children}
    </button>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        marginBottom: 12,
        borderRadius: 8,
        background: "rgba(224, 93, 68, 0.12)",
        border: "1px solid rgba(224, 93, 68, 0.24)",
        color: "#ff947f",
        fontSize: 12.5,
      }}
    >
      {message}
    </div>
  );
}

function DeroGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={24}
      height={24}
      aria-hidden
    >
      <path
        d="M23,34.4v31.1l27,15.6,27-15.6v-31.1l-27-15.6-27,15.6ZM50,76.8l-6.1-3.5c.1-.8,2.3-14.4,2.4-15.8l-4.6-2.7v-9.6l8.3-4.8,8.3,4.8v9.6l-4.5,2.6c.2,1.4,2.3,15.1,2.4,15.8l-6.2,3.6ZM73.2,63.4l-13.4,7.7c0-.5-1.6-10.3-1.8-11.7l4.2-2.4v-14.1l-12.2-7-12.2,7v14.1l4.1,2.4c-.2,1.4-1.7,11.2-1.8,11.7l-13.3-7.7v-26.8l23.2-13.4,23.2,13.4v26.8Z"
        fill="#25d391"
      />
      <path
        d="M50,.3L7,25.2v49.7l43,24.8,43-24.8V25.2L50,.3ZM77,65.6l-27,15.6-27-15.6v-31.1l27-15.6,27,15.6v31.1Z"
        fill="#0a0f0d"
      />
      <path
        d="M26.8,36.6v26.8l13.3,7.7c0-.4,1.6-10.3,1.8-11.7l-4.1-2.4v-14.1l12.2-7,12.2,7v14.1l-4.2,2.4c.2,1.4,1.7,11.2,1.8,11.7l13.4-7.7v-26.8l-23.2-13.4-23.2,13.4Z"
        fill="#0a0f0d"
      />
      <path
        d="M58.3,54.8v-9.6l-8.3-4.8-8.3,4.8v9.6l4.6,2.7c-.2,1.4-2.3,15-2.4,15.8l6.1,3.5,6.2-3.6c-.1-.7-2.2-14.4-2.4-15.8l4.5-2.6Z"
        fill="#0a0f0d"
      />
    </svg>
  );
}

const eyebrowStyle: React.CSSProperties = {
  marginBottom: 10,
  color: "rgba(243,246,239,0.45)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};
