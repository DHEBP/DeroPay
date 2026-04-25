"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  Check,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  Archive,
  Link2,
  Braces,
  XOctagon,
} from "lucide-react";
import { Drawer, Dialog, Button, Badge, Menu, KebabButton, type MenuAction } from "@/components/ui";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { Timeline as EventTimeline } from "@/components/timeline";
import { MetadataEditor } from "@/components/metadata-editor";
import { JsonPanel } from "@/components/json-panel";
import { formatDero, formatDate, truncate } from "@/lib/format";
import { useToast } from "@/components/toast";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { toTimelineEvent, type EventRow } from "dero-pay/events";
import { PaymentQR } from "./PaymentQR";
import { InvoiceProvenanceSection } from "./InvoiceProvenanceSection";
import { WidgetZone } from "@/components/widget-zone";

const AWAITING_STATES = new Set(["pending", "confirming", "partial", "created"]);

/** Statuses where "Mark expired" is a valid manual transition. Mirrors
 *  ALLOWED_TRANSITIONS on the server (`lib/invoice-transitions.ts`) —
 *  we keep the set inline rather than reaching for the shared constant
 *  to avoid a circular import with Button / Dialog / etc. */
const MARK_EXPIRED_STATES = new Set([
  "created",
  "pending",
  "confirming",
  "partial",
]);

type Payment = {
  txid: string;
  amount: string;
  confirmations: number;
  status: string;
};

export type InvoiceDetail = {
  id: string;
  name: string;
  description: string;
  amount: string;
  status: string;
  paymentId: string;
  integratedAddress: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  amountReceived: string;
  payments: Payment[];
  metadata?: Record<string, unknown>;
  /** Epoch ms when archived, or null. Optional so callers that don't surface
   *  archive in their list payload can omit the field entirely. */
  archivedAt?: number | null;
  /** Phase 3 #28 — linked customer profile id derived from the stealth-key
   *  fingerprint of the paying wallet. Null / omitted when the monitor
   *  hasn't resolved a payer yet (no payment received, fully anonymous
   *  ringsig tx with no wallet-decrypted sender, or legacy row). */
  customerId?: string | null;
};

type Tone = "positive" | "warn" | "info" | "danger" | "neutral";

type DrawerTab = "details" | "timeline" | "metadata";

const TAB_ITEMS = [
  { value: "details", label: "Details" },
  { value: "timeline", label: "Timeline" },
  { value: "metadata", label: "Metadata" },
];

function statusTone(status: string): { tone: Tone; pulse: boolean } {
  switch (status) {
    case "completed":
      return { tone: "positive", pulse: false };
    case "confirming":
      return { tone: "warn", pulse: true };
    case "pending":
      return { tone: "info", pulse: true };
    case "expired":
      return { tone: "danger", pulse: false };
    case "partial":
      return { tone: "warn", pulse: false };
    default:
      return { tone: "neutral", pulse: false };
  }
}

function progressRatio(received: string, total: string): number {
  try {
    const r = BigInt(received);
    const t = BigInt(total);
    if (t === 0n) return 0;
    // Convert to basis points (0-10000) then back to ratio — avoids
    // FP precision loss on large atomic values.
    const bps = Number((r * 10_000n) / t);
    return Math.max(0, Math.min(1, bps / 10_000));
  } catch {
    return 0;
  }
}

function normalizeTab(raw: string | undefined): DrawerTab {
  if (raw === "timeline" || raw === "metadata" || raw === "details") return raw;
  return "details";
}

/**
 * Right-side drawer with full invoice context. Opens when the caller
 * passes a non-null `invoice`; closes via `onClose` which should also
 * clear whatever URL state opened it (typically `?drawer=`).
 *
 * Keyboard:
 *   Esc            — close (Drawer primitive)
 *   Tab            — trap inside (Drawer primitive)
 *   Click outside  — close (Drawer primitive)
 */
/**
 * Statuses at which archive is meaningful. We mirror the server's
 * ARCHIVABLE_STATUSES (see `app/api/pay/invoices/[id]/route.ts`) so users
 * never see a button that would fail the 409 guard.
 */
const ARCHIVABLE_STATES = new Set(["completed", "expired"]);

export function InvoiceDetailDrawer({
  invoice,
  onClose,
  initialTab,
  onArchive,
}: {
  invoice: InvoiceDetail | null;
  onClose: () => void;
  initialTab?: string;
  /**
   * Optional archive handler. When provided AND the invoice is in a
   * terminal status AND not already archived, the drawer footer shows an
   * "Archive" button that delegates to the parent. The parent is expected
   * to wrap this in `useUndoableAction` so the Undo snackbar appears.
   */
  onArchive?: (invoice: InvoiceDetail) => void;
}) {
  const { toast } = useToast();
  const { tone, pulse } = useMemo(
    () => (invoice ? statusTone(invoice.status) : { tone: "neutral" as const, pulse: false }),
    [invoice],
  );
  const progress = useMemo(
    () => (invoice ? progressRatio(invoice.amountReceived, invoice.amount) : 0),
    [invoice],
  );
  const [copied, setCopied] = useCopyFlash(1500);

  const [tab, setTab] = useState<DrawerTab>(() => normalizeTab(initialTab));
  // Honor URL-driven tab changes after initial mount (e.g. deep-link update).
  useEffect(() => {
    setTab(normalizeTab(initialTab));
  }, [initialTab, invoice?.id]);

  const copyAddress = async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice.integratedAddress);
      setCopied(true);
      toast({ title: "Integrated address copied", tone: "success", ttl: 1800 });
    } catch {
      toast({ title: "Clipboard unavailable", tone: "error" });
    }
  };

  // Entity-scoped timeline — subscribes to SSE so new events for this
  // invoice revalidate the list automatically. Only fetches when a tab
  // on the timeline is active AND the drawer is open.
  const entityId = invoice?.id ?? null;
  const eventsKey =
    entityId && tab === "timeline" ? `events:invoice:${entityId}` : null;
  const { data: eventRows } = useLiveFetch<EventRow[]>(
    eventsKey,
    async () => {
      const r = await fetch(
        `/api/pay/events?entity_id=${encodeURIComponent(entityId!)}&limit=100`,
      );
      if (!r.ok) throw new Error(`events http ${r.status}`);
      return (await r.json()) as EventRow[];
    },
    { events: ["*"], skip: !eventsKey },
  );
  const timelineEvents = useMemo(
    () => (eventRows ?? []).map(toTimelineEvent),
    [eventRows],
  );

  const saveMetadata = async (next: Record<string, unknown>) => {
    if (!invoice) return;
    const r = await fetch("/api/pay/metadata", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "invoice",
        entityId: invoice.id,
        metadata: next,
      }),
    });
    if (!r.ok) {
      const msg = await r.text().catch(() => "");
      throw new Error(msg || `metadata save failed (${r.status})`);
    }
    toast({ title: "Metadata saved", tone: "success", ttl: 1400 });
  };

  // Kebab-menu state. `pendingAction` gates the confirm dialog; `busy`
  // locks its buttons while a PATCH is in flight.
  const [pendingAction, setPendingAction] = useState<
    null | "expire" | "archive"
  >(null);
  const [busy, setBusy] = useState(false);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied", tone: "success", ttl: 1400 });
    } catch {
      toast({ title: "Clipboard unavailable", tone: "error" });
    }
  }, [toast]);

  const copyJson = useCallback(async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(invoice, null, 2));
      toast({ title: "JSON copied", tone: "success", ttl: 1400 });
    } catch {
      toast({ title: "Clipboard unavailable", tone: "error" });
    }
  }, [invoice, toast]);

  const runPendingAction = useCallback(async () => {
    if (!invoice || !pendingAction || busy) return;
    setBusy(true);
    try {
      const body =
        pendingAction === "expire"
          ? { status: "expired" }
          : { archived: true };
      const r = await fetch(
        `/api/pay/invoices/${encodeURIComponent(invoice.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        let msg = `HTTP ${r.status}`;
        try {
          const parsed = text ? JSON.parse(text) : null;
          if (parsed?.message) msg = parsed.message as string;
        } catch {
          if (text) msg = text;
        }
        throw new Error(msg);
      }
      toast({
        title:
          pendingAction === "expire"
            ? "Invoice marked expired"
            : "Invoice archived",
        tone: "success",
        ttl: 1800,
      });
      setPendingAction(null);
      // No explicit refresh here — the parent page polls via `useLiveFetch`
      // and the server-sent event (`invoice.expired` / `invoice.archived`)
      // will trigger revalidation within the SSE debounce window.
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Update failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [invoice, pendingAction, busy, toast]);

  const menuActions: MenuAction[] = useMemo(() => {
    if (!invoice) return [];
    const markExpiredAllowed = MARK_EXPIRED_STATES.has(invoice.status);
    const isTerminal = ARCHIVABLE_STATES.has(invoice.status);
    const alreadyArchived = !!invoice.archivedAt;

    return [
      {
        id: "copy-link",
        label: "Copy link",
        icon: <Link2 size={13} />,
        onClick: copyLink,
      },
      {
        id: "copy-json",
        label: "Copy JSON",
        icon: <Braces size={13} />,
        onClick: copyJson,
      },
      {
        id: "mark-expired",
        label: "Mark expired",
        icon: <XOctagon size={13} />,
        destructive: true,
        disabled: !markExpiredAllowed,
        disabledReason: markExpiredAllowed
          ? undefined
          : "This invoice is already completed or expired.",
        onClick: () => setPendingAction("expire"),
      },
      {
        id: "archive",
        label: alreadyArchived ? "Already archived" : "Archive",
        icon: <Archive size={13} />,
        destructive: !alreadyArchived,
        disabled: !isTerminal || alreadyArchived,
        disabledReason: alreadyArchived
          ? "This invoice is already archived."
          : !isTerminal
            ? "Only completed or expired invoices can be archived."
            : undefined,
        // Prefer the undoable-action path when the parent wires it — that
        // gives the Gmail-style "Archived — Undo (5s)" snackbar instead of
        // the legacy confirm-dialog. Fall back to the dialog flow so this
        // component still works standalone.
        onClick: () => {
          if (onArchive) onArchive(invoice);
          else setPendingAction("archive");
        },
      },
    ];
  }, [invoice, copyLink, copyJson, onArchive]);

  const confirmCopy =
    pendingAction === "expire"
      ? {
          title: "Mark invoice expired?",
          description:
            "This moves the invoice into the expired terminal state. It cannot be reopened afterwards.",
          confirmLabel: "Mark expired",
        }
      : pendingAction === "archive"
        ? {
            title: "Archive invoice?",
            description:
              "Archived invoices are hidden from the main list. You can restore them later from the archive view.",
            confirmLabel: "Archive",
          }
        : null;

  return (
    <>
    <Drawer
      open={!!invoice}
      onClose={onClose}
      title={invoice ? truncate(invoice.id, 8, 6) : undefined}
      ariaLabel={invoice ? `Invoice ${invoice.id}` : undefined}
      width={560}
      headerActions={
        invoice && (
          <Menu
            ariaLabel="Invoice actions"
            trigger={<KebabButton ariaLabel="Invoice actions" />}
            actions={menuActions}
          />
        )
      }
      footer={
        invoice && (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {/* Archive affordance now lives in the kebab menu above;
                when `onArchive` is wired, that menu item invokes it directly
                for an Undo-snackbar flow instead of opening a confirm dialog. */}
            <Button
              variant="primary"
              leftIcon={copied ? <Check size={13} /> : <Copy size={13} />}
              onClick={copyAddress}
            >
              {copied ? "Copied" : "Copy address"}
            </Button>
          </>
        )
      }
    >
      {invoice && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Tabs
            items={TAB_ITEMS}
            value={tab}
            onChange={(v) => setTab(v as DrawerTab)}
            ariaLabel="Invoice detail sections"
          />

          <TabPanel value="details" active={tab === "details"}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Status + amount */}
              <section>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <Badge tone={tone} pulse={pulse}>
                    {invoice.status}
                  </Badge>
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--bone-mute)" }}
                  >
                    {invoice.id}
                  </span>
                </div>
                <div
                  className="display"
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    letterSpacing: "-0.022em",
                    color: "var(--bone)",
                    lineHeight: 1.1,
                    marginBottom: 4,
                    fontVariantNumeric: "tabular-nums slashed-zero",
                  }}
                >
                  {invoice.name || "(unnamed)"}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    fontSize: 13,
                    color: "var(--bone-dim)",
                  }}
                >
                  <span
                    className="mono"
                    style={{ color: "var(--bone)", fontSize: 14 }}
                  >
                    {formatDero(invoice.amountReceived, 5)}
                  </span>
                  <span>/</span>
                  <span className="mono">
                    {formatDero(invoice.amount, 5)} DERO
                  </span>
                </div>
                {(invoice.status === "partial" ||
                  invoice.status === "confirming") && (
                  <ProgressBar ratio={progress} tone={tone} />
                )}
              </section>

              {/* Payment QR — primary CTA for awaiting-payment invoices.
                  Skipped for terminal states where there's no action to take. */}
              {AWAITING_STATES.has(invoice.status) && (
                <Section label="Pay with DERO">
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <PaymentQR address={invoice.integratedAddress} />
                    <AddressPill
                      address={invoice.integratedAddress}
                      copied={copied}
                      onCopy={copyAddress}
                    />
                  </div>
                </Section>
              )}

              {/* For terminal-state invoices, surface the address in a low-key
                  row — reference only, no action implied. */}
              {!AWAITING_STATES.has(invoice.status) && (
                <Section label="Integrated address">
                  <AddressPill
                    address={invoice.integratedAddress}
                    copied={copied}
                    onCopy={copyAddress}
                  />
                </Section>
              )}

              {/* Description */}
              {invoice.description && (
                <Section label="Description">
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--bone-dim)",
                      lineHeight: 1.55,
                      margin: 0,
                    }}
                  >
                    {invoice.description}
                  </p>
                </Section>
              )}

              {/* Lifecycle timeline — created / expires / completed. A richer
                  event-bus timeline lives on the Timeline tab. */}
              <Section label="Lifecycle">
                <LifecycleList
                  items={[
                    {
                      icon: Zap,
                      label: "Created",
                      when: invoice.createdAt,
                      tone: "info",
                    },
                    {
                      icon: invoice.status === "expired" ? XCircle : Clock,
                      label: invoice.status === "expired" ? "Expired" : "Expires",
                      when: invoice.expiresAt,
                      tone:
                        invoice.status === "expired" ? "danger" : "neutral",
                    },
                    ...(invoice.completedAt
                      ? [
                          {
                            icon: CheckCircle2,
                            label: "Completed",
                            when: invoice.completedAt,
                            tone: "positive" as const,
                          },
                        ]
                      : []),
                  ]}
                />
              </Section>

              {/* Payments */}
              {invoice.payments.length > 0 && (
                <Section label={`Payments (${invoice.payments.length})`}>
                  <div
                    style={{
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--ink-hair)",
                      overflow: "hidden",
                    }}
                  >
                    {invoice.payments.map((p, i) => (
                      <div
                        key={p.txid}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          gap: 12,
                          padding: "10px 12px",
                          alignItems: "center",
                          background:
                            i % 2 === 0 ? "var(--ink-deep)" : "transparent",
                          borderBottom:
                            i < invoice.payments.length - 1
                              ? "1px solid var(--ink-hair)"
                              : "none",
                          fontSize: 11.5,
                        }}
                      >
                        <code
                          className="mono"
                          style={{
                            color: "var(--bone)",
                            fontSize: 10.5,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={p.txid}
                        >
                          {truncate(p.txid, 8, 6)}
                        </code>
                        <span
                          className="mono"
                          style={{ color: "var(--bone-dim)" }}
                          title={`${p.confirmations} confirmations`}
                        >
                          {p.confirmations} conf
                        </span>
                        <span
                          className="mono"
                          style={{ color: "var(--dero)" }}
                        >
                          {formatDero(p.amount, 5)}
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Payment ID */}
              <Section label="Payment ID">
                <code
                  className="mono"
                  style={{
                    color: "var(--bone-dim)",
                    fontSize: 11.5,
                    wordBreak: "break-all",
                  }}
                >
                  {invoice.paymentId}
                </code>
              </Section>

              {/* Phase 3 #28 — ringsig-aware customer link. Present when the
                  monitor resolved this invoice's payer to a customer_profiles
                  row via the stealth-key fingerprint. Clicking the pill deep-
                  links into the customer drawer so the operator can see every
                  invoice that shares the same anonymous payer. */}
              {invoice.customerId && (
                <Section label="Paid by">
                  <a
                    href={`/customers?drawer=customer:${encodeURIComponent(
                      invoice.customerId,
                    )}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--ink-hair)",
                      background: "var(--ink-deep)",
                      color: "var(--bone)",
                      fontSize: 12,
                      textDecoration: "none",
                    }}
                    title="Jump to customer drawer — all invoices from this payer"
                  >
                    <span style={{ color: "var(--bone-dim)" }}>Customer</span>
                    <code className="mono" style={{ fontSize: 11 }}>
                      {truncate(invoice.customerId, 6, 4)}
                    </code>
                  </a>
                </Section>
              )}

              {/* On-chain provenance — block height, ring size, confirmations,
                  and deep-links to the DERO explorer + HyperGnomon indexer.
                  Sits between Payment ID and the plugin widget-zone so both
                  built-in and plugin content appear below the primary detail. */}
              <InvoiceProvenanceSection invoiceId={invoice.id} />

              {/* Plugin injection zone — inside the Details tab, after the
                  default content. Plugins receive the invoice as `entity`. */}
              <WidgetZone zone="invoice.details.sidebar" entity={invoice} />
            </div>
          </TabPanel>

          <TabPanel value="timeline" active={tab === "timeline"}>
            <EventTimeline
              events={timelineEvents}
              limit={100}
              compact
              emptyLabel="No events yet for this invoice."
            />
          </TabPanel>

          <TabPanel value="metadata" active={tab === "metadata"}>
            <MetadataEditor
              value={invoice.metadata ?? {}}
              onSave={saveMetadata}
            />
          </TabPanel>

          <div style={{ marginTop: 16 }}>
            <JsonPanel json={invoice} label="Raw invoice" />
          </div>
        </div>
      )}
    </Drawer>
    <Dialog
      open={!!pendingAction && !!invoice && !!confirmCopy}
      onClose={() => {
        if (busy) return;
        setPendingAction(null);
      }}
      destructive
      title={confirmCopy?.title ?? ""}
      description={confirmCopy?.description}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => setPendingAction(null)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={busy}
            onClick={() => void runPendingAction()}
          >
            {confirmCopy?.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    />
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div
        className="eyebrow-mono"
        style={{ marginBottom: 8, color: "var(--bone-mute)" }}
      >
        {label}
      </div>
      {children}
    </section>
  );
}

function AddressPill({
  address,
  copied,
  onCopy,
}: {
  address: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy integrated address"
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        background: "var(--ink-deep)",
        border: "1px solid var(--ink-hair)",
        borderRadius: "var(--radius)",
        color: "var(--bone-dim)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        cursor: "pointer",
        wordBreak: "break-all",
        transition: "border-color 0.15s var(--ease-out), color 0.15s var(--ease-out)",
        display: "flex",
        alignItems: "center",
        gap: 8,
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
      <span style={{ flex: 1, minWidth: 0 }}>{address}</span>
      {copied ? <Check size={13} color="var(--dero)" /> : <Copy size={13} />}
    </button>
  );
}

function ProgressBar({
  ratio,
  tone,
}: {
  ratio: number;
  tone: Tone;
}) {
  const fill =
    tone === "positive" ? "var(--dero)" : tone === "warn" ? "var(--amber)" : "var(--bone-dim)";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        marginTop: 10,
        height: 4,
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
  );
}

function LifecycleList({
  items,
}: {
  items: Array<{
    icon: typeof Clock;
    label: string;
    when: string;
    tone: "info" | "positive" | "neutral" | "danger";
  }>;
}) {
  const toneColor: Record<string, string> = {
    info: "var(--bone-dim)",
    positive: "var(--dero)",
    neutral: "var(--bone-mute)",
    danger: "var(--vermilion)",
  };
  return (
    <ol
      style={{
        margin: 0,
        padding: 0,
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {items.map((item) => (
        <li
          key={item.label}
          style={{
            display: "grid",
            gridTemplateColumns: "22px 1fr auto",
            gap: 10,
            alignItems: "center",
          }}
        >
          <item.icon size={14} color={toneColor[item.tone]} strokeWidth={1.7} />
          <span style={{ color: "var(--bone-dim)", fontSize: 12.5 }}>
            {item.label}
          </span>
          <span
            className="mono"
            style={{ color: "var(--bone)", fontSize: 11, letterSpacing: 0 }}
          >
            {formatDate(item.when)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Tiny "copied!" flash — auto-resets after `ms`. */
function useCopyFlash(ms = 1500): [boolean, (v: boolean) => void] {
  const [state, setState] = useState(false);
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(false), ms);
    return () => clearTimeout(t);
  }, [state, ms]);
  return [state, setState];
}
