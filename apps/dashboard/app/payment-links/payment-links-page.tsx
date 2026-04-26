"use client";

/**
 * Payment Links — merchant admin (Phase 3 #32).
 *
 * Lists every active/revoked payment link the merchant has created, with
 * inline actions: copy public URL, open the public page in a new tab,
 * revoke. A "+ Create payment link" button opens a modal form.
 *
 * Reuses the dashboard shell so the page inherits the sidebar + top chrome.
 * The public `/pay/<link>` page is hosted on the same origin by default.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Copy, ExternalLink, Link2, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { Button, Dialog, Input, ListShell } from "@/components/ui";
import { TextArea } from "@/components/ui/Input";
import { useToast } from "@/components/toast";
import { formatDate } from "@/lib/format";
import type { PaymentLink } from "@/lib/mock-payment-links";

const ATOMIC_PER_DERO = 100_000n;

type LinkStats = {
  views: number;
  invoiceStarts: number;
  paidInvoices: number;
  conversionRate: number;
};

type PaymentLinkRow = PaymentLink & {
  stats?: LinkStats;
};

function formatDero(atomic: string | null | undefined): string {
  if (!atomic) return "Pay-what-you-want";
  let v: bigint;
  try {
    v = BigInt(atomic);
  } catch {
    return atomic;
  }
  const whole = v / ATOMIC_PER_DERO;
  const frac = v % ATOMIC_PER_DERO;
  if (frac === 0n) return `${whole.toString()} DERO`;
  const fracStr = frac.toString().padStart(5, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr} DERO`;
}

function linkStatus(l: PaymentLink): {
  label: string;
  tone: "good" | "bad" | "muted";
} {
  if (l.revokedAt) return { label: "Revoked", tone: "bad" };
  if (l.expiresAt && l.expiresAt <= Date.now())
    return { label: "Expired", tone: "bad" };
  const limit = l.usageLimit ?? l.maxUses ?? null;
  const used = l.usedCount ?? l.usesCount ?? 0;
  if (limit !== null && used >= limit)
    return { label: "Exhausted", tone: "bad" };
  return { label: "Active", tone: "good" };
}

function publicUrl(l: PaymentLink): string {
  const base =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/pay/${l.slug ?? l.id}`;
}

export function PaymentLinksPage() {
  const { toast } = useToast();
  const [links, setLinks] = useState<PaymentLinkRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/pay/payment-links?includeRevoked=1", {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { links: PaymentLinkRow[] };
      setLinks(data.links ?? []);
    } catch (err) {
      toast({
        title: "Failed to load links",
        description: err instanceof Error ? err.message : "Network error",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCopy = useCallback(
    async (l: PaymentLink) => {
      try {
        await navigator.clipboard.writeText(publicUrl(l));
        toast({ title: "URL copied", tone: "success" });
      } catch {
        toast({ title: "Copy failed", tone: "error" });
      }
    },
    [toast]
  );

  const handleRevoke = useCallback(
    async (l: PaymentLink) => {
      if (!window.confirm(`Revoke "${l.name}"? This cannot be undone.`)) {
        return;
      }
      try {
        const r = await fetch(
          `/api/pay/payment-links/${encodeURIComponent(l.id)}`,
          { method: "DELETE" }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        toast({ title: "Link revoked", tone: "success" });
        void refresh();
      } catch (err) {
        toast({
          title: "Revoke failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [refresh, toast]
  );

  const rows = useMemo(() => links ?? [], [links]);

  return (
    <DashboardShell>
      <ListShell
        index="03"
        eyebrow="Payment Links"
        title="Shareable checkout URLs."
        subtitle="Create no-auth links that generate an invoice when opened. Revenue lands in the same wallet as normal invoices."
        primaryAction={
          <Button
            variant="primary"
            leftIcon={<Plus size={14} />}
            onClick={() => setShowCreate(true)}
          >
            Create payment link
          </Button>
        }
      >
        {loading && !links ? (
          <div
            style={{
              padding: "48px 0",
              textAlign: "center",
              color: "var(--bone-dim)",
              fontSize: 13,
            }}
          >
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Link2 size={28} />}
            title="No payment links yet"
            description="Create a link to collect payments from anyone with just a URL. Perfect for tip jars, donation pages, invoices-by-email, or one-off product links."
            action={
              <Button
                variant="primary"
                leftIcon={<Plus size={14} />}
                onClick={() => setShowCreate(true)}
              >
                Create your first link
              </Button>
            }
          />
        ) : (
          <div
            style={{
              border: "1px solid var(--ink-hair)",
              borderRadius: "var(--radius)",
              overflow: "hidden",
              background: "var(--ink-elev)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    background: "var(--ink)",
                    borderBottom: "1px solid var(--ink-hair)",
                  }}
                >
                  <Th>Name</Th>
                  <Th>Amount</Th>
                  <Th>Views</Th>
                  <Th>Starts</Th>
                  <Th>Paid</Th>
                  <Th>Conv.</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th style={{ textAlign: "right" }}>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const status = linkStatus(l);
                  const limit = l.usageLimit ?? l.maxUses ?? null;
                  const used = l.usedCount ?? l.usesCount ?? 0;
                  const stats = l.stats;
                  return (
                    <tr
                      key={l.id}
                      style={{
                        borderBottom: "1px solid var(--ink-hair)",
                      }}
                    >
                      <Td>
                        <div style={{ fontWeight: 500 }}>{l.name}</div>
                        {l.description && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "var(--bone-mute)",
                              marginTop: 2,
                              maxWidth: 320,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {l.description}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <span style={{ fontFamily: "var(--font-mono)" }}>
                          {formatDero(l.amountAtomic)}
                        </span>
                      </Td>
                      <Td>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            color: "var(--bone-dim)",
                          }}
                        >
                          {stats?.views ?? "—"}
                        </span>
                      </Td>
                      <Td>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            color: "var(--bone-dim)",
                          }}
                        >
                          {used}
                          {limit != null ? ` / ${limit}` : ""}
                        </span>
                      </Td>
                      <Td>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            color: "var(--bone-dim)",
                          }}
                        >
                          {stats?.paidInvoices ?? "—"}
                        </span>
                      </Td>
                      <Td>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            color: "var(--bone-dim)",
                          }}
                        >
                          {stats ? `${(stats.conversionRate * 100).toFixed(1)}%` : "—"}
                        </span>
                      </Td>
                      <Td>
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      </Td>
                      <Td style={{ color: "var(--bone-dim)", fontSize: 12 }}>
                        {formatDate(new Date(l.createdAt).toISOString())}
                      </Td>
                      <Td style={{ textAlign: "right" }}>
                        <div
                          style={{
                            display: "inline-flex",
                            gap: 4,
                            alignItems: "center",
                          }}
                        >
                          <IconButton
                            title="Copy URL"
                            onClick={() => void handleCopy(l)}
                          >
                            <Copy size={13} />
                          </IconButton>
                          <IconButton
                            as="a"
                            title="Open in new tab"
                            href={publicUrl(l)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={13} />
                          </IconButton>
                          {!l.revokedAt && (
                            <IconButton
                              title="Revoke"
                              onClick={() => void handleRevoke(l)}
                              tone="danger"
                            >
                              <X size={13} />
                            </IconButton>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ListShell>

      <CreateLinkDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          void refresh();
        }}
      />
    </DashboardShell>
  );
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

function Th({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        padding: "10px 14px",
        fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--bone-quiet)",
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <td style={{ padding: "12px 14px", verticalAlign: "middle", ...style }}>
      {children}
    </td>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "good" | "bad" | "muted";
}) {
  const bg =
    tone === "good"
      ? "rgba(94,196,134,0.15)"
      : tone === "bad"
        ? "rgba(224,93,68,0.15)"
        : "var(--ink-elev-2)";
  const fg =
    tone === "good"
      ? "var(--dero)"
      : tone === "bad"
        ? "var(--vermilion)"
        : "var(--bone-dim)";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10.5,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.08em",
        padding: "2px 8px",
        borderRadius: 999,
        background: bg,
        color: fg,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

function IconButton({
  children,
  onClick,
  title,
  href,
  target,
  rel,
  as,
  tone,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
  href?: string;
  target?: string;
  rel?: string;
  as?: "a";
  tone?: "danger";
}) {
  const style: React.CSSProperties = {
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid var(--ink-hair)",
    borderRadius: 6,
    background: "transparent",
    color: tone === "danger" ? "var(--vermilion)" : "var(--bone-dim)",
    cursor: "pointer",
    textDecoration: "none",
  };
  if (as === "a" && href) {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        title={title}
        aria-label={title}
        style={style}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={style}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

function CreateLinkDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(""); // decimal DERO, optional
  const [usageLimit, setUsageLimit] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setAmount("");
    setUsageLimit("");
    setExpiresInDays("");
    setRedirectUrl("");
  }, [open]);

  const submit = useCallback(async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", tone: "error" });
      return;
    }
    const body: Record<string, unknown> = {
      name: name.trim(),
    };
    if (description.trim()) body.description = description.trim();
    if (redirectUrl.trim()) body.redirectUrl = redirectUrl.trim();

    if (amount.trim()) {
      // Convert decimal DERO to atomic units string.
      const m = amount.trim().match(/^(\d+)(?:\.(\d{1,12}))?$/);
      if (!m) {
        toast({
          title: "Invalid amount",
          description: "Use a positive decimal like 5 or 0.5",
          tone: "error",
        });
        return;
      }
      const whole = BigInt(m[1]);
      const frac = (m[2] ?? "").padEnd(5, "0");
      const atomic = whole * ATOMIC_PER_DERO + BigInt(frac);
      body.amount = atomic.toString();
    }

    if (usageLimit.trim()) {
      const n = Number(usageLimit);
      if (!Number.isInteger(n) || n <= 0) {
        toast({
          title: "Invalid usage limit",
          tone: "error",
        });
        return;
      }
      body.usageLimit = n;
    }

    if (expiresInDays.trim()) {
      const days = Number(expiresInDays);
      if (!Number.isFinite(days) || days <= 0) {
        toast({ title: "Invalid expiry", tone: "error" });
        return;
      }
      body.expiresAt = Date.now() + Math.round(days * 86_400_000);
    }

    setSubmitting(true);
    try {
      const r = await fetch("/api/pay/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
        throw new Error(data.message ?? data.error ?? `HTTP ${r.status}`);
      }
      toast({ title: "Payment link created", tone: "success" });
      onCreated();
    } catch (err) {
      toast({
        title: "Create failed",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    name,
    description,
    amount,
    usageLimit,
    expiresInDays,
    redirectUrl,
    onCreated,
    toast,
  ]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create payment link"
      description="Anyone with the URL can open this link and pay. Leave the amount blank for pay-what-you-want."
      width={520}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            loading={submitting}
          >
            Create link
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Input
          label="Name"
          placeholder="Coffee fund"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <TextArea
          label="Description"
          placeholder="Optional — shown to the payer on the public page."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        <Input
          label="Amount (DERO)"
          hint="Leave blank for pay-what-you-want"
          placeholder="5"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          mono
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input
            label="Usage limit"
            hint="Blank = unlimited"
            placeholder="100"
            value={usageLimit}
            onChange={(e) => setUsageLimit(e.target.value)}
            inputMode="numeric"
            mono
          />
          <Input
            label="Expires in days"
            hint="Blank = never"
            placeholder="30"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            inputMode="numeric"
            mono
          />
        </div>
        <Input
          label="Redirect URL (optional)"
          hint="Payer is redirected here after a confirmed payment"
          placeholder="https://example.com/thanks"
          value={redirectUrl}
          onChange={(e) => setRedirectUrl(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
