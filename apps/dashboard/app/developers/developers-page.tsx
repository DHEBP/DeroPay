"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Book,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCw,
  Send,
  ShieldAlert,
  Trash2,
  Webhook as WebhookIcon,
  X,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/toast";
import { useInitialTestMode } from "@/lib/test-mode-context";
import { useLiveFetch } from "@/lib/useLiveFetch";
import { JsonPanel } from "@/components/json-panel";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/Tabs";
import { ApiShell } from "@/components/api-shell";

/** Event types a merchant can subscribe to. Mirrors server webhook emits. */
const WEBHOOK_EVENT_TYPES = [
  "invoice.created",
  "invoice.paid",
  "invoice.expired",
  "payout.sent",
  "payout.failed",
] as const;

type ApiKeyPublic = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

type CreatedApiKey = {
  id: string;
  key: string;
  prefix: string;
  createdAt: number;
};

type Webhook = {
  id: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  createdAt: number;
  lastDeliveryAt: number | null;
  lastDeliveryStatus: number | null;
};

type EventRecord = {
  id: string;
  type: string;
  invoiceId: string | null;
  payload: Record<string, unknown>;
  createdAt: number;
};

/** Phase 2 #17: a single webhook delivery row from the console feed. */
type WebhookDelivery = {
  id: string;
  endpointUrl: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempts: number;
  lastAttemptAt: number | null;
  lastStatusCode: number | null;
  lastResponseBody: string | null;
  lastError: string | null;
  nextRetryAt: number | null;
  deliveredAt: number | null;
  failedAt: number | null;
  createdAt: number;
};

type SigningSecret = {
  id: string;
  createdAt: number;
  expiresAt: number | null;
  isActive: boolean;
};

type DeliveryStatus = "delivered" | "failed" | "pending";

function deliveryStatus(d: WebhookDelivery): DeliveryStatus {
  if (d.deliveredAt != null) return "delivered";
  if (d.failedAt != null) return "failed";
  return "pending";
}

/** Resend window for the console — matches server-side RESEND_WINDOW_MS. */
const RESEND_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Demo-mode fixtures + in-memory store
// ---------------------------------------------------------------------------

const demoKeys: ApiKeyPublic[] = [
  {
    id: "ak_demo_01",
    name: "Main checkout",
    keyPrefix: "dp_live_",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 21,
    lastUsedAt: Date.now() - 1000 * 60 * 12,
    revokedAt: null,
  },
  {
    id: "ak_demo_02",
    name: "Server batch jobs",
    keyPrefix: "dp_live_",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 60,
    lastUsedAt: Date.now() - 1000 * 60 * 60 * 3,
    revokedAt: null,
  },
];

const demoWebhooks: Webhook[] = [
  {
    id: "wh_demo_01",
    url: "https://shop.example.com/hooks/deropay",
    secret: "***redacted***",
    events: ["invoice.created", "invoice.paid"],
    enabled: true,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10,
    lastDeliveryAt: Date.now() - 1000 * 60 * 60 * 2,
    lastDeliveryStatus: 200,
  },
];

const demoEvents: EventRecord[] = Array.from({ length: 18 }, (_, i) => {
  const types = WEBHOOK_EVENT_TYPES;
  const type = types[i % types.length] ?? "invoice.created";
  return {
    id: `evt_demo_${i.toString().padStart(3, "0")}`,
    type,
    invoiceId: i % 4 === 0 ? null : `inv_${(1000 + i).toString()}`,
    payload: {
      id: `evt_demo_${i}`,
      amount: (0.5 + i * 0.1).toFixed(4),
      status: type === "invoice.paid" ? "completed" : "pending",
    },
    createdAt: Date.now() - i * 1000 * 60 * 7,
  };
});

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DevelopersPage() {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();

  // Keys
  const [keys, setKeys] = useState<ApiKeyPublic[]>(isDemo ? demoKeys : []);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [freshKey, setFreshKey] = useState<CreatedApiKey | null>(null);

  // Webhooks
  const [webhooks, setWebhooks] = useState<Webhook[]>(
    isDemo ? demoWebhooks : []
  );
  const [showCreateWebhook, setShowCreateWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [webhookSecret, setWebhookSecret] = useState("");

  // Events
  const [events, setEvents] = useState<EventRecord[]>(isDemo ? demoEvents : []);
  const [eventType, setEventType] = useState<string>("all");
  const [eventLimit, setEventLimit] = useState(25);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [eventTotal, setEventTotal] = useState<number>(
    isDemo ? demoEvents.length : 0
  );

  // --- Webhook delivery console (Phase 2 #17) ---------------------------

  // URL sync: ?delivery=<id> pre-expands the matching row on mount.
  // (We read on first render only; subsequent in-page expand/collapse is
  // tracked in state without further URL writes to avoid navigation churn.)
  const initialDeliveryIdRef = useRef<string | null>(null);
  if (
    typeof window !== "undefined" &&
    initialDeliveryIdRef.current === null &&
    window.location.search.length > 0
  ) {
    const params = new URLSearchParams(window.location.search);
    initialDeliveryIdRef.current = params.get("delivery");
  }

  const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(
    initialDeliveryIdRef.current
  );
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deliveryEndpointFilter, setDeliveryEndpointFilter] = useState("");
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<
    "all" | DeliveryStatus
  >("all");

  const {
    data: deliveriesData,
    loading: deliveriesLoading,
    refresh: refreshDeliveries,
  } = useLiveFetch<{ deliveries: WebhookDelivery[] }>(
    isDemo ? null : "webhook-deliveries",
    async () => {
      const res = await fetch("/api/pay/webhooks/deliveries?limit=100");
      if (!res.ok) throw new Error(`Delivery fetch failed (${res.status})`);
      return (await res.json()) as { deliveries: WebhookDelivery[] };
    },
    { refreshInterval: 60_000, events: ["webhook.*"] }
  );

  const deliveries: WebhookDelivery[] = deliveriesData?.deliveries ?? [];

  // --- Signing secrets ---------------------------------------------------

  const {
    data: secretsData,
    refresh: refreshSecrets,
  } = useLiveFetch<{ secrets: SigningSecret[] }>(
    isDemo ? null : "webhook-secrets",
    async () => {
      const res = await fetch("/api/pay/webhooks/secrets");
      if (!res.ok) throw new Error(`Secrets fetch failed (${res.status})`);
      return (await res.json()) as { secrets: SigningSecret[] };
    },
    { refreshInterval: 30_000 }
  );

  const secrets: SigningSecret[] = secretsData?.secrets ?? [];
  const [freshSecret, setFreshSecret] = useState<{
    id: string;
    secret: string;
  } | null>(null);
  const [rotating, setRotating] = useState(false);

  // Reference snippet
  const [showReference, setShowReference] = useState(false);

  // Phase 3 #36 — top-level tabs: "Webhooks & keys" vs "API playground".
  const [activeTab, setActiveTab] = useState<"console" | "playground">(
    "console"
  );
  const TAB_ITEMS: TabItem[] = [
    { value: "console", label: "Webhooks & keys" },
    { value: "playground", label: "API playground" },
  ];

  // --- Fetching ---------------------------------------------------------

  const fetchKeys = useCallback(async () => {
    if (isDemo) return;
    try {
      const data = await apiFetch<{ keys: ApiKeyPublic[] }>(
        "/api/pay/developers/keys"
      );
      setKeys(data.keys ?? []);
    } catch {
      /* silent — banner-level errors would be noisy here */
    }
  }, []);

  const fetchWebhooks = useCallback(async () => {
    if (isDemo) return;
    try {
      const data = await apiFetch<{ webhooks: Webhook[] }>(
        "/api/pay/developers/webhooks"
      );
      setWebhooks(data.webhooks ?? []);
    } catch {
      /* silent */
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    if (isDemo) {
      const filtered =
        eventType === "all"
          ? demoEvents
          : demoEvents.filter((e) => e.type === eventType);
      setEvents(filtered.slice(0, eventLimit));
      setEventTotal(filtered.length);
      return;
    }
    try {
      const params = new URLSearchParams({
        limit: String(eventLimit),
        offset: "0",
      });
      if (eventType !== "all") params.set("type", eventType);
      const data = await apiFetch<{ events: EventRecord[]; total: number }>(
        `/api/pay/developers/events?${params.toString()}`
      );
      setEvents(data.events ?? []);
      setEventTotal(data.total ?? 0);
    } catch {
      /* silent */
    }
  }, [eventType, eventLimit]);

  useEffect(() => {
    fetchKeys();
    fetchWebhooks();
  }, [fetchKeys, fetchWebhooks]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // --- Actions ----------------------------------------------------------

  const createKey = useCallback(async () => {
    const name = keyName.trim();
    if (!name) {
      toast({ title: "Name required", tone: "warn" });
      return;
    }

    if (isDemo) {
      const id = `ak_demo_${Math.floor(Math.random() * 1e6).toString(16)}`;
      const secret = Array.from({ length: 24 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("");
      const fullKey = `dp_live_${secret}`;
      const created: CreatedApiKey = {
        id,
        key: fullKey,
        prefix: "dp_live_",
        createdAt: Date.now(),
      };
      setKeys((prev) => [
        {
          id,
          name,
          keyPrefix: "dp_live_",
          createdAt: created.createdAt,
          lastUsedAt: null,
          revokedAt: null,
        },
        ...prev,
      ]);
      setFreshKey(created);
      setKeyName("");
      setShowCreateKey(false);
      return;
    }

    try {
      const created = await apiFetch<CreatedApiKey>(
        "/api/pay/developers/keys",
        { method: "POST", body: JSON.stringify({ name }) }
      );
      setFreshKey(created);
      setKeyName("");
      setShowCreateKey(false);
      fetchKeys();
    } catch (err) {
      toast({
        title: "Couldn't create key",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    }
  }, [keyName, toast, fetchKeys]);

  const revokeKey = useCallback(
    async (id: string) => {
      if (!confirm("Revoke this API key? This cannot be undone.")) return;
      if (isDemo) {
        setKeys((prev) =>
          prev.map((k) =>
            k.id === id ? { ...k, revokedAt: Date.now() } : k
          )
        );
        return;
      }
      try {
        await apiFetch(`/api/pay/developers/keys/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        fetchKeys();
        toast({ title: "Key revoked", tone: "info" });
      } catch (err) {
        toast({
          title: "Revoke failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [toast, fetchKeys]
  );

  const createWebhook = useCallback(async () => {
    const url = webhookUrl.trim();
    if (!url) {
      toast({ title: "URL required", tone: "warn" });
      return;
    }
    if (webhookEvents.length === 0) {
      toast({ title: "Select at least one event", tone: "warn" });
      return;
    }

    if (isDemo) {
      const id = `wh_demo_${Math.floor(Math.random() * 1e6).toString(16)}`;
      const hook: Webhook = {
        id,
        url,
        secret: webhookSecret || "***generated***",
        events: webhookEvents,
        enabled: true,
        createdAt: Date.now(),
        lastDeliveryAt: null,
        lastDeliveryStatus: null,
      };
      setWebhooks((prev) => [hook, ...prev]);
      setWebhookUrl("");
      setWebhookEvents([]);
      setWebhookSecret("");
      setShowCreateWebhook(false);
      toast({ title: "Webhook registered", tone: "success" });
      return;
    }

    try {
      await apiFetch<Webhook>("/api/pay/developers/webhooks", {
        method: "POST",
        body: JSON.stringify({
          url,
          events: webhookEvents,
          ...(webhookSecret ? { secret: webhookSecret } : {}),
        }),
      });
      setWebhookUrl("");
      setWebhookEvents([]);
      setWebhookSecret("");
      setShowCreateWebhook(false);
      fetchWebhooks();
      toast({ title: "Webhook registered", tone: "success" });
    } catch (err) {
      toast({
        title: "Couldn't register webhook",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    }
  }, [
    webhookUrl,
    webhookEvents,
    webhookSecret,
    toast,
    fetchWebhooks,
  ]);

  const deleteWebhook = useCallback(
    async (id: string) => {
      if (!confirm("Delete this webhook endpoint?")) return;
      if (isDemo) {
        setWebhooks((prev) => prev.filter((w) => w.id !== id));
        return;
      }
      try {
        await apiFetch(
          `/api/pay/developers/webhooks/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );
        fetchWebhooks();
        toast({ title: "Webhook deleted", tone: "info" });
      } catch (err) {
        toast({
          title: "Delete failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [toast, fetchWebhooks]
  );

  const copyToClipboard = useCallback(
    async (text: string, label = "Copied") => {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: label, tone: "success" });
      } catch {
        toast({ title: "Couldn't copy", tone: "error" });
      }
    },
    [toast]
  );

  const eventTypeOptions = useMemo(
    () => ["all", ...WEBHOOK_EVENT_TYPES],
    []
  );

  const hasMoreEvents = events.length < eventTotal;

  // --- Delivery console actions ----------------------------------------

  const resendDelivery = useCallback(
    async (id: string) => {
      setResendingId(id);
      try {
        const res = await fetch(
          `/api/pay/webhooks/deliveries/${encodeURIComponent(id)}/resend`,
          { method: "POST" }
        );
        if (res.status === 410) {
          toast({
            title: "Delivery too old to resend",
            description: "The 15-day resend window has elapsed.",
            tone: "warn",
          });
          return;
        }
        if (!res.ok) {
          let message = `Resend failed (${res.status})`;
          try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) message = body.error;
          } catch {
            /* keep default */
          }
          throw new Error(message);
        }
        toast({ title: "Delivery resent", tone: "success" });
        await refreshDeliveries();
      } catch (err) {
        toast({
          title: "Couldn't resend",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      } finally {
        setResendingId(null);
      }
    },
    [toast, refreshDeliveries]
  );

  const filteredDeliveries = useMemo(() => {
    const term = deliveryEndpointFilter.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (deliveryStatusFilter !== "all" && deliveryStatus(d) !== deliveryStatusFilter) {
        return false;
      }
      if (term && !d.endpointUrl.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [deliveries, deliveryEndpointFilter, deliveryStatusFilter]);

  // --- Signing secret actions ------------------------------------------

  const rotateSecret = useCallback(async () => {
    if (
      !confirm(
        "Rotate signing secret?\n\nThe current secret will remain valid for 24 hours so in-flight deliveries finish. Make sure you update your webhook receiver BEFORE the grace period ends."
      )
    ) {
      return;
    }
    setRotating(true);
    try {
      const res = await fetch("/api/pay/webhooks/secrets/rotate", {
        method: "POST",
      });
      if (!res.ok) {
        let message = `Rotation failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          /* keep default */
        }
        throw new Error(message);
      }
      const body = (await res.json()) as {
        id: string;
        secret: string;
      };
      setFreshSecret({ id: body.id, secret: body.secret });
      await refreshSecrets();
    } catch (err) {
      toast({
        title: "Rotation failed",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setRotating(false);
    }
  }, [toast, refreshSecrets]);

  const revokeSecret = useCallback(
    async (id: string) => {
      if (
        !confirm(
          "Revoke this retiring secret immediately? Any in-flight deliveries signed with it will fail verification."
        )
      ) {
        return;
      }
      try {
        const res = await fetch(
          `/api/pay/webhooks/secrets/${encodeURIComponent(id)}/revoke`,
          { method: "POST" }
        );
        if (!res.ok) {
          let message = `Revoke failed (${res.status})`;
          try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) message = body.error;
          } catch {
            /* keep default */
          }
          throw new Error(message);
        }
        toast({ title: "Secret revoked", tone: "info" });
        await refreshSecrets();
      } catch (err) {
        toast({
          title: "Revoke failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [toast, refreshSecrets]
  );

  return (
    <DashboardShell>
      <PageHeader
        index="08"
        eyebrow="Developers"
        title="API keys, webhooks, event log."
        subtitle="Integrate DeroPay into your commerce stack. Secrets are hashed at rest and shown only once at creation."
        action={
          <a
            href="https://deropay.com/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-mini"
            style={{ textDecoration: "none" }}
          >
            <Book size={12} /> API reference <ArrowUpRight size={12} />
          </a>
        }
      />

      {/* ============================================================ */}
      {/* TOP-LEVEL TABS — Phase 3 #36                                   */}
      {/* ============================================================ */}
      <div style={{ marginBottom: 16 }}>
        <Tabs
          items={TAB_ITEMS}
          value={activeTab}
          onChange={(v) => setActiveTab(v as "console" | "playground")}
          variant="underline"
          ariaLabel="Developers sections"
        />
      </div>

      <TabPanel value="console" active={activeTab === "console"}>

      {/* ============================================================ */}
      {/* API KEYS                                                       */}
      {/* ============================================================ */}
      <Section
        icon={<KeyRound size={14} />}
        title="API Keys"
        subtitle="Used to authenticate server-side calls. Keep them secret — treat them like passwords."
        action={
          <button
            className={showCreateKey ? "btn btn-ghost btn-mini" : "btn btn-primary btn-mini"}
            onClick={() => setShowCreateKey((v) => !v)}
          >
            {showCreateKey ? <X size={12} /> : <Plus size={12} />}
            {showCreateKey ? "Cancel" : "New key"}
          </button>
        }
      >
        <AnimatePresence initial={false}>
          {showCreateKey && (
            <motion.div
              key="create-key"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: "hidden", marginBottom: 14 }}
            >
              <div style={formPanelStyle}>
                <label style={labelStyle} htmlFor="key-name">
                  Name this key
                </label>
                <input
                  id="key-name"
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g., Production checkout"
                  style={inputStyle}
                  autoFocus
                />
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="btn btn-primary btn-mini" onClick={createKey}>
                    Create key
                  </button>
                  <button
                    className="btn btn-ghost btn-mini"
                    onClick={() => {
                      setShowCreateKey(false);
                      setKeyName("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {freshKey && (
            <motion.div
              key="fresh-key"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              style={{
                marginBottom: 14,
                padding: "16px 18px",
                border: "1px solid var(--dero-hair)",
                background: "var(--dero-wash)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div
                className="eyebrow"
                style={{ color: "var(--dero)", marginBottom: 8 }}
              >
                Your new API key · one-time view
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--bone-dim)",
                  lineHeight: 1.55,
                  margin: "0 0 12px",
                }}
              >
                Copy this key now — it will not be shown again. If you lose it,
                revoke the key and create a new one.
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: "var(--ink-deep)",
                  border: "1px solid var(--ink-hair)",
                  borderRadius: "var(--radius-sm)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--bone)",
                  wordBreak: "break-all",
                }}
              >
                <code style={{ flex: 1 }}>{freshKey.key}</code>
                <button
                  className="btn btn-ghost btn-mini"
                  onClick={() => copyToClipboard(freshKey.key, "Key copied")}
                  style={{ flexShrink: 0 }}
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
              <div style={{ marginTop: 10, textAlign: "right" }}>
                <button
                  className="btn btn-ghost btn-mini"
                  onClick={() => setFreshKey(null)}
                >
                  <Check size={12} /> I saved it
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {keys.length === 0 ? (
          <EmptyRow
            icon={<KeyRound size={16} />}
            label="No API keys yet."
          />
        ) : (
          <Table
            columns={["Name", "Prefix", "Created", "Last used", ""]}
          >
            {keys.map((k) => {
              const revoked = k.revokedAt !== null;
              return (
                <tr
                  key={k.id}
                  style={{ opacity: revoked ? 0.5 : 1 }}
                >
                  <td style={tdStyle}>
                    {k.name}
                    {revoked && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          color: "var(--warn, #b85b3a)",
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                        }}
                      >
                        Revoked
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono)" }}>
                    {k.keyPrefix}…
                  </td>
                  <td style={tdStyle}>{formatDate(k.createdAt)}</td>
                  <td style={tdStyle}>
                    {k.lastUsedAt ? formatRelative(k.lastUsedAt) : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {!revoked && (
                      <button
                        className="btn btn-ghost btn-mini"
                        onClick={() => revokeKey(k.id)}
                        title="Revoke key"
                      >
                        <Trash2 size={12} /> Revoke
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      {/* ============================================================ */}
      {/* WEBHOOKS                                                       */}
      {/* ============================================================ */}
      <Section
        icon={<WebhookIcon size={14} />}
        title="Webhooks"
        subtitle="Receive HTTP callbacks when invoices or payouts change state. Each delivery is signed with the endpoint's secret."
        action={
          <button
            className={
              showCreateWebhook ? "btn btn-ghost btn-mini" : "btn btn-primary btn-mini"
            }
            onClick={() => setShowCreateWebhook((v) => !v)}
          >
            {showCreateWebhook ? <X size={12} /> : <Plus size={12} />}
            {showCreateWebhook ? "Cancel" : "Add webhook"}
          </button>
        }
      >
        <AnimatePresence initial={false}>
          {showCreateWebhook && (
            <motion.div
              key="create-webhook"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: "hidden", marginBottom: 14 }}
            >
              <div style={formPanelStyle}>
                <label style={labelStyle} htmlFor="wh-url">
                  Endpoint URL
                </label>
                <input
                  id="wh-url"
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://your-app.example/deropay-webhook"
                  style={inputStyle}
                />

                <label style={{ ...labelStyle, marginTop: 14 }}>
                  Events to subscribe to
                </label>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {WEBHOOK_EVENT_TYPES.map((type) => {
                    const active = webhookEvents.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          setWebhookEvents((prev) =>
                            active
                              ? prev.filter((t) => t !== type)
                              : [...prev, type]
                          )
                        }
                        style={{
                          padding: "5px 11px",
                          borderRadius: 999,
                          border: `1px solid ${
                            active ? "var(--dero)" : "var(--ink-hair)"
                          }`,
                          background: active
                            ? "var(--dero-wash)"
                            : "transparent",
                          color: active ? "var(--dero)" : "var(--bone-dim)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                          letterSpacing: "0.08em",
                          cursor: "pointer",
                          transition: "all 0.15s var(--ease-out)",
                        }}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>

                <label style={{ ...labelStyle, marginTop: 14 }} htmlFor="wh-secret">
                  Signing secret <span style={{ opacity: 0.6 }}>(optional)</span>
                </label>
                <input
                  id="wh-secret"
                  type="text"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="Leave blank to auto-generate a 64-char hex secret"
                  style={inputStyle}
                />

                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button
                    className="btn btn-primary btn-mini"
                    onClick={createWebhook}
                  >
                    Register webhook
                  </button>
                  <button
                    className="btn btn-ghost btn-mini"
                    onClick={() => {
                      setShowCreateWebhook(false);
                      setWebhookUrl("");
                      setWebhookEvents([]);
                      setWebhookSecret("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {webhooks.length === 0 ? (
          <EmptyRow
            icon={<WebhookIcon size={16} />}
            label="No webhook endpoints yet."
          />
        ) : (
          <Table columns={["URL", "Events", "Enabled", "Last delivery", ""]}>
            {webhooks.map((w) => (
              <tr key={w.id}>
                <td
                  style={{
                    ...tdStyle,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--bone-dim)",
                    maxWidth: 260,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={w.url}
                >
                  {w.url}
                </td>
                <td style={tdStyle}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--bone-dim)",
                    }}
                  >
                    {w.events.join(", ")}
                  </span>
                </td>
                <td style={tdStyle}>
                  <StatusDot ok={w.enabled} label={w.enabled ? "On" : "Off"} />
                </td>
                <td style={tdStyle}>
                  {w.lastDeliveryAt ? (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11.5,
                        color:
                          w.lastDeliveryStatus && w.lastDeliveryStatus >= 300
                            ? "var(--warn, #b85b3a)"
                            : "var(--bone-dim)",
                      }}
                    >
                      {w.lastDeliveryStatus ?? "?"} · {formatRelative(w.lastDeliveryAt)}
                    </span>
                  ) : (
                    <span style={{ color: "var(--bone-quiet)" }}>—</span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <button
                    className="btn btn-ghost btn-mini"
                    onClick={() => deleteWebhook(w.id)}
                    title="Delete webhook"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* ============================================================ */}
      {/* WEBHOOK DELIVERIES — Phase 2 #17 console                       */}
      {/* ============================================================ */}
      <Section
        icon={<Send size={14} />}
        title="Webhook deliveries"
        subtitle="Every outbound delivery attempt, with the full request payload, response body, and a resend button for the last 15 days."
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              value={deliveryEndpointFilter}
              onChange={(e) => setDeliveryEndpointFilter(e.target.value)}
              placeholder="Filter endpoint URL…"
              style={{
                padding: "5px 10px",
                background: "var(--ink-elev-1)",
                color: "var(--bone)",
                border: "1px solid var(--ink-hair)",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                width: 200,
              }}
            />
            <select
              value={deliveryStatusFilter}
              onChange={(e) =>
                setDeliveryStatusFilter(
                  e.target.value as "all" | DeliveryStatus
                )
              }
              style={{
                padding: "5px 10px",
                background: "var(--ink-elev-1)",
                color: "var(--bone-dim)",
                border: "1px solid var(--ink-hair)",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <option value="all">All statuses</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
            <button
              className="btn btn-ghost btn-mini"
              onClick={() => refreshDeliveries()}
              title="Refresh"
              disabled={deliveriesLoading}
            >
              <RefreshCw size={12} />
            </button>
          </div>
        }
      >
        {filteredDeliveries.length === 0 ? (
          <EmptyRow
            icon={<Send size={16} />}
            label={
              deliveries.length === 0
                ? "No deliveries yet."
                : "No deliveries match the current filters."
            }
          />
        ) : (
          <div
            style={{
              border: "1px solid var(--ink-hair)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
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
                <tr style={{ background: "var(--ink-elev-1)" }}>
                  {[
                    "Timestamp",
                    "Event type",
                    "Endpoint",
                    "Status",
                    "Last HTTP",
                    "Attempts",
                    "",
                  ].map((c, i, arr) => (
                    <th
                      key={i}
                      style={{
                        textAlign: i === arr.length - 1 ? "right" : "left",
                        padding: "10px 14px",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--bone-quiet)",
                        fontWeight: 500,
                        borderBottom: "1px solid var(--ink-hair)",
                      }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDeliveries.map((d) => {
                  const expanded = expandedDeliveryId === d.id;
                  const status = deliveryStatus(d);
                  const age = Date.now() - d.createdAt;
                  const resendExpired = age > RESEND_WINDOW_MS;
                  return (
                    <React.Fragment key={d.id}>
                      <tr
                        onClick={() =>
                          setExpandedDeliveryId(expanded ? null : d.id)
                        }
                        style={{
                          cursor: "pointer",
                          background: expanded
                            ? "var(--ink-elev-1)"
                            : "transparent",
                        }}
                      >
                        <td
                          style={{
                            ...tdStyle,
                            fontFamily: "var(--font-mono)",
                            fontSize: 11.5,
                            color: "var(--bone-quiet)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {expanded ? (
                            <ChevronDown
                              size={11}
                              style={{
                                marginRight: 6,
                                verticalAlign: "middle",
                                color: "var(--bone-quiet)",
                              }}
                            />
                          ) : (
                            <ChevronRight
                              size={11}
                              style={{
                                marginRight: 6,
                                verticalAlign: "middle",
                                color: "var(--bone-quiet)",
                              }}
                            />
                          )}
                          {formatDateTime(d.createdAt)}
                        </td>
                        <td style={tdStyle}>
                          <TypeBadge type={d.eventType} />
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            fontFamily: "var(--font-mono)",
                            fontSize: 11.5,
                            color: "var(--bone-dim)",
                            maxWidth: 280,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={d.endpointUrl}
                        >
                          {d.endpointUrl}
                        </td>
                        <td style={tdStyle}>
                          <DeliveryStatusBadge status={status} />
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            fontFamily: "var(--font-mono)",
                            fontSize: 11.5,
                            color:
                              d.lastStatusCode && d.lastStatusCode >= 300
                                ? "var(--vermilion, #b85b3a)"
                                : "var(--bone-dim)",
                          }}
                        >
                          {d.lastStatusCode ?? "—"}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            fontFamily: "var(--font-mono)",
                            color: "var(--bone-dim)",
                          }}
                        >
                          {d.attempts}
                        </td>
                        <td
                          style={{ ...tdStyle, textAlign: "right" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="btn btn-ghost btn-mini"
                            disabled={
                              resendExpired || resendingId === d.id
                            }
                            onClick={() => resendDelivery(d.id)}
                            title={
                              resendExpired
                                ? "Older than 15 days"
                                : "Resend with the current signing secret"
                            }
                          >
                            <RotateCw size={12} />
                            {resendingId === d.id ? "Resending…" : "Resend"}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              padding: "14px 18px 18px",
                              background: "var(--ink-deep)",
                              borderBottom: "1px solid var(--ink-hair)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                              }}
                            >
                              <JsonPanel json={d.payload} label="Payload" />
                              <JsonPanel
                                json={
                                  d.lastResponseBody
                                    ? tryParseJson(d.lastResponseBody)
                                    : {
                                        note: "No response body captured",
                                        lastError: d.lastError,
                                      }
                                }
                                label="Response"
                                defaultOpen
                              />
                              <div
                                style={{
                                  display: "flex",
                                  gap: 14,
                                  flexWrap: "wrap",
                                  fontSize: 11.5,
                                  color: "var(--bone-dim)",
                                  fontFamily: "var(--font-mono)",
                                }}
                              >
                                <span>Delivery ID · {d.id}</span>
                                <span>
                                  Last attempt ·{" "}
                                  {d.lastAttemptAt
                                    ? formatDateTime(d.lastAttemptAt)
                                    : "—"}
                                </span>
                                {d.nextRetryAt && (
                                  <span>
                                    Next retry ·{" "}
                                    {formatDateTime(d.nextRetryAt)}
                                  </span>
                                )}
                                {d.lastError && (
                                  <span
                                    style={{
                                      color: "var(--vermilion, #b85b3a)",
                                    }}
                                  >
                                    Error · {d.lastError}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ============================================================ */}
      {/* SIGNING SECRETS — Phase 2 #17 rotation with 24h grace          */}
      {/* ============================================================ */}
      <Section
        icon={<ShieldAlert size={14} />}
        title="Signing secrets"
        subtitle="The active secret signs every outbound delivery. Rotate to issue a new one; the old secret stays valid for 24 hours so in-flight receivers can cut over."
        action={
          <button
            className="btn btn-primary btn-mini"
            onClick={rotateSecret}
            disabled={rotating}
          >
            <RotateCw size={12} /> {rotating ? "Rotating…" : "Rotate"}
          </button>
        }
      >
        <AnimatePresence>
          {freshSecret && (
            <motion.div
              key="fresh-secret"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              style={{
                marginBottom: 14,
                padding: "16px 18px",
                border: "1px solid var(--amber, #c39a4e)",
                background: "var(--ink-elev-1)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div
                className="eyebrow"
                style={{
                  color: "var(--amber, #c39a4e)",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <AlertTriangle size={12} /> New signing secret · one-time view
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--bone-dim)",
                  lineHeight: 1.55,
                  margin: "0 0 12px",
                }}
              >
                Save this now — it will not be shown again. Deploy it to your
                webhook receiver within 24 hours; the previous secret stays
                valid until then.
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: "var(--ink-deep)",
                  border: "1px solid var(--ink-hair)",
                  borderRadius: "var(--radius-sm)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--bone)",
                  wordBreak: "break-all",
                }}
              >
                <code style={{ flex: 1 }}>{freshSecret.secret}</code>
                <button
                  className="btn btn-ghost btn-mini"
                  onClick={() =>
                    copyToClipboard(freshSecret.secret, "Secret copied")
                  }
                  style={{ flexShrink: 0 }}
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
              <div style={{ marginTop: 10, textAlign: "right" }}>
                <button
                  className="btn btn-ghost btn-mini"
                  onClick={() => setFreshSecret(null)}
                >
                  <Check size={12} /> I saved it
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {secrets.length === 0 ? (
          <EmptyRow
            icon={<ShieldAlert size={16} />}
            label="No signing secrets yet — rotate to generate one."
          />
        ) : (
          <Table columns={["ID", "Created", "Status", ""]}>
            {secrets.map((s) => {
              const retiring = !s.isActive && s.expiresAt !== null;
              return (
                <tr key={s.id}>
                  <td
                    style={{ ...tdStyle, fontFamily: "var(--font-mono)" }}
                  >
                    …{s.id.slice(-4)}
                    <span
                      style={{
                        marginLeft: 8,
                        color: "var(--bone-quiet)",
                        fontSize: 11,
                      }}
                    >
                      {s.id}
                    </span>
                  </td>
                  <td style={tdStyle}>{formatDate(s.createdAt)}</td>
                  <td style={tdStyle}>
                    {s.isActive ? (
                      <StatusDot ok label="Active" />
                    ) : retiring ? (
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--amber, #c39a4e)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {expiryCountdown(s.expiresAt!)}
                      </span>
                    ) : (
                      <StatusDot ok={false} label="Revoked" />
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {retiring && (
                      <button
                        className="btn btn-ghost btn-mini"
                        onClick={() => revokeSecret(s.id)}
                        title="Revoke immediately — skips the remaining grace period"
                      >
                        <Trash2 size={12} /> Revoke now
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      {/* ============================================================ */}
      {/* EVENT LOG                                                      */}
      {/* ============================================================ */}
      <Section
        icon={<Activity size={14} />}
        title="Event log"
        subtitle="Firehose of every event your wallet has emitted. Click any row to inspect the payload."
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value);
                setEventLimit(25);
              }}
              style={{
                padding: "5px 10px",
                background: "var(--ink-elev-1)",
                color: "var(--bone-dim)",
                border: "1px solid var(--ink-hair)",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {eventTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t === "all" ? "All events" : t}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {events.length === 0 ? (
          <EmptyRow icon={<Activity size={16} />} label="No events yet." />
        ) : (
          <div
            style={{
              border: "1px solid var(--ink-hair)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
              maxHeight: 520,
              overflowY: "auto",
            }}
          >
            {events.map((ev, idx) => {
              const expanded = expandedEventId === ev.id;
              return (
                <div
                  key={ev.id}
                  style={{
                    borderBottom:
                      idx === events.length - 1
                        ? "none"
                        : "1px solid var(--ink-hair)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedEventId(expanded ? null : ev.id)
                    }
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: expanded
                        ? "var(--ink-elev-1)"
                        : "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      color: "var(--bone)",
                      fontFamily: "var(--font-sans)",
                      transition: "background 0.12s",
                    }}
                  >
                    {expanded ? (
                      <ChevronDown size={12} style={{ color: "var(--bone-quiet)" }} />
                    ) : (
                      <ChevronRight size={12} style={{ color: "var(--bone-quiet)" }} />
                    )}
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--bone-quiet)",
                        minWidth: 130,
                      }}
                    >
                      {formatDateTime(ev.createdAt)}
                    </span>
                    <TypeBadge type={ev.type} />
                    {ev.invoiceId && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "var(--bone-dim)",
                        }}
                      >
                        {ev.invoiceId}
                      </span>
                    )}
                  </button>
                  {expanded && (
                    <pre
                      style={{
                        margin: 0,
                        padding: "12px 14px 16px 38px",
                        background: "var(--ink-deep)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11.5,
                        color: "var(--bone-dim)",
                        lineHeight: 1.55,
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {hasMoreEvents && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button
              className="btn btn-ghost btn-mini"
              onClick={() => setEventLimit((n) => Math.min(n + 25, 200))}
            >
              Load more ({eventTotal - events.length} remaining)
            </button>
          </div>
        )}
      </Section>

      {/* ============================================================ */}
      {/* REFERENCE — collapsed quick start                              */}
      {/* ============================================================ */}
      <div
        className="surface"
        style={{
          padding: "18px 22px",
          marginTop: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setShowReference((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--bone)",
          }}
        >
          <span
            className="display"
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Reference · Quick start
          </span>
          <span style={{ color: "var(--bone-quiet)", fontSize: 12 }}>
            {showReference ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </span>
        </button>
        <AnimatePresence initial={false}>
          {showReference && (
            <motion.div
              key="ref"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: "hidden", marginTop: 12 }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "var(--bone-mute)",
                  marginBottom: 8,
                }}
              >
                REST · POST /api/pay/create
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "14px 16px",
                  background: "var(--ink-deep)",
                  border: "1px solid var(--ink-hair)",
                  borderRadius: "var(--radius-sm)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--bone-dim)",
                  lineHeight: 1.7,
                  overflowX: "auto",
                }}
              >
{`curl -X POST https://your-deropay.example/api/pay/create \\
  -H "X-DeroPay-ApiKey: <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Order #4821",
    "amount": "12.4",
    "currency": "DERO",
    "expiresIn": 3600
  }'`}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      </TabPanel>

      {/* ============================================================ */}
      {/* API PLAYGROUND — Phase 3 #36                                   */}
      {/* ============================================================ */}
      <TabPanel value="playground" active={activeTab === "playground"}>
        <div
          className="surface"
          style={{ padding: "20px 22px", marginBottom: 20 }}
        >
          <div style={{ marginBottom: 14 }}>
            <h3
              className="display"
              style={{
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              API playground
            </h3>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--bone-dim)",
                lineHeight: 1.55,
                margin: "4px 0 0",
                maxWidth: "72ch",
              }}
            >
              Pick an endpoint, tweak inputs, hit Execute. Runs against the same
              session that drives the dashboard — the `deropay_mode` cookie
              decides whether calls go to test fixtures or the live gateway.
              Press <code style={{ color: "var(--dero)" }}>Cmd/Ctrl+Enter</code>{" "}
              to fire without reaching for the mouse.
            </p>
          </div>
          <ApiShell />
        </div>
      </TabPanel>

    </DashboardShell>
  );
}

// ---------------------------------------------------------------------------
// Local presentational components
// ---------------------------------------------------------------------------

function Section({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="surface"
      style={{ padding: "20px 22px", marginBottom: 20 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--bone)",
              marginBottom: 2,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: "var(--ink-elev-2)",
                border: "1px solid var(--ink-hair)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--bone-dim)",
              }}
            >
              {icon}
            </span>
            <h3
              className="display"
              style={{
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              {title}
            </h3>
          </div>
          {subtitle && (
            <p
              style={{
                fontSize: 12.5,
                color: "var(--bone-dim)",
                lineHeight: 1.55,
                margin: "4px 0 0 30px",
                maxWidth: "64ch",
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

function Table({
  columns,
  children,
}: {
  columns: string[];
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--ink-hair)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
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
              background: "var(--ink-elev-1)",
            }}
          >
            {columns.map((c, i) => (
              <th
                key={i}
                style={{
                  textAlign: i === columns.length - 1 ? "right" : "left",
                  padding: "10px 14px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--bone-quiet)",
                  fontWeight: 500,
                  borderBottom: "1px solid var(--ink-hair)",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EmptyRow({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "32px 20px",
        border: "1px dashed var(--ink-hair)",
        borderRadius: "var(--radius-sm)",
        color: "var(--bone-quiet)",
        fontSize: 13,
      }}
    >
      {icon}
      {label}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const [group] = type.split(".");
  const color =
    group === "invoice"
      ? "var(--dero)"
      : group === "payout"
        ? "var(--bone)"
        : "var(--bone-dim)";
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.08em",
        color,
        background: "var(--ink-elev-2)",
        border: "1px solid var(--ink-hair)",
        padding: "2px 8px",
        borderRadius: 4,
        whiteSpace: "nowrap",
      }}
    >
      {type}
    </span>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--bone-dim)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: ok ? "var(--dero)" : "var(--bone-quiet)",
        }}
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Style primitives + formatters
// ---------------------------------------------------------------------------

const formPanelStyle: React.CSSProperties = {
  padding: "16px 18px",
  background: "var(--ink-elev-1)",
  border: "1px solid var(--ink-hair)",
  borderRadius: "var(--radius-sm)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--bone-quiet)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "var(--ink-deep)",
  border: "1px solid var(--ink-hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--bone)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  outline: "none",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid var(--ink-hair)",
  color: "var(--bone)",
  fontSize: 13,
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Human-readable grace-window countdown for a retiring signing secret.
 * "expires in 18h 22m" / "expires in 42m" / "expired" when negative.
 */
function expiryCountdown(expiresAt: number): string {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "expired";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `expires in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins - hours * 60;
  return `expires in ${hours}h ${remMins}m`;
}

/**
 * Delivery status badge — Stripe Workbench-style color coding. Uses the same
 * three states the server derives (`delivered_at` / `failed_at` / neither).
 */
function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const tone =
    status === "delivered"
      ? { color: "var(--dero)", label: "Delivered" }
      : status === "failed"
        ? { color: "var(--vermilion, #b85b3a)", label: "Failed" }
        : { color: "var(--amber, #c39a4e)", label: "Pending" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.08em",
        color: tone.color,
        border: `1px solid ${tone.color}`,
        padding: "2px 8px",
        borderRadius: 4,
      }}
    >
      {tone.label.toUpperCase()}
    </span>
  );
}

/**
 * Best-effort JSON.parse for a response body we captured as text. Falls back
 * to `{ raw: string }` so the JsonPanel still renders something useful for
 * non-JSON responses.
 */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
