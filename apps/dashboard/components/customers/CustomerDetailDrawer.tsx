"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Check, Receipt, Link2, Braces, Archive } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { formatDero, formatDate, truncate } from "@/lib/format";
import { useToast } from "@/components/toast";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { toTimelineEvent, type EventRow } from "dero-pay/events";

/**
 * Invoice-activity summary for a customer. Optional — profiles in the
 * Directory tab don't carry stats; the caller can enrich if it has
 * access to the aggregate /api/pay/customers response.
 */
export type CustomerActivityStats = {
  invoiceCount: number;
  /** atomic units as string (bigint-safe) */
  totalPaidAtomic: string;
  lastPaymentAt: string | null;
};

/**
 * Drawer shape. Mirrors `CustomerProfile` from `dero-pay/server` but
 * re-declared locally so this component is decoupled from that package.
 *
 * NOTE: the customer model has no DERO address — payments arrive via
 * per-invoice integrated addresses, not a long-lived wallet. "Identifiers"
 * surfaces email / customer ID / phone instead.
 */
export type CustomerDetail = {
  id: string;
  email: string | null;
  customerId: string | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  tags?: string[];
  notes: string | null;
  createdAt: number;
  updatedAt?: number;
  /** Epoch ms when the profile was archived, or null if active. */
  archivedAt?: number | null;
  stats?: CustomerActivityStats | null;
  metadata?: Record<string, unknown>;
};

type DrawerTab = "details" | "timeline" | "metadata";

const TAB_ITEMS = [
  { value: "details", label: "Details" },
  { value: "timeline", label: "Timeline" },
  { value: "metadata", label: "Metadata" },
];

function normalizeTab(raw: string | undefined): DrawerTab {
  if (raw === "timeline" || raw === "metadata" || raw === "details") return raw;
  return "details";
}

/**
 * Right-side drawer with full customer context. Mirrors the shape of
 * InvoiceDetailDrawer / EscrowDetailDrawer: identity header, identifier
 * rows with copy-on-click, tags, notes, and (now) a tabbed body with
 * Timeline and Metadata surfaces plus a footer JSON inspector.
 */
export function CustomerDetailDrawer({
  customer,
  onClose,
  initialTab,
}: {
  customer: CustomerDetail | null;
  onClose: () => void;
  initialTab?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const stats = customer?.stats ?? null;

  const [tab, setTab] = useState<DrawerTab>(() => normalizeTab(initialTab));
  useEffect(() => {
    setTab(normalizeTab(initialTab));
  }, [initialTab, customer?.id]);

  // Entity-scoped event timeline. Customers rarely have direct events
  // today, but the bus is entity-agnostic — the component will just show
  // the empty-state if nothing has been published for this id.
  const entityId = customer?.id ?? null;
  const eventsKey =
    entityId && tab === "timeline" ? `events:customer:${entityId}` : null;
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

  // Phase 3 #28 — fingerprint-linked invoices for this customer. Fetched
  // lazily whenever the drawer is on the Details tab and we actually have
  // a customer id. The endpoint duck-types the store, so older builds
  // return { count: 0, invoices: [] } rather than 500.
  type CustomerInvoiceRow = {
    id: string;
    name: string;
    amount: string;
    amountReceived: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  };
  const invoicesKey =
    entityId && tab === "details" ? `customer-invoices:${entityId}` : null;
  const { data: customerInvoicesResp } = useLiveFetch<{
    count: number;
    invoices: CustomerInvoiceRow[];
  }>(
    invoicesKey,
    async () => {
      const r = await fetch(
        `/api/pay/customers/${encodeURIComponent(entityId!)}/invoices?limit=20`,
      );
      if (!r.ok) throw new Error(`customer invoices http ${r.status}`);
      return (await r.json()) as {
        count: number;
        invoices: CustomerInvoiceRow[];
      };
    },
    // Refresh when new invoices settle into completed state or first
    // detection fires — the join key is invoices.customer_id so any
    // invoice.* event for a linked invoice could shift our numbers.
    { events: ["invoice.*", "customer.identified"], skip: !invoicesKey },
  );
  const customerInvoices = customerInvoicesResp?.invoices ?? [];
  const customerInvoiceCount = customerInvoicesResp?.count ?? 0;

  const saveMetadata = async (next: Record<string, unknown>) => {
    if (!customer) return;
    const r = await fetch("/api/pay/metadata", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "customer_profile",
        entityId: customer.id,
        metadata: next,
      }),
    });
    if (!r.ok) {
      const msg = await r.text().catch(() => "");
      throw new Error(msg || `metadata save failed (${r.status})`);
    }
    toast({ title: "Metadata saved", tone: "success", ttl: 1400 });
  };

  const openInvoices = () => {
    if (!customer) return;
    const q = customer.email ?? customer.customerId ?? "";
    router.push(q ? `/invoices?q=${encodeURIComponent(q)}` : "/invoices");
  };

  // Kebab-menu state. Pending `archive` shows the confirm dialog;
  // `busy` locks it while the PATCH is in flight.
  const [pendingArchive, setPendingArchive] = useState(false);
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
    if (!customer) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(customer, null, 2));
      toast({ title: "JSON copied", tone: "success", ttl: 1400 });
    } catch {
      toast({ title: "Clipboard unavailable", tone: "error" });
    }
  }, [customer, toast]);

  const runArchive = useCallback(async () => {
    if (!customer || busy) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/pay/customers/${encodeURIComponent(customer.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
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
      toast({ title: "Customer archived", tone: "success", ttl: 1800 });
      setPendingArchive(false);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Archive failed",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [customer, busy, toast]);

  const alreadyArchived = !!customer?.archivedAt;
  const menuActions: MenuAction[] = useMemo(() => {
    if (!customer) return [];
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
        id: "archive",
        label: alreadyArchived ? "Already archived" : "Archive customer",
        icon: <Archive size={13} />,
        destructive: !alreadyArchived,
        disabled: alreadyArchived,
        disabledReason: alreadyArchived
          ? "This customer is already archived."
          : undefined,
        onClick: () => setPendingArchive(true),
      },
    ];
  }, [customer, copyLink, copyJson, alreadyArchived]);

  const display =
    customer?.name ?? customer?.email ?? customer?.customerId ?? "(unnamed)";
  const secondary =
    customer?.name && customer.email
      ? customer.email
      : customer?.email && customer.customerId
        ? customer.customerId
        : null;

  // Average paid per invoice in atomic units (bigint-safe).
  let avg = "0";
  if (stats && stats.invoiceCount > 0) {
    try {
      avg = (BigInt(stats.totalPaidAtomic) / BigInt(stats.invoiceCount)).toString();
    } catch {
      /* fall back to "0" */
    }
  }

  return (
    <>
    <Drawer
      open={!!customer}
      onClose={onClose}
      title={customer ? truncate(customer.id, 6, 6) : undefined}
      ariaLabel={customer ? `Customer ${display}` : undefined}
      width={560}
      headerActions={
        customer && (
          <Menu
            ariaLabel="Customer actions"
            trigger={<KebabButton ariaLabel="Customer actions" />}
            actions={menuActions}
          />
        )
      }
      footer={
        customer && (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              leftIcon={<Receipt size={13} />}
              onClick={openInvoices}
            >
              View invoices
            </Button>
          </>
        )
      }
    >
      {customer && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Tabs
            items={TAB_ITEMS}
            value={tab}
            onChange={(v) => setTab(v as DrawerTab)}
            ariaLabel="Customer detail sections"
          />

          <TabPanel value="details" active={tab === "details"}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <section>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <Badge tone={stats && stats.invoiceCount > 0 ? "positive" : "neutral"}>
                    {stats && stats.invoiceCount > 0 ? "active" : "profile"}
                  </Badge>
                  <span className="mono" style={{ fontSize: 11, color: "var(--bone-mute)" }}>
                    {customer.id}
                  </span>
                </div>
                <div
                  className="display"
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    letterSpacing: "-0.022em",
                    color: "var(--bone)",
                    lineHeight: 1.1,
                    marginBottom: 4,
                  }}
                >
                  {display}
                </div>
                {secondary && (
                  <div className="mono" style={{ fontSize: 12, color: "var(--bone-dim)" }}>
                    {secondary}
                  </div>
                )}
                {customer.company && (
                  <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--bone-dim)" }}>
                    {customer.company}
                  </div>
                )}
              </section>

              {stats && (
                <Section label="Activity">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    <Stat label="Invoices" value={stats.invoiceCount.toLocaleString()} />
                    <Stat label="Total paid" value={formatDero(stats.totalPaidAtomic, 5)} suffix="DERO" />
                    <Stat label="Avg invoice" value={formatDero(avg, 5)} suffix="DERO" />
                  </div>
                </Section>
              )}

              <Section label="Identifiers">
                <CopyRow label="Email" value={customer.email} />
                <CopyRow label="Customer ID" value={customer.customerId} mono />
                <CopyRow label="Phone" value={customer.phone} />
              </Section>

              {(customer.tags?.length ?? 0) > 0 && (
                <Section label="Tags">
                  <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                    {(customer.tags ?? []).map((t) => (
                      <span key={t} style={tagStyle}>
                        {t}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {customer.notes && (
                <Section label="Notes">
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--bone-dim)",
                      lineHeight: 1.55,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {customer.notes}
                  </p>
                </Section>
              )}

              <Section label="Lifecycle">
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 12 }}>
                  <TLRow label="Created" value={formatDate(new Date(customer.createdAt).toISOString())} />
                  {customer.updatedAt && <TLRow label="Updated" value={formatDate(new Date(customer.updatedAt).toISOString())} />}
                  {stats?.lastPaymentAt && (
                    <TLRow label="Last payment" value={formatDate(stats.lastPaymentAt)} />
                  )}
                </div>
              </Section>

              {/* Phase 3 #28 — ringsig-aware invoice roll-up. Shows the total
                  number of invoices joined to this customer via the stealth-
                  key fingerprint, with a short list of the most recent ones.
                  Anchored on `invoices.customer_id`, which the monitor
                  populates after fingerprint resolution. */}
              {customerInvoiceCount > 0 && (
                <Section label={`Total payments: ${customerInvoiceCount}`}>
                  <div
                    style={{
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--ink-hair)",
                      overflow: "hidden",
                    }}
                  >
                    {customerInvoices.slice(0, 10).map((inv, i) => (
                      <a
                        key={inv.id}
                        href={`/invoices?drawer=invoice:${encodeURIComponent(
                          inv.id,
                        )}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          gap: 12,
                          padding: "10px 12px",
                          alignItems: "center",
                          background:
                            i % 2 === 0 ? "var(--ink-deep)" : "transparent",
                          borderBottom:
                            i < Math.min(9, customerInvoices.length - 1)
                              ? "1px solid var(--ink-hair)"
                              : "none",
                          fontSize: 12,
                          textDecoration: "none",
                          color: "var(--bone)",
                        }}
                        title={`Open invoice ${inv.id}`}
                      >
                        <code
                          className="mono"
                          style={{
                            color: "var(--bone)",
                            fontSize: 11,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {inv.name || truncate(inv.id, 8, 6)}
                        </code>
                        <span
                          className="mono"
                          style={{
                            color: "var(--bone-dim)",
                            fontSize: 10.5,
                          }}
                          title={inv.status}
                        >
                          {inv.status}
                        </span>
                        <span
                          className="mono"
                          style={{ color: "var(--dero)" }}
                        >
                          {formatDero(inv.amountReceived, 5)}
                        </span>
                      </a>
                    ))}
                  </div>
                  {customerInvoiceCount > customerInvoices.length && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11.5,
                        color: "var(--bone-mute)",
                      }}
                    >
                      Showing {customerInvoices.length} of{" "}
                      {customerInvoiceCount}. Open the invoices page for the
                      full list.
                    </div>
                  )}
                </Section>
              )}
            </div>
          </TabPanel>

          <TabPanel value="timeline" active={tab === "timeline"}>
            <EventTimeline
              events={timelineEvents}
              limit={100}
              compact
              emptyLabel="No events yet for this customer."
            />
          </TabPanel>

          <TabPanel value="metadata" active={tab === "metadata"}>
            <MetadataEditor
              value={customer.metadata ?? {}}
              onSave={saveMetadata}
            />
          </TabPanel>

          <div style={{ marginTop: 16 }}>
            <JsonPanel json={customer} label="Raw customer" />
          </div>
        </div>
      )}
    </Drawer>
    <Dialog
      open={pendingArchive && !!customer}
      onClose={() => {
        if (busy) return;
        setPendingArchive(false);
      }}
      destructive
      title="Archive customer?"
      description="The profile will be hidden from the main directory but existing invoices and disputes remain linked. You can restore it later from the archive view."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => setPendingArchive(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={busy}
            onClick={() => void runArchive()}
          >
            Archive
          </Button>
        </>
      }
    />
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="eyebrow-mono" style={{ marginBottom: 8, color: "var(--bone-mute)" }}>
        {label}
      </div>
      {children}
    </section>
  );
}

function TLRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="eyebrow-mono" style={{ color: "var(--bone-mute)" }}>{label}</span>
      <span className="mono" style={{ color: "var(--bone)" }}>{value}</span>
    </>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--ink-hair)",
        background: "var(--ink-deep)",
      }}
    >
      <div className="eyebrow-mono" style={{ color: "var(--bone-mute)", fontSize: 10, marginBottom: 4 }}>
        {label}
      </div>
      <div
        className="mono"
        style={{ color: "var(--bone)", fontSize: 13, fontVariantNumeric: "tabular-nums slashed-zero" }}
      >
        {value}
        {suffix && (
          <span style={{ marginLeft: 4, fontSize: 9.5, letterSpacing: "0.14em", color: "var(--bone-quiet)" }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function CopyRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  if (!value) {
    return (
      <Row label={label}>
        <span style={{ color: "var(--bone-quiet)", fontStyle: "italic", fontSize: 12 }}>—</span>
      </Row>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
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
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          fontSize: mono ? 11 : 12.5,
          textAlign: "left",
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        <span
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={value}
        >
          {mono && value.length > 24 ? truncate(value, 12, 6) : value}
        </span>
        {copied ? <Check size={12} color="var(--dero)" /> : <Copy size={12} />}
      </button>
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
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
      <span className="eyebrow-mono" style={{ color: "var(--bone-mute)", fontSize: 10 }}>
        {label}
      </span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

const tagStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "2px 8px",
  borderRadius: 4,
  background: "var(--ink-elev-2)",
  border: "1px solid var(--ink-hair)",
  color: "var(--bone-dim)",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
