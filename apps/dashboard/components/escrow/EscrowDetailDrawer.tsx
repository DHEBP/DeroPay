"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  Check,
  ShieldCheck,
  AlertOctagon,
  Link2,
  Braces,
  PackageCheck,
  Flag,
  Undo2,
} from "lucide-react";
import {
  Drawer,
  Dialog,
  Button,
  Badge,
  Menu,
  KebabButton,
  type MenuAction,
} from "@/components/ui";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { Timeline as EventTimeline } from "@/components/timeline";
import { MetadataEditor } from "@/components/metadata-editor";
import { JsonPanel } from "@/components/json-panel";
import { DisputeEvidenceWorkflow } from "@/components/escrow/DisputeEvidenceWorkflow";
import { formatDero, formatDate, truncate } from "@/lib/format";
import { useToast } from "@/components/toast";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { toTimelineEvent, type EventRow } from "dero-pay/events";
import { WidgetZone } from "@/components/widget-zone";

type Escrow = {
  scid: string;
  deployTxid: string;
  escrowStatus: string;
  sellerAddress: string;
  arbitratorAddress: string;
  feeBasisPoints: number;
  blockExpiration: number;
  buyerAddress: string | null;
  depositHeight: number | null;
  disputedAt: string | null;
  resolution: string | null;
};

export type EscrowDetail = {
  id: string;
  name: string;
  description: string;
  amount: string;
  status: string;
  createdAt: string;
  escrow: Escrow | null;
  metadata?: Record<string, unknown>;
};

type Tone = "positive" | "warn" | "info" | "danger" | "neutral";
type DrawerTab = "details" | "timeline" | "metadata" | "evidence";

const BASE_TAB_ITEMS = [
  { value: "details", label: "Details" },
  { value: "timeline", label: "Timeline" },
  { value: "metadata", label: "Metadata" },
];

/**
 * Phase 3 #35 — the "Dispute evidence" tab only renders while the escrow is
 * in `disputed`. Keeping this dynamic (rather than always-visible + disabled)
 * means operators don't spend a click wondering what a greyed tab would do.
 */
const EVIDENCE_TAB = { value: "evidence", label: "Dispute evidence" };

function statusTone(status: string): { tone: Tone; pulse: boolean } {
  switch (status) {
    case "deploying":
    case "awaiting_deposit":
      return { tone: "info", pulse: true };
    case "funded":
      return { tone: "warn", pulse: true };
    case "released":
    case "expired_claimed":
    case "arbitrated":
      return { tone: "positive", pulse: false };
    case "refunded":
      return { tone: "neutral", pulse: false };
    case "disputed":
      return { tone: "warn", pulse: false };
    case "deploy_failed":
      return { tone: "danger", pulse: false };
    default:
      return { tone: "neutral", pulse: false };
  }
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeTab(raw: string | undefined): DrawerTab {
  if (
    raw === "timeline" ||
    raw === "metadata" ||
    raw === "details" ||
    raw === "evidence"
  )
    return raw;
  return "details";
}

const TERMINAL_STATES = new Set([
  "released",
  "refunded",
  "expired_claimed",
  "arbitrated",
  "deploy_failed",
]);

/**
 * Detail drawer for an escrow invoice. Mirrors InvoiceDetailDrawer
 * shape (tabbed layout: Details / Timeline / Metadata; JSON footer)
 * but adapted for escrow's richer contract state.
 *
 * For non-terminal states, hosts the three arbitration actions as the
 * drawer footer — the drawer IS the action surface.
 */
export function EscrowDetailDrawer({
  invoice,
  onClose,
  onAction,
  actionLoading,
  initialTab,
}: {
  invoice: EscrowDetail | null;
  onClose: () => void;
  onAction?: (invoiceId: string, action: string) => void;
  actionLoading?: string | null;
  initialTab?: string;
}) {
  const { toast } = useToast();
  const escrow = invoice?.escrow ?? null;
  const { tone, pulse } = useMemo(
    () =>
      escrow
        ? statusTone(escrow.escrowStatus)
        : { tone: "neutral" as const, pulse: false },
    [escrow],
  );
  const isTerminal = escrow ? TERMINAL_STATES.has(escrow.escrowStatus) : false;

  const [pendingConfirm, setPendingConfirm] = useState<
    { invoiceId: string; action: string } | null
  >(null);

  const isDisputed = escrow?.escrowStatus === "disputed";
  const tabItems = useMemo(
    () => (isDisputed ? [...BASE_TAB_ITEMS, EVIDENCE_TAB] : BASE_TAB_ITEMS),
    [isDisputed],
  );

  const [tab, setTab] = useState<DrawerTab>(() => normalizeTab(initialTab));
  useEffect(() => {
    const next = normalizeTab(initialTab);
    // If the URL primed the evidence tab but the escrow isn't disputed,
    // fall back to details so we don't render an orphaned panel.
    if (next === "evidence" && !isDisputed) {
      setTab("details");
      return;
    }
    setTab(next);
  }, [initialTab, invoice?.id, isDisputed]);

  // Clear any pending confirm if the drawer closes (invoice becomes null).
  useEffect(() => {
    if (!invoice) setPendingConfirm(null);
  }, [invoice]);

  // Entity-scoped timeline — subscribes to SSE so new events for this
  // escrow revalidate automatically.
  const entityId = invoice?.id ?? null;
  const eventsKey =
    entityId && tab === "timeline" ? `events:escrow:${entityId}` : null;
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

  // Escrow metadata lives on the parent invoice row — patch against
  // entityType: "invoice" since there's no distinct escrow store.
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

  // Kebab-menu copy helpers — always-on secondary actions. They don't
  // go through the existing confirm pipeline because there's nothing to
  // confirm: they're local clipboard writes.
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

  // The kebab is a secondary / keyboard-friendly path for the same escrow
  // actions the footer already exposes. We reuse the existing pending-
  // confirm flow — the dialog below renders regardless of where the
  // request came from, so there's only one confirm UI to maintain.
  const menuActions: MenuAction[] = useMemo(() => {
    if (!invoice || !escrow) return [];
    const isFunded = escrow.escrowStatus === "funded";
    const isDisputed = escrow.escrowStatus === "disputed";
    const terminalReason = "Released escrows are terminal.";

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
        id: "confirm-delivery",
        label: "Confirm delivery",
        icon: <PackageCheck size={13} />,
        disabled: !isFunded,
        disabledReason: isFunded
          ? undefined
          : isTerminal
            ? terminalReason
            : "Delivery can only be confirmed once funds are escrowed.",
        onClick: () =>
          setPendingConfirm({ invoiceId: invoice.id, action: "confirmDelivery" }),
      },
      {
        id: "raise-dispute",
        label: "Raise dispute",
        icon: <Flag size={13} />,
        destructive: true,
        disabled: !isFunded,
        disabledReason: isFunded
          ? undefined
          : isTerminal
            ? terminalReason
            : isDisputed
              ? "A dispute is already active on this escrow."
              : "A dispute can only be raised against a funded escrow.",
        onClick: () =>
          setPendingConfirm({ invoiceId: invoice.id, action: "dispute" }),
      },
      {
        id: "refund-buyer",
        label: "Refund buyer",
        icon: <Undo2 size={13} />,
        destructive: true,
        disabled: !(isFunded || isDisputed),
        disabledReason:
          isFunded || isDisputed
            ? undefined
            : isTerminal
              ? terminalReason
              : "Buyer can only be refunded from a funded or disputed escrow.",
        onClick: () =>
          setPendingConfirm({
            invoiceId: invoice.id,
            // Funded → direct refund; disputed → arbitrate in buyer's favor.
            action: isDisputed ? "arbitrateRefund" : "refundBuyer",
          }),
      },
    ];
  }, [invoice, escrow, isTerminal, copyLink, copyJson]);

  const confirmKey = pendingConfirm
    ? `${pendingConfirm.invoiceId}-${pendingConfirm.action}`
    : null;
  const confirmBusy = !!confirmKey && actionLoading === confirmKey;
  const confirmCopy = pendingConfirm
    ? CONFIRM_COPY[pendingConfirm.action]
    : null;

  const closeConfirm = () => {
    if (confirmBusy) return; // lock during in-flight action
    setPendingConfirm(null);
  };

  // Track when we just fired a `dispute` action so we can prompt the operator
  // to jump into the evidence workflow once the status transition lands.
  const [pendingDisputeOn, setPendingDisputeOn] = useState<string | null>(null);

  const fireConfirm = () => {
    if (!pendingConfirm || !onAction || confirmBusy) return;
    if (pendingConfirm.action === "dispute") {
      setPendingDisputeOn(pendingConfirm.invoiceId);
    }
    onAction(pendingConfirm.invoiceId, pendingConfirm.action);
    setPendingConfirm(null);
  };

  // When the escrow transitions to `disputed` after a dispute fire, prompt
  // the operator with a toast whose action button switches them into the
  // evidence workflow tab.
  useEffect(() => {
    if (!pendingDisputeOn) return;
    if (!invoice || invoice.id !== pendingDisputeOn) return;
    if (escrow?.escrowStatus !== "disputed") return;
    setPendingDisputeOn(null);
    toast({
      title: "Dispute opened",
      description: "Submit evidence now so the arbitrator can review.",
      tone: "warn",
      action: {
        label: "View dispute",
        onClick: () => setTab("evidence"),
      },
    });
  }, [escrow?.escrowStatus, invoice, pendingDisputeOn, toast]);

  return (
    <>
    <Drawer
      open={!!invoice}
      onClose={onClose}
      title={invoice ? truncate(invoice.id, 8, 6) : undefined}
      ariaLabel={invoice ? `Escrow ${invoice.id}` : undefined}
      width={560}
      headerActions={
        invoice && escrow && (
          <Menu
            ariaLabel="Escrow actions"
            trigger={<KebabButton ariaLabel="Escrow actions" />}
            actions={menuActions}
          />
        )
      }
      footer={
        invoice && escrow && !isTerminal && onAction ? (
          <EscrowActions
            invoiceId={invoice.id}
            escrowStatus={escrow.escrowStatus}
            actionLoading={actionLoading ?? null}
            onRequestAction={(id, action) =>
              setPendingConfirm({ invoiceId: id, action })
            }
            onClose={onClose}
          />
        ) : (
          invoice && (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          )
        )
      }
    >
      {invoice && escrow && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Tabs
            items={tabItems}
            value={tab}
            onChange={(v) => setTab(v as DrawerTab)}
            ariaLabel="Escrow detail sections"
          />

          <TabPanel value="details" active={tab === "details"}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Status + amount */}
              <section>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <Badge tone={tone} pulse={pulse}>
                    {humanize(escrow.escrowStatus)}
                  </Badge>
                  <span className="mono" style={{ fontSize: 11, color: "var(--bone-mute)" }}>
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
                  }}
                >
                  {invoice.name || "(unnamed escrow)"}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 14,
                    color: "var(--bone)",
                    fontVariantNumeric: "tabular-nums slashed-zero",
                  }}
                >
                  {formatDero(invoice.amount, 5)}{" "}
                  <span style={{ fontSize: 10, color: "var(--bone-mute)", letterSpacing: "0.2em" }}>
                    DERO LOCKED
                  </span>
                </div>
                {invoice.description && (
                  <p
                    style={{
                      marginTop: 10,
                      fontSize: 13,
                      color: "var(--bone-dim)",
                      lineHeight: 1.55,
                    }}
                  >
                    {invoice.description}
                  </p>
                )}
              </section>

              {/* Dispute state — surface prominently when active */}
              {escrow.escrowStatus === "disputed" && (
                <div
                  role="status"
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius)",
                    background: "var(--amber-wash)",
                    border: "1px solid rgba(232,177,74,0.28)",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <AlertOctagon size={16} color="var(--amber)" style={{ marginTop: 2 }} />
                  <div style={{ fontSize: 12.5, color: "var(--bone)", lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 500, color: "var(--amber)", marginBottom: 2 }}>
                      Dispute active
                    </div>
                    Opened {escrow.disputedAt ? formatDate(escrow.disputedAt) : "recently"}.
                    Arbitrate by releasing funds to the buyer or seller.
                  </div>
                </div>
              )}

              {/* Resolution — for terminal states */}
              {isTerminal && escrow.resolution && (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius)",
                    background: "var(--dero-wash)",
                    border: "1px solid var(--dero-hair)",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <ShieldCheck size={16} color="var(--dero)" />
                  <div style={{ fontSize: 12.5, color: "var(--bone)" }}>
                    <span style={{ color: "var(--dero)", fontWeight: 500 }}>
                      {humanize(escrow.resolution)}
                    </span>
                  </div>
                </div>
              )}

              {/* Parties */}
              <Section label="Parties">
                <AddressRow label="Seller" address={escrow.sellerAddress} />
                <AddressRow label="Arbitrator" address={escrow.arbitratorAddress} />
                <AddressRow
                  label="Buyer"
                  address={escrow.buyerAddress}
                  fallback="Awaiting deposit"
                />
              </Section>

              {/* Contract */}
              <Section label="Contract">
                <AddressRow label="SCID" address={escrow.scid} />
                <AddressRow label="Deploy TX" address={escrow.deployTxid} />
              </Section>

              {/* Parameters */}
              <Section label="Parameters">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: "6px 14px",
                    fontSize: 12,
                  }}
                >
                  <span className="eyebrow-mono" style={{ color: "var(--bone-mute)" }}>
                    Arbitrator fee
                  </span>
                  <span className="mono" style={{ color: "var(--bone)" }}>
                    {(escrow.feeBasisPoints / 100).toFixed(2)}%{" "}
                    <span style={{ color: "var(--bone-quiet)" }}>
                      ({escrow.feeBasisPoints} bp)
                    </span>
                  </span>
                  <span className="eyebrow-mono" style={{ color: "var(--bone-mute)" }}>
                    Expires
                  </span>
                  <span className="mono" style={{ color: "var(--bone)" }}>
                    {escrow.blockExpiration.toLocaleString()} blocks
                  </span>
                  {escrow.depositHeight !== null && (
                    <>
                      <span className="eyebrow-mono" style={{ color: "var(--bone-mute)" }}>
                        Deposit height
                      </span>
                      <span className="mono" style={{ color: "var(--bone)" }}>
                        {escrow.depositHeight.toLocaleString()}
                      </span>
                    </>
                  )}
                </div>
              </Section>

              {/* Lifecycle — terse created/disputed dates. Full event stream
                  is on the Timeline tab. */}
              <Section label="Lifecycle">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: "6px 14px",
                    fontSize: 12,
                  }}
                >
                  <span className="eyebrow-mono" style={{ color: "var(--bone-mute)" }}>
                    Created
                  </span>
                  <span className="mono" style={{ color: "var(--bone)" }}>
                    {formatDate(invoice.createdAt)}
                  </span>
                  {escrow.disputedAt && (
                    <>
                      <span className="eyebrow-mono" style={{ color: "var(--bone-mute)" }}>
                        Disputed
                      </span>
                      <span className="mono" style={{ color: "var(--amber)" }}>
                        {formatDate(escrow.disputedAt)}
                      </span>
                    </>
                  )}
                </div>
              </Section>
            </div>
          </TabPanel>

          <TabPanel value="timeline" active={tab === "timeline"}>
            <EventTimeline
              events={timelineEvents}
              limit={100}
              compact
              emptyLabel="No events yet for this escrow."
            />
            {/* Plugin injection zone — after the escrow timeline. Plugins
                receive the full escrow record as `entity`. */}
            <WidgetZone
              zone="escrow.details.timeline.after"
              entity={invoice}
            />
          </TabPanel>

          <TabPanel value="metadata" active={tab === "metadata"}>
            <MetadataEditor
              value={invoice.metadata ?? {}}
              onSave={saveMetadata}
            />
          </TabPanel>

          {/* Phase 3 #35 — dispute evidence guided workflow. Only rendered
              while the escrow is in the `disputed` state. */}
          {isDisputed && (
            <TabPanel value="evidence" active={tab === "evidence"}>
              <DisputeEvidenceWorkflow escrowId={invoice.id} />
            </TabPanel>
          )}

          <div style={{ marginTop: 16 }}>
            <JsonPanel json={invoice} label="Raw escrow" />
          </div>
        </div>
      )}
    </Drawer>
    <Dialog
      open={!!pendingConfirm && !!invoice && !!confirmCopy}
      onClose={closeConfirm}
      destructive
      title={confirmCopy?.title ?? ""}
      description={
        invoice && confirmCopy ? (
          <>
            This will move{" "}
            <span
              className="mono"
              style={{ color: "var(--bone)", fontVariantNumeric: "tabular-nums" }}
            >
              {formatDero(invoice.amount, 5)} DERO
            </span>{" "}
            on-chain to the {confirmCopy.recipient}
            {invoice.escrow &&
              ((confirmCopy.recipient === "seller" && invoice.escrow.sellerAddress) ||
                (confirmCopy.recipient === "buyer" && invoice.escrow.buyerAddress)) ? (
              <>
                {" "}(
                <span className="mono" style={{ color: "var(--bone-dim)" }}>
                  {truncate(
                    confirmCopy.recipient === "seller"
                      ? invoice.escrow.sellerAddress
                      : (invoice.escrow.buyerAddress as string),
                    8,
                    6,
                  )}
                </span>
                )
              </>
            ) : null}
            . This action is irreversible once the transaction confirms on-chain.
          </>
        ) : null
      }
      footer={
        <>
          <Button variant="ghost" onClick={closeConfirm} disabled={confirmBusy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={confirmBusy}
            disabled={confirmBusy}
            onClick={fireConfirm}
          >
            {confirmCopy ? `Confirm ${confirmCopy.confirmLabel}` : "Confirm"}
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

function AddressRow({
  label,
  address,
  fallback,
}: {
  label: string;
  address: string | null;
  fallback?: string;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useCopyFlash();
  if (!address) {
    return (
      <Row label={label}>
        <span style={{ color: "var(--bone-quiet)", fontStyle: "italic" }}>
          {fallback ?? "—"}
        </span>
      </Row>
    );
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast({ title: `${label} copied`, tone: "success", ttl: 1400 });
    } catch {
      toast({ title: "Clipboard unavailable", tone: "error" });
    }
  };
  return (
    <Row label={label}>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--bone-dim)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          textAlign: "left",
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={address}
        >
          {truncate(address, 10, 8)}
        </span>
        {copied ? (
          <Check size={12} color="var(--dero)" />
        ) : (
          <Copy size={12} />
        )}
      </button>
    </Row>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "110px 1fr",
        gap: 14,
        padding: "4px 0",
        alignItems: "center",
        minHeight: 24,
      }}
    >
      <span
        className="eyebrow-mono"
        style={{ color: "var(--bone-mute)", fontSize: 10 }}
      >
        {label}
      </span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function EscrowActions({
  invoiceId,
  escrowStatus,
  actionLoading,
  onRequestAction,
  onClose,
}: {
  invoiceId: string;
  escrowStatus: string;
  actionLoading: string | null;
  onRequestAction: (id: string, action: string) => void;
  onClose: () => void;
}) {
  const busy = !!actionLoading;

  if (escrowStatus === "funded") {
    return (
      <>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button
          variant="primary"
          loading={actionLoading === `${invoiceId}-refundBuyer`}
          disabled={busy}
          onClick={() => onRequestAction(invoiceId, "refundBuyer")}
        >
          Refund buyer
        </Button>
      </>
    );
  }

  if (escrowStatus === "disputed") {
    return (
      <>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Close
        </Button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => onRequestAction(invoiceId, "arbitrateRefund")}
        >
          {actionLoading === `${invoiceId}-arbitrateRefund`
            ? "…"
            : "Refund buyer"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => onRequestAction(invoiceId, "arbitrateRelease")}
        >
          {actionLoading === `${invoiceId}-arbitrateRelease`
            ? "…"
            : "Release to seller"}
        </button>
      </>
    );
  }

  // awaiting_deposit / deploying — no action available
  return (
    <Button variant="ghost" onClick={onClose}>
      Close
    </Button>
  );
}

type ConfirmCopy = {
  title: string;
  confirmLabel: string;
  recipient: "buyer" | "seller";
};

const CONFIRM_COPY: Record<string, ConfirmCopy> = {
  refundBuyer: {
    title: "Refund buyer?",
    confirmLabel: "Refund buyer",
    recipient: "buyer",
  },
  arbitrateRefund: {
    title: "Arbitrate dispute in buyer's favor?",
    confirmLabel: "Refund buyer",
    recipient: "buyer",
  },
  arbitrateRelease: {
    title: "Release funds to seller?",
    confirmLabel: "Release to seller",
    recipient: "seller",
  },
  confirmDelivery: {
    title: "Confirm delivery and release funds?",
    confirmLabel: "Confirm delivery",
    recipient: "seller",
  },
  dispute: {
    title: "Raise a dispute on this escrow?",
    // Dispute doesn't move funds — the dialog copy's "This will move X DERO"
    // still applies in spirit (funds are frozen pending arbitration).
    confirmLabel: "Raise dispute",
    recipient: "buyer",
  },
};

/** "copied!" flash, auto-resets. */
function useCopyFlash(ms = 1400): [boolean, (v: boolean) => void] {
  const [state, setState] = useState(false);
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(false), ms);
    return () => clearTimeout(t);
  }, [state, ms]);
  return [state, setState];
}
