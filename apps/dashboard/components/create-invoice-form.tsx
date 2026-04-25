"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, AlertCircle } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";

type CreateInvoiceFormProps = {
  onCreated?: () => void;
};

type InvoiceTemplate = {
  id: string;
  name: string;
  description?: string;
  /** bigint-as-string picodero, or undefined when amount is left open. */
  amount?: string;
  expirySeconds?: number;
  metadataDefaults: Record<string, unknown>;
  requiredFields: string[];
  createdAt: number;
  archivedAt?: number | null;
};

const TTL_OPTIONS = [
  { value: "300", label: "5 minutes" },
  { value: "600", label: "10 minutes" },
  { value: "900", label: "15 minutes (default)" },
  { value: "1800", label: "30 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "24 hours" },
];

/** Format picodero → DERO decimal string for pre-fill (12 decimal places). */
function picoderoToDero(pico: string): string {
  try {
    const v = BigInt(pico);
    const unit = 1_000_000_000_000n;
    const whole = v / unit;
    const frac = v % unit;
    if (frac === 0n) return whole.toString();
    // Trim trailing zeros from the fractional part.
    const fracStr = frac.toString().padStart(12, "0").replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return "";
  }
}

/**
 * Pick the closest TTL_OPTIONS entry to a template's expirySeconds value so
 * the pre-fill lands on a valid option. Templates can specify any seconds
 * value but the form offers a fixed menu — snap to the nearest option.
 */
function snapTtl(seconds: number): string {
  const opts = TTL_OPTIONS.map((o) => Number(o.value));
  let best = opts[2] ?? 900;
  let bestDist = Math.abs(seconds - best);
  for (const o of opts) {
    const d = Math.abs(seconds - o);
    if (d < bestDist) {
      best = o;
      bestDist = d;
    }
  }
  return String(best);
}

export function CreateInvoiceForm({ onCreated }: CreateInvoiceFormProps) {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [ttl, setTtl] = useState("900");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load active (non-archived) templates for the picker. A 404 / empty
  // response just leaves the dropdown with the "None" option — not worth
  // surfacing as an error.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pay/invoice-templates");
        if (!res.ok) return;
        const data = (await res.json()) as { templates?: InvoiceTemplate[] };
        if (!cancelled && Array.isArray(data.templates)) {
          setTemplates(data.templates);
        }
      } catch {
        // Silent — templates are optional UX sugar.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Apply a template's defaults to the form fields. Empty string for
   * `templateId` resets the picker without changing the fields (otherwise
   * the user would lose any edits they made after picking a template).
   */
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const tmpl = templates.find((t) => t.id === id);
    if (!tmpl) return;
    setName(tmpl.name);
    setDescription(tmpl.description ?? "");
    setAmount(tmpl.amount ? picoderoToDero(tmpl.amount) : "");
    if (tmpl.expirySeconds) setTtl(snapTtl(tmpl.expirySeconds));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const parts = amount.split(".");
      const whole = BigInt(parts[0] || "0") * 1_000_000_000_000n;
      const frac = parts[1]
        ? BigInt(parts[1].slice(0, 12).padEnd(12, "0"))
        : 0n;
      const atomicAmount = whole + frac;

      if (atomicAmount <= 0n) {
        setError("Amount must be positive");
        return;
      }

      // Merge template metadata defaults (lowest precedence) so the invoice
      // carries the template's metadata. The server validates required
      // fields separately — the form only pre-fills.
      const tmpl = templates.find((t) => t.id === templateId);
      const metadata: Record<string, unknown> = tmpl
        ? { ...(tmpl.metadataDefaults ?? {}) }
        : {};

      const response = await fetch("/api/pay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          amount: atomicAmount.toString(),
          ttlSeconds: parseInt(ttl, 10),
          templateId: templateId || undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const invoice = await response.json();
      setSuccess(`Invoice created · ${invoice.id}`);
      setName("");
      setDescription("");
      setAmount("");
      setTemplateId("");
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const templateOptions = [
    { value: "", label: "None (ad-hoc invoice)" },
    ...templates.map((t) => ({
      value: t.id,
      label: t.amount
        ? `${t.name} — ${picoderoToDero(t.amount)} DERO`
        : `${t.name} — variable amount`,
    })),
  ];

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
      {templates.length > 0 && (
        <Select
          label="From template"
          value={templateId}
          onChange={(e) => applyTemplate(e.target.value)}
          options={templateOptions}
        />
      )}

      <Input
        label="Invoice name *"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Widget Pro · Subscription · Donation"
        required
      />

      <Input
        label="Description"
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short line shown on checkout"
      />

      <div className="grid-2-1">
        <Input
          label={
            <>
              <span className="field-label-inline">
                Amount <span className="field-hint">(DERO)</span>
              </span>
            </>
          }
          mono
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="5.00000"
          required
          pattern="[0-9]+\.?[0-9]*"
          rightAdornment={
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.2em",
                color: "var(--bone-quiet)",
                textTransform: "uppercase",
              }}
            >
              DERO
            </span>
          }
        />

        <Select
          label="Time-to-live"
          value={ttl}
          onChange={(e) => setTtl(e.target.value)}
          options={TTL_OPTIONS}
        />
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            style={inlineToast("danger")}
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </motion.div>
        )}
        {success && (
          <motion.div
            key="ok"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            style={inlineToast("positive")}
          >
            <Check size={14} />
            <span>{success}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        type="submit"
        variant="primary"
        loading={isSubmitting}
        leftIcon={<Sparkles size={13} />}
        style={{ justifySelf: "flex-start" }}
      >
        {isSubmitting ? "Creating…" : "Issue Invoice"}
      </Button>
    </form>
  );
}

function inlineToast(kind: "positive" | "danger"): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px",
    borderRadius: "var(--radius)",
    background:
      kind === "positive" ? "var(--dero-wash)" : "var(--vermilion-wash)",
    color: kind === "positive" ? "var(--dero)" : "var(--vermilion)",
    border: `1px solid ${
      kind === "positive" ? "var(--dero-hair)" : "rgba(224, 93, 68, 0.3)"
    }`,
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.04em",
  };
}
