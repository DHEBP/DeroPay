"use client";

/**
 * InvoiceProvenanceSection — "05 · Provenance" block on the invoice drawer.
 *
 * The DERO-distinctive part of the invoice detail: once a payment is
 * detected the row surfaces the on-chain txid, block height, ring size,
 * confirmation progress, and deep-links to both the canonical explorer
 * and the HyperGnomon indexer.
 *
 * The section is wired to the shared SSE feed (`invoice.confirming` /
 * `invoice.confirmed`) so confirmation counts tick up without a page
 * refresh, and falls back to a 30s poll when SSE drops.
 */
import { useCallback, useMemo, useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { useToast } from "@/components/toast";
import { formatDero, truncate } from "@/lib/format";

type ProvenanceRecord = {
  txid: string;
  amount: string;
  confirmations: number;
  blockHeight: number | null;
  blockHash: string | null;
  ringSize: number | null;
  fee: string | null;
  timestamp: number | null;
  inPool?: boolean;
};

type ProvenanceResponse = {
  invoiceId: string;
  provenance: ProvenanceRecord[];
};

type Props = {
  invoiceId: string;
  /** Required confirmation depth for the invoice. Drives the progress bar
   *  in the "Confirmations" column; falls back to 3 when not provided
   *  (matches the engine's default). */
  targetConfirmations?: number;
};

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://explorer.dero.io";
const GNOMON_URL =
  process.env.NEXT_PUBLIC_GNOMON_URL ?? "https://gnomon.io";

export function InvoiceProvenanceSection({
  invoiceId,
  targetConfirmations = 3,
}: Props) {
  const key = invoiceId ? `provenance:${invoiceId}` : null;
  const { data, error, loading } = useLiveFetch<ProvenanceResponse>(
    key,
    async () => {
      const r = await fetch(
        `/api/pay/provenance/${encodeURIComponent(invoiceId)}`,
      );
      if (!r.ok) throw new Error(`provenance http ${r.status}`);
      return (await r.json()) as ProvenanceResponse;
    },
    {
      refreshInterval: 30_000,
      events: ["invoice.confirming", "invoice.confirmed", "invoice.detected"],
    },
  );

  const rows = data?.provenance ?? [];
  const anyConfirming = rows.some(
    (r) => r.confirmations < targetConfirmations && !r.inPool,
  );
  const anyPending = rows.some((r) => r.inPool);
  const headerPulse = anyConfirming || anyPending;

  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          className="eyebrow-mono"
          style={{ color: "var(--bone-mute)" }}
        >
          05 · Provenance
        </span>
        {headerPulse && (
          <span
            aria-label="Awaiting confirmations"
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--amber, #d6a34a)",
              boxShadow: "0 0 0 0 rgba(214, 163, 74, 0.6)",
              animation: "dp-pulse-dot 1.6s ease-in-out infinite",
            }}
          />
        )}
      </div>

      {loading && rows.length === 0 && !error && <ProvenanceSkeleton />}

      {error && (
        <div
          role="alert"
          style={{
            padding: "10px 12px",
            border: "1px solid var(--ink-hair)",
            borderRadius: "var(--radius)",
            fontSize: 12,
            color: "var(--bone-dim)",
            background: "var(--ink-deep)",
          }}
        >
          Couldn&apos;t load provenance ({error.message}).
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div
          style={{
            padding: "12px 14px",
            border: "1px dashed var(--ink-hair)",
            borderRadius: "var(--radius)",
            color: "var(--bone-mute)",
            fontSize: 12.5,
            fontStyle: "italic",
          }}
        >
          Awaiting first payment
        </div>
      )}

      {rows.length > 0 && (
        <div
          style={{
            borderRadius: "var(--radius)",
            border: "1px solid var(--ink-hair)",
            overflow: "hidden",
            background: "var(--ink-deep)",
          }}
        >
          <ProvenanceHeader />
          {rows.map((row, i) => (
            <ProvenanceRow
              key={row.txid}
              row={row}
              target={targetConfirmations}
              striped={i % 2 === 1}
              isLast={i === rows.length - 1}
            />
          ))}
        </div>
      )}

      {/* Local keyframe: reuse the same dot pulse used by StatusPill without
          pulling in a shared class. Scoped to this mount via inline style. */}
      <style jsx>{`
        @keyframes dp-pulse-dot {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(214, 163, 74, 0.55);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 5px rgba(214, 163, 74, 0);
            transform: scale(1.15);
          }
        }
      `}</style>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row                                                                       */
/* -------------------------------------------------------------------------- */

const COL_TEMPLATE =
  "minmax(0, 1.6fr) 0.9fr 0.9fr 0.6fr 1.1fr auto";

function ProvenanceHeader() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COL_TEMPLATE,
        gap: 10,
        padding: "8px 12px",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--bone-mute)",
        borderBottom: "1px solid var(--ink-hair)",
        background: "var(--ink-elev, var(--ink-deep))",
      }}
    >
      <span>TxID</span>
      <span style={{ textAlign: "right" }}>Amount</span>
      <span style={{ textAlign: "right" }}>Block</span>
      <span style={{ textAlign: "right" }}>Ring</span>
      <span>Conf</span>
      <span>Link</span>
    </div>
  );
}

function ProvenanceRow({
  row,
  target,
  striped,
  isLast,
}: {
  row: ProvenanceRecord;
  target: number;
  striped: boolean;
  isLast: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COL_TEMPLATE,
        gap: 10,
        padding: "10px 12px",
        alignItems: "center",
        fontSize: 11.5,
        borderBottom: isLast ? "none" : "1px solid var(--ink-hair)",
        background: striped ? "var(--ink-elev, transparent)" : "transparent",
      }}
    >
      <TxidCell txid={row.txid} />
      <span
        className="mono"
        style={{
          color: "var(--dero)",
          fontSize: 11.5,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatDero(row.amount, 5)}
      </span>
      <span
        className="mono"
        style={{
          color: row.blockHeight != null ? "var(--bone)" : "var(--bone-mute)",
          fontSize: 11,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
        title={row.blockHash ?? undefined}
      >
        {row.blockHeight != null
          ? row.blockHeight.toLocaleString()
          : row.inPool
            ? "mempool"
            : "—"}
      </span>
      <span
        className="mono"
        style={{
          color: row.ringSize != null ? "var(--bone)" : "var(--bone-mute)",
          fontSize: 11,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {row.ringSize != null ? row.ringSize : "—"}
      </span>
      <ConfirmationsCell
        confirmations={row.confirmations}
        target={target}
        inPool={row.inPool ?? false}
      />
      <LinkCell txid={row.txid} />
    </div>
  );
}

function TxidCell({ txid }: { txid: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(txid);
      setCopied(true);
      toast({ title: "TxID copied", tone: "success", ttl: 1400 });
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast({ title: "Clipboard unavailable", tone: "error" });
    }
  }, [txid, toast]);
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy transaction ID"
      title={txid}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "transparent",
        border: 0,
        padding: 0,
        margin: 0,
        cursor: "pointer",
        color: "var(--bone)",
        font: "inherit",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <code
        className="mono"
        style={{
          color: "var(--bone)",
          fontSize: 10.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {truncate(txid, 8, 6)}
      </code>
      {copied ? (
        <Check size={11} color="var(--dero)" aria-hidden />
      ) : (
        <Copy size={11} color="var(--bone-mute)" aria-hidden />
      )}
    </button>
  );
}

function ConfirmationsCell({
  confirmations,
  target,
  inPool,
}: {
  confirmations: number;
  target: number;
  inPool: boolean;
}) {
  const safeTarget = Math.max(1, target);
  const ratio = Math.max(0, Math.min(1, confirmations / safeTarget));
  const done = confirmations >= safeTarget;
  const fill = done
    ? "var(--dero)"
    : inPool
      ? "var(--bone-mute)"
      : "var(--amber, #d6a34a)";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
      aria-label={
        inPool
          ? "In mempool, awaiting inclusion"
          : `${confirmations} of ${safeTarget} confirmations`
      }
    >
      <span
        className="mono"
        style={{
          fontSize: 10.5,
          color: done ? "var(--dero)" : "var(--bone-dim)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {inPool ? "mempool" : `${confirmations}/${safeTarget}`}
      </span>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeTarget}
        aria-valuenow={confirmations}
        style={{
          height: 3,
          background: "var(--ink-hair)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.round(ratio * 100)}%`,
            height: "100%",
            background: fill,
            transition: "width 0.4s var(--ease-out)",
          }}
        />
      </div>
    </div>
  );
}

function LinkCell({ txid }: { txid: string }) {
  const explorerHref = useMemo(
    () => `${EXPLORER_URL.replace(/\/+$/, "")}/tx/${txid}`,
    [txid],
  );
  const gnomonHref = useMemo(
    () => `${GNOMON_URL.replace(/\/+$/, "")}/tx/${txid}`,
    [txid],
  );
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        justifyContent: "flex-end",
      }}
    >
      <ExternalIconLink
        href={explorerHref}
        label="Open in DERO explorer"
        abbrev="Exp"
      />
      <ExternalIconLink
        href={gnomonHref}
        label="Open in HyperGnomon"
        abbrev="Gno"
      />
    </span>
  );
}

function ExternalIconLink({
  href,
  label,
  abbrev,
}: {
  href: string;
  label: string;
  abbrev: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10.5,
        letterSpacing: "0.04em",
        color: "var(--bone-dim)",
        textDecoration: "none",
        padding: "2px 6px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--ink-hair)",
        transition:
          "border-color 0.12s, color 0.12s, background 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--dero-hair)";
        e.currentTarget.style.color = "var(--bone)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--ink-hair)";
        e.currentTarget.style.color = "var(--bone-dim)";
      }}
    >
      <span className="mono" aria-hidden>
        {abbrev}
      </span>
      <ExternalLink size={10} aria-hidden />
    </a>
  );
}

function ProvenanceSkeleton() {
  return (
    <div
      style={{
        borderRadius: "var(--radius)",
        border: "1px solid var(--ink-hair)",
        overflow: "hidden",
      }}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            padding: "12px 14px",
            borderBottom: i === 0 ? "1px solid var(--ink-hair)" : "none",
            display: "grid",
            gridTemplateColumns: "1.4fr 0.6fr 0.8fr 0.5fr 0.8fr auto",
            gap: 10,
            alignItems: "center",
          }}
        >
          <Shimmer width="80%" />
          <Shimmer width="70%" align="right" />
          <Shimmer width="70%" align="right" />
          <Shimmer width="40%" align="right" />
          <Shimmer width="90%" />
          <Shimmer width={46} />
        </div>
      ))}
    </div>
  );
}

function Shimmer({
  width,
  align,
}: {
  width: number | string;
  align?: "left" | "right";
}) {
  return (
    <span
      style={{
        display: "inline-block",
        height: 10,
        width,
        borderRadius: 4,
        background: "var(--ink-hair)",
        marginLeft: align === "right" ? "auto" : 0,
        opacity: 0.7,
      }}
      aria-hidden
    />
  );
}
