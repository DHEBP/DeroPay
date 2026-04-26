"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, X, Check, Archive } from "lucide-react";

/**
 * Phase 3 #33 — Invoice Templates settings panel.
 *
 * Drops into `/settings` between Brand Profiles and the API section. Handles:
 *   - Listing active templates with Name / Amount / Expiry / Created
 *   - Edit (inline form)
 *   - Archive / Unarchive (includeArchived toggle at the bottom)
 *   - Delete (hard delete — server returns 409 if the template is in use)
 *   - "+ New template" create form
 *
 * The underlying data model lives in `packages/dero-pay/src/store/types.ts`
 * (`InvoiceTemplate`) and the routes at `/api/pay/invoice-templates/*`.
 */

type InvoiceTemplate = {
  id: string;
  name: string;
  description?: string;
  /** bigint-as-string picodero, or undefined for "amount required" templates. */
  amount?: string;
  expirySeconds?: number;
  metadataDefaults: Record<string, unknown>;
  requiredFields: string[];
  createdAt: number;
  archivedAt?: number | null;
};

type FormState = {
  name: string;
  description: string;
  amount: string; // DERO decimal — converted to picodero on save
  expirySeconds: string;
  metadataJson: string;
  requiredFieldsCsv: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  amount: "",
  expirySeconds: "",
  metadataJson: "{}",
  requiredFieldsCsv: "",
};

function picoderoToDero(pico: string): string {
  try {
    const v = BigInt(pico);
    const unit = 1_000_000_000_000n;
    const whole = v / unit;
    const frac = v % unit;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(12, "0").replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return pico;
  }
}

function deroToPicodero(dec: string): bigint | null {
  const parts = dec.trim().split(".");
  if (parts.length > 2) return null;
  try {
    const whole = BigInt(parts[0] || "0") * 1_000_000_000_000n;
    const frac = parts[1]
      ? BigInt(parts[1].slice(0, 12).padEnd(12, "0"))
      : 0n;
    return whole + frac;
  } catch {
    return null;
  }
}

function templateToForm(t: InvoiceTemplate): FormState {
  return {
    name: t.name,
    description: t.description ?? "",
    amount: t.amount ? picoderoToDero(t.amount) : "",
    expirySeconds: t.expirySeconds ? String(t.expirySeconds) : "",
    metadataJson: JSON.stringify(t.metadataDefaults ?? {}, null, 2),
    requiredFieldsCsv: (t.requiredFields ?? []).join(", "),
  };
}

function formToPayload(
  f: FormState
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (!f.name.trim()) return { ok: false, error: "Name is required" };

  const payload: Record<string, unknown> = { name: f.name.trim() };

  payload.description = f.description.trim() ? f.description.trim() : null;

  if (f.amount.trim() === "") {
    payload.amount = null;
  } else {
    const pico = deroToPicodero(f.amount);
    if (pico === null || pico <= 0n) {
      return { ok: false, error: "Amount must be a positive number" };
    }
    payload.amount = pico.toString();
  }

  if (f.expirySeconds.trim() === "") {
    payload.expirySeconds = null;
  } else {
    const n = Number(f.expirySeconds);
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, error: "Expiry must be a positive integer (seconds)" };
    }
    payload.expirySeconds = n;
  }

  try {
    const parsed = JSON.parse(f.metadataJson || "{}");
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Metadata must be a JSON object" };
    }
    payload.metadataDefaults = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Metadata: invalid JSON" };
  }

  payload.requiredFields = f.requiredFieldsCsv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return { ok: true, payload };
}

function formatCreatedAt(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString();
}

function formatExpiry(s?: number): string {
  if (!s) return "—";
  if (s >= 86_400 && s % 86_400 === 0) return `${s / 86_400}d`;
  if (s >= 3600 && s % 3600 === 0) return `${s / 3600}h`;
  if (s >= 60 && s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

export function InvoiceTemplatesSection() {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const url = includeArchived
        ? "/api/pay/invoice-templates?includeArchived=1"
        : "/api/pay/invoice-templates";
      const res = await fetch(url);
      if (!res.ok) {
        setError(`List failed · HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as { templates: InvoiceTemplate[] };
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const startCreate = () => {
    setCreating(true);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (t: InvoiceTemplate) => {
    setCreating(false);
    setEditingId(t.id);
    setForm(templateToForm(t));
  };

  const cancel = () => {
    setCreating(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const submit = async () => {
    const built = formToPayload(form);
    if (!built.ok) {
      setError(built.error);
      return;
    }

    try {
      const url = editingId
        ? `/api/pay/invoice-templates/${editingId}`
        : "/api/pay/invoice-templates";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setError(body.message || body.error || `HTTP ${res.status}`);
        return;
      }
      cancel();
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const archive = async (id: string, unarchive: boolean) => {
    try {
      const res = await fetch(`/api/pay/invoice-templates/${id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unarchive }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setError(body.message || body.error || `HTTP ${res.status}`);
        return;
      }
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    }
  };

  const hardDelete = async (id: string) => {
    if (
      !window.confirm(
        "Delete this template permanently? Use Archive if it's still referenced by invoices or payment links."
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/pay/invoice-templates/${id}`, {
        method: "DELETE",
      });
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(
          body.message ??
            "Template is in use by existing invoices or links — archive instead."
        );
        return;
      }
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setError(body.message || body.error || `HTTP ${res.status}`);
        return;
      }
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const rowsToShow = useMemo(
    () =>
      [...templates].sort((a, b) => {
        // Active first, then archived. Within each group: newest first.
        const aa = a.archivedAt ? 1 : 0;
        const ba = b.archivedAt ? 1 : 0;
        if (aa !== ba) return aa - ba;
        return b.createdAt - a.createdAt;
      }),
    [templates]
  );

  return (
    <section
      className="surface"
      style={{ padding: "22px 24px", marginBottom: 20 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span className="eyebrow">Invoice templates</span>
        <span
          aria-hidden
          style={{ flex: 1, height: 1, background: "var(--ink-hair)" }}
        />
        <button
          className="btn btn-ghost"
          onClick={startCreate}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          title="Create a new invoice template"
        >
          <Plus size={13} />
          New template
        </button>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--bone-dim)",
          marginBottom: 14,
        }}
      >
        Reusable invoice shapes — stamp out SaaS monthly, consulting hours,
        gift-card top-ups, and more without re-entering the same fields.
        Payment links can reference a template too.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            padding: "10px 12px",
            marginBottom: 12,
            borderRadius: "var(--radius)",
            background: "var(--vermilion-wash)",
            border: "1px solid rgba(224, 93, 68, 0.3)",
            color: "var(--vermilion)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {(creating || editingId) && (
        <TemplateForm
          form={form}
          setForm={setForm}
          onCancel={cancel}
          onSubmit={submit}
          editing={Boolean(editingId)}
        />
      )}

      <div
        style={{
          border: "1px solid var(--ink-hair)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(160px, 2fr) 1fr 1fr 1fr auto",
            gap: 12,
            padding: "9px 14px",
            background: "var(--ink-deep)",
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--bone-quiet)",
          }}
        >
          <span>Name</span>
          <span>Amount</span>
          <span>Expiry</span>
          <span>Created</span>
          <span />
        </div>

        {loading && (
          <div
            style={{
              padding: 18,
              fontSize: 12,
              color: "var(--bone-quiet)",
              textAlign: "center",
            }}
          >
            Loading templates…
          </div>
        )}

        {!loading && rowsToShow.length === 0 && (
          <div
            style={{
              padding: 18,
              fontSize: 12,
              color: "var(--bone-quiet)",
              textAlign: "center",
            }}
          >
            No templates yet. Hit <strong>+ New template</strong> to create your
            first one.
          </div>
        )}

        {!loading &&
          rowsToShow.map((t, i) => (
            <div
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(160px, 2fr) 1fr 1fr 1fr auto",
                gap: 12,
                padding: "10px 14px",
                borderTop:
                  i === 0 ? "1px solid var(--ink-hair)" : "1px solid var(--ink-hair)",
                alignItems: "center",
                fontSize: 12,
                opacity: t.archivedAt ? 0.55 : 1,
              }}
            >
              <span style={{ display: "flex", flexDirection: "column" }}>
                <strong style={{ color: "var(--bone)" }}>{t.name}</strong>
                {t.description && (
                  <span
                    style={{
                      color: "var(--bone-quiet)",
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {t.description}
                  </span>
                )}
                {t.archivedAt && (
                  <span
                    style={{
                      marginTop: 2,
                      fontSize: 10,
                      color: "var(--bone-quiet)",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    Archived
                  </span>
                )}
              </span>
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {t.amount ? `${picoderoToDero(t.amount)} DERO` : "variable"}
              </span>
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {formatExpiry(t.expirySeconds)}
              </span>
              <span
                style={{ fontFamily: "var(--font-mono)", color: "var(--bone-dim)" }}
              >
                {formatCreatedAt(t.createdAt)}
              </span>
              <span
                style={{ display: "inline-flex", gap: 6, justifySelf: "end" }}
              >
                {!t.archivedAt && (
                  <button
                    className="btn btn-ghost"
                    title="Edit"
                    onClick={() => startEdit(t)}
                    style={{ padding: "4px 8px" }}
                  >
                    <Pencil size={12} />
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  title={t.archivedAt ? "Unarchive" : "Archive"}
                  onClick={() => archive(t.id, Boolean(t.archivedAt))}
                  style={{ padding: "4px 8px" }}
                >
                  <Archive size={12} />
                </button>
                <button
                  className="btn btn-ghost"
                  title="Delete"
                  onClick={() => hardDelete(t.id)}
                  style={{ padding: "4px 8px", color: "var(--vermilion)" }}
                >
                  <Trash2 size={12} />
                </button>
              </span>
            </div>
          ))}
      </div>

      <label
        style={{
          marginTop: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          color: "var(--bone-dim)",
        }}
      >
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        Show archived
      </label>
    </section>
  );
}

function TemplateForm({
  form,
  setForm,
  onCancel,
  onSubmit,
  editing,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
  editing: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--dero-hair)",
        borderRadius: "var(--radius)",
        padding: "14px 16px",
        marginBottom: 14,
        background: "var(--ink-deep)",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        className="eyebrow"
        style={{ color: "var(--dero)", marginBottom: 4 }}
      >
        {editing ? "Edit template" : "New template"}
      </div>

      <Field label="Name *">
        <input
          className="input"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="SaaS monthly"
        />
      </Field>

      <Field label="Description">
        <input
          className="input"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Optional human-readable description"
        />
      </Field>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <Field
          label="Amount (DERO)"
          hint="Leave empty to make the amount required at creation."
        >
          <input
            className="input"
            style={{ fontFamily: "var(--font-mono)" }}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="50"
            pattern="[0-9]+\.?[0-9]*"
          />
        </Field>
        <Field
          label="Expiry (seconds)"
          hint="Leave empty to use the engine default."
        >
          <input
            className="input"
            style={{ fontFamily: "var(--font-mono)" }}
            value={form.expirySeconds}
            onChange={(e) =>
              setForm({ ...form, expirySeconds: e.target.value })
            }
            placeholder="604800"
          />
        </Field>
      </div>

      <Field
        label="Metadata defaults (JSON)"
        hint="Merged onto invoice.metadata at creation."
      >
        <textarea
          className="input"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            minHeight: 80,
            resize: "vertical",
          }}
          value={form.metadataJson}
          onChange={(e) => setForm({ ...form, metadataJson: e.target.value })}
          placeholder='{"plan":"pro"}'
        />
      </Field>

      <Field
        label="Required fields (comma-separated)"
        hint="Field names that MUST be supplied at creation (server-side validated)."
      >
        <input
          className="input"
          value={form.requiredFieldsCsv}
          onChange={(e) =>
            setForm({ ...form, requiredFieldsCsv: e.target.value })
          }
          placeholder="customerEmail, planName"
        />
      </Field>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" onClick={onCancel}>
          <X size={12} /> Cancel
        </button>
        <button className="btn btn-primary" onClick={onSubmit}>
          <Check size={12} /> {editing ? "Save" : "Create"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--bone-quiet)",
        }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ fontSize: 11, color: "var(--bone-quiet)" }}>{hint}</span>
      )}
    </label>
  );
}
