"use client";

/**
 * Phase 3 #35 — Dispute evidence guided workflow.
 *
 * Surfaces inside the EscrowDetailDrawer as a dedicated tab while the escrow
 * is in the `disputed` state. The flow steps the merchant through:
 *
 *   1. Reason code      — radio list + free-text "other" clarifier
 *   2. Summary          — 1..500 char counter-argument
 *   3. Supporting evid. — optional details + externally-hosted URLs
 *   4. Review & submit  — read-only recap + destructive submit button
 *
 * Once any evidence row has been persisted for this escrow, the stepper is
 * replaced with a read-only transcript of every submission. The arbitrator's
 * action buttons (release / refund) still live in the drawer footer — this
 * component is strictly the evidence authoring + inspection surface.
 *
 * Files: V1 does NOT host file contents. The file-upload UI is a stub — when
 * the merchant picks files the form records the names only and instructs them
 * to paste the hosted URL above.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  AlertOctagon,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDot,
  FileText,
  Info,
  Plus,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { Button, Input, TextArea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { formatDate, truncate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Wire types — mirrors the server's EscrowEvidence but intentionally decoupled
// so we don't drag the entire @/store/types.ts surface into a client bundle.
// ---------------------------------------------------------------------------

export type EvidenceSubmitter = "buyer" | "seller";

export type EvidenceReasonCode =
  | "duplicate"
  | "fraud"
  | "not_received"
  | "not_as_described"
  | "other";

export type EvidenceStatus = "submitted" | "acknowledged" | "dismissed";

export type EvidenceFileDescriptor = {
  name: string;
  size?: number;
  uploadedAt?: number;
};

export type Evidence = {
  id: string;
  escrowId: string;
  submitter: EvidenceSubmitter;
  reasonCode: EvidenceReasonCode;
  summary: string;
  details: string | null;
  evidenceUrls: string[];
  filesMetadata: EvidenceFileDescriptor[];
  status: EvidenceStatus;
  createdAt: number;
  resolvedAt: number | null;
};

// ---------------------------------------------------------------------------
// Reason code metadata — labels, helper copy.
// ---------------------------------------------------------------------------

const REASON_OPTIONS: Array<{
  value: EvidenceReasonCode;
  label: string;
  blurb: string;
}> = [
  {
    value: "duplicate",
    label: "Duplicate payment",
    blurb: "The buyer already paid this invoice through another channel.",
  },
  {
    value: "fraud",
    label: "Fraud",
    blurb: "The dispute itself is fraudulent — chargeback abuse, stolen identity, etc.",
  },
  {
    value: "not_received",
    label: "Not received",
    blurb: "Goods/services were delivered but the buyer says otherwise.",
  },
  {
    value: "not_as_described",
    label: "Not as described",
    blurb: "Buyer is contesting product/service quality.",
  },
  {
    value: "other",
    label: "Other",
    blurb: "None of the above — describe the dispute below.",
  },
];

const MAX_SUMMARY_LEN = 500;
const MAX_DETAILS_LEN = 4000;
const MAX_URLS = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  escrowId: string;
  /** Merchant admin is always the seller in this flow. */
  submitter?: EvidenceSubmitter;
};

type Step = 1 | 2 | 3 | 4;

type FormState = {
  reasonCode: EvidenceReasonCode | null;
  reasonOther: string;
  summary: string;
  details: string;
  urlDraft: string;
  evidenceUrls: string[];
  filesMetadata: EvidenceFileDescriptor[];
};

const INITIAL_FORM: FormState = {
  reasonCode: null,
  reasonOther: "",
  summary: "",
  details: "",
  urlDraft: "",
  evidenceUrls: [],
  filesMetadata: [],
};

export function DisputeEvidenceWorkflow({
  escrowId,
  submitter = "seller",
}: Props) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<Evidence[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initial load + refresh on change of target escrow.
  const fetchEvidence = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(
        `/api/pay/escrow/${encodeURIComponent(escrowId)}/evidence`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { evidence: Evidence[] };
      setExisting(body.evidence ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [escrowId]);

  useEffect(() => {
    void fetchEvidence();
  }, [fetchEvidence]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setStep(1);
    setSubmitError(null);
  };

  const nextStep = () => setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  const prevStep = () => setStep((s) => (s > 1 ? ((s - 1) as Step) : s));

  const canAdvanceFrom1 =
    form.reasonCode !== null &&
    (form.reasonCode !== "other" || form.reasonOther.trim().length > 0);
  const canAdvanceFrom2 =
    form.summary.trim().length > 0 &&
    form.summary.length <= MAX_SUMMARY_LEN;
  // Step 3 has no hard requirement — details + URLs are optional.
  const canAdvanceFrom3 = form.details.length <= MAX_DETAILS_LEN;

  const canSubmit =
    canAdvanceFrom1 && canAdvanceFrom2 && canAdvanceFrom3 && !submitting;

  const submit = async () => {
    if (!canSubmit || !form.reasonCode) return;
    setSubmitting(true);
    setSubmitError(null);

    // "Other" rolls its clarifier into the details field so the arbitrator
    // sees it alongside the rest of the narrative.
    const effectiveDetails =
      form.reasonCode === "other"
        ? [form.reasonOther.trim(), form.details.trim()]
            .filter(Boolean)
            .join("\n\n")
        : form.details.trim();

    try {
      const r = await fetch(
        `/api/pay/escrow/${encodeURIComponent(escrowId)}/evidence`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submitter,
            reasonCode: form.reasonCode,
            summary: form.summary.trim(),
            details: effectiveDetails || null,
            evidenceUrls: form.evidenceUrls,
            filesMetadata: form.filesMetadata,
          }),
        },
      );
      if (!r.ok) {
        const errBody = (await r.json().catch(() => ({}))) as Record<
          string,
          string
        >;
        throw new Error(errBody.message || errBody.error || `HTTP ${r.status}`);
      }
      toast({
        title: "Evidence submitted",
        description: "The arbitrator has been notified.",
        tone: "success",
      });
      resetForm();
      await fetchEvidence();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
      toast({
        title: "Couldn't submit evidence",
        description: msg,
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render branches
  // -------------------------------------------------------------------------

  if (loading && existing === null) {
    return <LoadingState />;
  }

  if (loadError && existing === null) {
    return (
      <div
        role="alert"
        style={{
          padding: "14px 16px",
          borderRadius: "var(--radius)",
          background: "var(--vermilion-wash)",
          border: "1px solid rgba(224,93,68,0.28)",
          fontSize: 13,
          color: "var(--vermilion)",
        }}
      >
        Couldn&apos;t load dispute evidence: {loadError}
      </div>
    );
  }

  const hasExisting = (existing?.length ?? 0) > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Banner — reinforces the disputed state at the top of the tab. */}
      <DisputedBanner />

      {hasExisting ? (
        <SubmittedView
          rows={existing ?? []}
          onStartOver={() => {
            // Allow a fresh submission after existing rows — e.g. a buyer
            // reply to a seller submission. Clears form + jumps to step 1.
            resetForm();
            setExisting([]); // temporarily collapse the history so the stepper shows
            void fetchEvidence(); // then refresh so it's correct; the stepper still renders in the interim
          }}
        />
      ) : (
        <Stepper
          step={step}
          form={form}
          submitter={submitter}
          submitError={submitError}
          submitting={submitting}
          canAdvanceFrom1={canAdvanceFrom1}
          canAdvanceFrom2={canAdvanceFrom2}
          canAdvanceFrom3={canAdvanceFrom3}
          canSubmit={canSubmit}
          onChangeForm={setForm}
          onNext={nextStep}
          onBack={prevStep}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submitted view — once at least one row exists, show read-only history.
// ---------------------------------------------------------------------------

function SubmittedView({
  rows,
  onStartOver,
}: {
  rows: Evidence[];
  onStartOver: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div
          className="eyebrow-mono"
          style={{ color: "var(--bone-mute)", fontSize: 10 }}
        >
          Submitted evidence ({rows.length})
        </div>
        <Button
          variant="ghost"
          onClick={onStartOver}
          leftIcon={<Plus size={12} />}
        >
          Submit more evidence
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((row) => (
          <EvidenceCard key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}

function EvidenceCard({ row }: { row: Evidence }) {
  const reason = REASON_OPTIONS.find((o) => o.value === row.reasonCode);
  return (
    <article
      style={{
        padding: "14px 16px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--ink-hair)",
        background: "var(--ink-elev)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={14} color="var(--bone-dim)" />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--bone)",
              textTransform: "capitalize",
            }}
          >
            {reason?.label ?? row.reasonCode}
          </span>
          <StatusChip status={row.status} />
        </div>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--bone-mute)",
            letterSpacing: "0.05em",
          }}
        >
          {row.submitter.toUpperCase()} · {formatDate(new Date(row.createdAt).toISOString())}
        </span>
      </header>

      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--bone-dim)",
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {row.summary}
      </p>

      {row.details && (
        <details>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 11,
              color: "var(--bone-mute)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
            }}
          >
            Full details
          </summary>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 12.5,
              color: "var(--bone-dim)",
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {row.details}
          </p>
        </details>
      )}

      {row.evidenceUrls.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {row.evidenceUrls.map((u) => (
            <li key={u}>
              <a
                href={u}
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--dero)",
                  wordBreak: "break-all",
                }}
              >
                {truncate(u, 40, 12)}
              </a>
            </li>
          ))}
        </ul>
      )}

      {row.filesMetadata.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {row.filesMetadata.map((f) => (
            <span
              key={f.name}
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                border: "1px solid var(--ink-hair)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--bone-mute)",
                letterSpacing: "0.04em",
              }}
              title={
                typeof f.size === "number"
                  ? `${f.name} · ${(f.size / 1024).toFixed(1)} KB`
                  : f.name
              }
            >
              <FileText
                size={10}
                style={{ verticalAlign: "-1px", marginRight: 4 }}
              />
              {f.name}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function StatusChip({ status }: { status: EvidenceStatus }) {
  const tone =
    status === "acknowledged"
      ? { color: "var(--dero)", bg: "var(--dero-wash)", border: "var(--dero-hair)" }
      : status === "dismissed"
        ? {
            color: "var(--vermilion)",
            bg: "var(--vermilion-wash)",
            border: "rgba(224,93,68,0.28)",
          }
        : {
            color: "var(--amber)",
            bg: "var(--amber-wash)",
            border: "rgba(232,177,74,0.28)",
          };
  return (
    <span
      style={{
        fontSize: 9.5,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.color,
        fontFamily: "var(--font-mono)",
      }}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stepper + steps
// ---------------------------------------------------------------------------

function Stepper({
  step,
  form,
  submitter,
  submitError,
  submitting,
  canAdvanceFrom1,
  canAdvanceFrom2,
  canAdvanceFrom3,
  canSubmit,
  onChangeForm,
  onNext,
  onBack,
  onSubmit,
}: {
  step: Step;
  form: FormState;
  submitter: EvidenceSubmitter;
  submitError: string | null;
  submitting: boolean;
  canAdvanceFrom1: boolean;
  canAdvanceFrom2: boolean;
  canAdvanceFrom3: boolean;
  canSubmit: boolean;
  onChangeForm: (next: FormState) => void;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ProgressBar step={step} />

      {step === 1 && (
        <StepReason
          reasonCode={form.reasonCode}
          reasonOther={form.reasonOther}
          onChange={(next) => onChangeForm({ ...form, ...next })}
        />
      )}
      {step === 2 && (
        <StepSummary
          summary={form.summary}
          onChange={(next) => onChangeForm({ ...form, summary: next })}
        />
      )}
      {step === 3 && (
        <StepEvidence
          details={form.details}
          urlDraft={form.urlDraft}
          evidenceUrls={form.evidenceUrls}
          filesMetadata={form.filesMetadata}
          onChange={(next) => onChangeForm({ ...form, ...next })}
        />
      )}
      {step === 4 && (
        <StepReview
          form={form}
          submitter={submitter}
          submitError={submitError}
        />
      )}

      <StepperFooter
        step={step}
        canNext={
          step === 1
            ? canAdvanceFrom1
            : step === 2
              ? canAdvanceFrom2
              : step === 3
                ? canAdvanceFrom3
                : false
        }
        canSubmit={canSubmit}
        submitting={submitting}
        onNext={onNext}
        onBack={onBack}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function ProgressBar({ step }: { step: Step }) {
  const steps = [
    { n: 1, label: "Reason" },
    { n: 2, label: "Summary" },
    { n: 3, label: "Evidence" },
    { n: 4, label: "Review" },
  ];
  return (
    <ol
      aria-label="Dispute evidence progress"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 6,
        listStyle: "none",
        margin: 0,
        padding: 0,
      }}
    >
      {steps.map((s) => {
        const active = step === s.n;
        const done = step > s.n;
        const accent = done
          ? "var(--dero)"
          : active
            ? "var(--bone)"
            : "var(--bone-mute)";
        return (
          <li
            key={s.n}
            aria-current={active ? "step" : undefined}
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <span
              style={{
                height: 3,
                borderRadius: 999,
                background: done
                  ? "var(--dero)"
                  : active
                    ? "var(--bone)"
                    : "var(--ink-hair)",
                opacity: done || active ? 1 : 0.45,
              }}
            />
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: accent,
              }}
            >
              {done ? (
                <Check size={10} />
              ) : active ? (
                <CircleDot size={10} />
              ) : (
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    border: "1px solid var(--ink-hair)",
                    display: "inline-block",
                  }}
                />
              )}
              <span>{s.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepperFooter({
  step,
  canNext,
  canSubmit,
  submitting,
  onNext,
  onBack,
  onSubmit,
}: {
  step: Step;
  canNext: boolean;
  canSubmit: boolean;
  submitting: boolean;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        marginTop: 4,
      }}
    >
      <Button
        variant="ghost"
        onClick={onBack}
        disabled={step === 1}
        leftIcon={<ArrowLeft size={12} />}
      >
        Back
      </Button>
      {step < 4 ? (
        <Button
          variant="primary"
          onClick={onNext}
          disabled={!canNext}
          rightIcon={<ArrowRight size={12} />}
        >
          Next
        </Button>
      ) : (
        <Button
          variant="danger"
          onClick={onSubmit}
          disabled={!canSubmit}
          loading={submitting}
          leftIcon={<Send size={12} />}
        >
          Submit evidence
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step bodies
// ---------------------------------------------------------------------------

function StepReason({
  reasonCode,
  reasonOther,
  onChange,
}: {
  reasonCode: EvidenceReasonCode | null;
  reasonOther: string;
  onChange: (next: {
    reasonCode?: EvidenceReasonCode;
    reasonOther?: string;
  }) => void;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Header
        label="Reason"
        title="Why does this dispute deserve arbitration in your favor?"
        blurb="Pick the category that best matches. The arbitrator uses this to triage."
      />
      <fieldset
        style={{
          border: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <legend className="sr-only">Reason code</legend>
        {REASON_OPTIONS.map((opt) => {
          const selected = reasonCode === opt.value;
          return (
            <label
              key={opt.value}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                borderRadius: "var(--radius)",
                border: `1px solid ${selected ? "var(--dero-hair)" : "var(--ink-hair)"}`,
                background: selected ? "var(--dero-wash)" : "transparent",
                cursor: "pointer",
                transition: "border-color 120ms ease, background 120ms ease",
              }}
            >
              <input
                type="radio"
                name="reason"
                value={opt.value}
                checked={selected}
                onChange={() => onChange({ reasonCode: opt.value })}
                style={{ marginTop: 3, accentColor: "var(--dero)" }}
              />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, color: "var(--bone)", fontWeight: 500 }}>
                  {opt.label}
                </span>
                <span
                  style={{ fontSize: 12, color: "var(--bone-mute)", lineHeight: 1.45 }}
                >
                  {opt.blurb}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {reasonCode === "other" && (
        <Input
          label="Describe the reason"
          placeholder="e.g. The buyer and seller reached a private agreement…"
          value={reasonOther}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange({ reasonOther: e.target.value })
          }
          maxLength={200}
          aria-required
        />
      )}
    </section>
  );
}

function StepSummary({
  summary,
  onChange,
}: {
  summary: string;
  onChange: (next: string) => void;
}) {
  const remaining = MAX_SUMMARY_LEN - summary.length;
  const over = remaining < 0;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Header
        label="Summary"
        title="Describe what happened."
        blurb="One or two sentences. The arbitrator sees this first."
      />
      <TextArea
        label="Counter-argument"
        placeholder="The buyer acknowledged receipt via email on 2026-04-12 before filing this dispute."
        rows={5}
        value={summary}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_SUMMARY_LEN + 100}
        aria-required
      />
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: over ? "var(--vermilion)" : "var(--bone-mute)",
          letterSpacing: "0.05em",
        }}
      >
        {Math.max(remaining, 0)} / {MAX_SUMMARY_LEN}
        {over && <span style={{ marginLeft: 8 }}>· too long</span>}
      </div>
    </section>
  );
}

function StepEvidence({
  details,
  urlDraft,
  evidenceUrls,
  filesMetadata,
  onChange,
}: {
  details: string;
  urlDraft: string;
  evidenceUrls: string[];
  filesMetadata: EvidenceFileDescriptor[];
  onChange: (next: Partial<FormState>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    if (evidenceUrls.includes(trimmed)) {
      onChange({ urlDraft: "" });
      return;
    }
    if (evidenceUrls.length >= MAX_URLS) return;
    onChange({
      urlDraft: "",
      evidenceUrls: [...evidenceUrls, trimmed],
    });
  };

  const removeUrl = (u: string) =>
    onChange({ evidenceUrls: evidenceUrls.filter((x) => x !== u) });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const now = Date.now();
    const next: EvidenceFileDescriptor[] = Array.from(files).map((f) => ({
      name: f.name,
      size: f.size,
      uploadedAt: now,
    }));
    onChange({ filesMetadata: [...filesMetadata, ...next] });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (name: string) =>
    onChange({
      filesMetadata: filesMetadata.filter((f) => f.name !== name),
    });

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Header
        label="Evidence"
        title="Supporting material"
        blurb="All fields on this step are optional."
      />

      <TextArea
        label="Additional details"
        placeholder="Timeline, emails, transaction references — anything a human arbitrator would want to know."
        hint="markdown-friendly"
        rows={5}
        value={details}
        onChange={(e) => onChange({ details: e.target.value })}
        maxLength={MAX_DETAILS_LEN + 200}
      />

      <div>
        <div
          className="eyebrow-mono"
          style={{ marginBottom: 6, color: "var(--bone-mute)", fontSize: 10 }}
        >
          Evidence URLs
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input
            placeholder="https://…"
            value={urlDraft}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ urlDraft: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
          />
          <Button
            variant="ghost"
            onClick={addUrl}
            disabled={urlDraft.trim().length === 0 || evidenceUrls.length >= MAX_URLS}
            leftIcon={<Plus size={12} />}
          >
            Add
          </Button>
        </div>
        {evidenceUrls.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              margin: "10px 0 0",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {evidenceUrls.map((u) => (
              <li
                key={u}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--ink-hair)",
                }}
              >
                <a
                  href={u}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--bone-dim)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {u}
                </a>
                <button
                  type="button"
                  onClick={() => removeUrl(u)}
                  aria-label={`Remove ${u}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 4,
                    cursor: "pointer",
                    color: "var(--bone-mute)",
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* File upload stub — V1 records names only; the real bytes must live
          externally and be surfaced through the Evidence URLs above. */}
      <div>
        <div
          className="eyebrow-mono"
          style={{ marginBottom: 6, color: "var(--bone-mute)", fontSize: 10 }}
        >
          Files (names only)
        </div>
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "var(--radius)",
            border: "1px dashed var(--ink-hair-strong)",
            background: "rgba(255,255,255,0.02)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
          title="Files must be hosted externally. Paste URLs above."
        >
          <Info size={13} color="var(--bone-mute)" />
          <span style={{ fontSize: 12, color: "var(--bone-mute)", flex: 1 }}>
            Files must be hosted externally. Paste URLs above; the file picker
            only records filenames for the evidence record.
          </span>
          <Button
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            leftIcon={<Upload size={12} />}
          >
            Pick files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        {filesMetadata.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              margin: "10px 0 0",
              padding: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {filesMetadata.map((f) => (
              <li
                key={f.name}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--ink-hair)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--bone-dim)",
                }}
              >
                <FileText size={11} />
                <span>{f.name}</span>
                {typeof f.size === "number" && (
                  <span style={{ color: "var(--bone-mute)" }}>
                    ({(f.size / 1024).toFixed(1)} KB)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(f.name)}
                  aria-label={`Remove ${f.name}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "var(--bone-mute)",
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function StepReview({
  form,
  submitter,
  submitError,
}: {
  form: FormState;
  submitter: EvidenceSubmitter;
  submitError: string | null;
}) {
  const reason = REASON_OPTIONS.find((o) => o.value === form.reasonCode);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Header
        label="Review"
        title="Confirm before you submit."
        blurb="Once submitted, the evidence record is immutable and the arbitrator is notified."
      />

      <ReviewRow label="Submitter" value={submitter.toUpperCase()} mono />
      <ReviewRow
        label="Reason"
        value={reason ? reason.label : form.reasonCode ?? "—"}
      />
      {form.reasonCode === "other" && form.reasonOther && (
        <ReviewRow label='"Other" clarifier' value={form.reasonOther} />
      )}
      <ReviewRow label="Summary" value={form.summary} multiline />
      {form.details && (
        <ReviewRow label="Details" value={form.details} multiline />
      )}
      {form.evidenceUrls.length > 0 && (
        <ReviewRow
          label="URLs"
          value={
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {form.evidenceUrls.map((u) => (
                <li
                  key={u}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--bone-dim)",
                    wordBreak: "break-all",
                  }}
                >
                  {u}
                </li>
              ))}
            </ul>
          }
        />
      )}
      {form.filesMetadata.length > 0 && (
        <ReviewRow
          label="Files"
          value={form.filesMetadata.map((f) => f.name).join(", ")}
          mono
        />
      )}

      {submitError && (
        <div
          role="alert"
          style={{
            padding: "10px 12px",
            borderRadius: "var(--radius)",
            background: "var(--vermilion-wash)",
            border: "1px solid rgba(224,93,68,0.28)",
            fontSize: 12,
            color: "var(--vermilion)",
          }}
        >
          {submitError}
        </div>
      )}
    </section>
  );
}

function ReviewRow({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "110px 1fr",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <span
        className="eyebrow-mono"
        style={{ color: "var(--bone-mute)", fontSize: 10, paddingTop: 2 }}
      >
        {label}
      </span>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--bone-dim)",
          fontFamily: mono ? "var(--font-mono)" : undefined,
          lineHeight: 1.55,
          whiteSpace: multiline ? "pre-wrap" : undefined,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared presentation
// ---------------------------------------------------------------------------

function Header({
  label,
  title,
  blurb,
}: {
  label: string;
  title: string;
  blurb?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        className="eyebrow-mono"
        style={{ color: "var(--bone-mute)", fontSize: 10 }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 15,
          fontWeight: 500,
          color: "var(--bone)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </span>
      {blurb && (
        <span style={{ fontSize: 12, color: "var(--bone-mute)", lineHeight: 1.5 }}>
          {blurb}
        </span>
      )}
    </div>
  );
}

function DisputedBanner() {
  return (
    <div
      role="status"
      style={{
        padding: "10px 12px",
        borderRadius: "var(--radius)",
        background: "var(--amber-wash)",
        border: "1px solid rgba(232,177,74,0.28)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <AlertOctagon size={14} color="var(--amber)" style={{ marginTop: 2 }} />
      <div style={{ fontSize: 12, color: "var(--bone-dim)", lineHeight: 1.5 }}>
        This escrow is in a <strong style={{ color: "var(--amber)" }}>disputed</strong> state.
        Submit evidence here so the arbitrator has the full picture before they
        release or refund the funds.
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      style={{
        padding: "24px 12px",
        textAlign: "center",
        fontSize: 12,
        color: "var(--bone-mute)",
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.05em",
      }}
    >
      Loading dispute evidence…
    </div>
  );
}
