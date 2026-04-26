"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { Dispute, DisputeStatus } from "@/lib/commerce-types";
import { useToast } from "@/components/toast";
import { formatDero, truncate } from "@/lib/format";
import { useInitialTestMode } from "@/lib/test-mode-context";
import { apiFetch, inputStyle, parseDeroToAtomic } from "./shared";

// ---------------------------------------------------------------------------
// Create-dispute modal
// ---------------------------------------------------------------------------

export function CreateDisputeModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (d: Dispute) => void;
}) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();
  const [invoiceId, setInvoiceId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setInvoiceId("");
      setReason("");
      setNotes("");
    }
  }, [open]);

  const submit = useCallback(async () => {
    const invId = invoiceId.trim();
    const reasonTrim = reason.trim();
    if (!invId) {
      toast({ title: "Invoice ID required", tone: "warn" });
      return;
    }
    if (!reasonTrim) {
      toast({ title: "Reason required", tone: "warn" });
      return;
    }
    if (reasonTrim.length > 1000) {
      toast({ title: "Reason exceeds 1000 characters", tone: "warn" });
      return;
    }
    setSubmitting(true);
    const payload = {
      invoiceId: invId,
      reason: reasonTrim,
      notes: notes.trim() || undefined,
    };

    if (isDemo) {
      const d: Dispute = {
        id: `dp_demo_${Math.random().toString(16).slice(2, 8)}`,
        invoiceId: invId,
        reason: reasonTrim,
        status: "open",
        notes: notes.trim() || null,
        refundPayoutId: null,
        createdAt: Date.now(),
        resolvedAt: null,
      };
      setSubmitting(false);
      onCreated(d);
      return;
    }

    const result = await apiFetch<Dispute>("/api/pay/customers/disputes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!result.ok) {
      toast({
        title: "Couldn't create dispute",
        description: result.error,
        tone: "error",
      });
      return;
    }
    onCreated(result.value);
  }, [invoiceId, reason, notes, onCreated, toast]);

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      labelledById="dispute-create-title"
      maxWidth={520}
    >
      <ModalHeader
        title="New dispute"
        eyebrow="Customers"
        onClose={onClose}
        disabled={submitting}
        id="dispute-create-title"
      />
      <ModalBody>
        <FormField
          label="Invoice ID"
          htmlFor="dispute-create-invoice"
          hint="The invoice this dispute is filed against."
        >
          <input
            id="dispute-create-invoice"
            type="text"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            placeholder="inv_12345"
            autoFocus
            style={inputStyle}
          />
        </FormField>
        <FormField
          label="Reason"
          htmlFor="dispute-create-reason"
          hint={`Required. ${reason.length}/1000`}
        >
          <textarea
            id="dispute-create-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 1000))}
            placeholder="e.g. Customer paid on-chain but invoice was never marked paid."
            rows={4}
            maxLength={1000}
            style={{ ...inputStyle, resize: "vertical", minHeight: 88 }}
          />
        </FormField>
        <FormField
          label="Notes (optional)"
          htmlFor="dispute-create-notes"
          hint="Internal — not shown to the customer."
        >
          <textarea
            id="dispute-create-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Customer contacted via support@…"
            rows={3}
            style={{ ...inputStyle, resize: "vertical", minHeight: 66 }}
          />
        </FormField>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-ghost btn-mini"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-mini"
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? "Creating…" : "Create dispute"}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Status-change confirmation modal
// ---------------------------------------------------------------------------

export function ConfirmStatusModal({
  target,
  onClose,
  onConfirm,
}: {
  target: {
    dispute: Dispute;
    next: Extract<DisputeStatus, "resolved" | "lost">;
  } | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const open = !!target;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const label = target?.next === "resolved" ? "resolved" : "lost";
  const dispute = target?.dispute;

  const confirm = useCallback(async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }, [onConfirm]);

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      labelledById="dispute-confirm-title"
      maxWidth={440}
    >
      <ModalHeader
        title={`Mark dispute ${label}?`}
        eyebrow="Confirm"
        onClose={onClose}
        disabled={busy}
        id="dispute-confirm-title"
      />
      <ModalBody>
        <p
          style={{
            margin: 0,
            color: "var(--bone-dim)",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          Dispute on invoice{" "}
          <span className="mono" style={{ color: "var(--bone)" }}>
            {dispute?.invoiceId ?? ""}
          </span>{" "}
          will be marked <strong style={{ color: "var(--bone)" }}>{label}</strong>
          . Once resolved, no further actions are available.
        </p>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-ghost btn-mini"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-mini"
          onClick={confirm}
          disabled={busy}
        >
          {busy ? "Saving…" : `Mark ${label}`}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Refund modal
// ---------------------------------------------------------------------------

export function RefundDisputeModal({
  target,
  onClose,
  onRefunded,
}: {
  target: Dispute | null;
  onClose: () => void;
  onRefunded: (updated: Dispute) => void;
}) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();
  const open = !!target;
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [walletUnavailable, setWalletUnavailable] = useState(false);

  useEffect(() => {
    if (open) {
      setDestination("");
      setAmount("");
      setSubmitting(false);
      setWalletUnavailable(false);
    }
  }, [open]);

  const submit = useCallback(async () => {
    if (!target) return;
    const addr = destination.trim();
    if (!addr) {
      toast({ title: "Destination address required", tone: "warn" });
      return;
    }
    let atomic: bigint;
    try {
      atomic = parseDeroToAtomic(amount);
    } catch (err) {
      toast({
        title: "Invalid amount",
        description: err instanceof Error ? err.message : undefined,
        tone: "warn",
      });
      return;
    }
    setSubmitting(true);
    setWalletUnavailable(false);

    if (isDemo) {
      const updated: Dispute = {
        ...target,
        status: "refunded",
        refundPayoutId: `po_demo_${Math.random().toString(16).slice(2, 8)}`,
        resolvedAt: Date.now(),
      };
      setSubmitting(false);
      toast({
        title: "Refund dispatched",
        description: `${formatDero(atomic.toString(), 5)} DERO to ${truncate(
          addr,
          8,
          6,
        )}`,
        tone: "success",
      });
      onRefunded(updated);
      return;
    }

    const result = await apiFetch<Dispute>(
      `/api/pay/customers/disputes/${encodeURIComponent(target.id)}/refund`,
      {
        method: "POST",
        body: JSON.stringify({
          destinationAddress: addr,
          amountAtomic: atomic.toString(),
        }),
      },
    );
    setSubmitting(false);
    if (!result.ok) {
      if (result.status === 503) {
        setWalletUnavailable(true);
        return;
      }
      toast({
        title: "Refund failed",
        description: result.error,
        tone: "error",
      });
      return;
    }
    toast({ title: "Refund dispatched", tone: "success" });
    onRefunded(result.value);
  }, [target, destination, amount, onRefunded, toast]);

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      labelledById="dispute-refund-title"
      maxWidth={520}
    >
      <ModalHeader
        title="Issue refund"
        eyebrow="Refund dispute"
        onClose={onClose}
        disabled={submitting}
        id="dispute-refund-title"
      />
      <ModalBody>
        {walletUnavailable && (
          <div
            role="alert"
            style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              background: "var(--amber-wash)",
              border: "1px solid rgba(232,177,74,0.28)",
              color: "var(--amber)",
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            Wallet RPC not configured. Refund payouts require a connected
            wallet — set <code>walletRpc</code> in the gateway config and try
            again.
          </div>
        )}
        <p
          style={{
            margin: "0 0 14px",
            color: "var(--bone-dim)",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          Refunding invoice{" "}
          <span className="mono" style={{ color: "var(--bone)" }}>
            {target?.invoiceId ?? ""}
          </span>{" "}
          creates a payout from the merchant wallet and flips the dispute to
          <em> refunded</em>.
        </p>
        <FormField
          label="Destination address"
          htmlFor="dispute-refund-addr"
          hint="DERO address that should receive the refund."
        >
          <input
            id="dispute-refund-addr"
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="dero1q…"
            autoFocus
            style={inputStyle}
          />
        </FormField>
        <FormField
          label="Amount (DERO)"
          htmlFor="dispute-refund-amount"
          hint="Decimal DERO — converted to atomic units (1 DERO = 1e5 atomic)."
        >
          <input
            id="dispute-refund-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00000"
            style={inputStyle}
          />
        </FormField>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-ghost btn-mini"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-mini"
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? "Sending…" : "Send refund"}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shared Modal primitive — focus trap, Escape to close
// ---------------------------------------------------------------------------

function Modal({
  open,
  onClose,
  labelledById,
  maxWidth = 520,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledById: string;
  maxWidth?: number;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;

    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (focusables[0] ?? panel).focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="dispute-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <motion.div
            key="dispute-modal-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledById}
            tabIndex={-1}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="surface"
            style={{
              maxWidth,
              width: "100%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              outline: "none",
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ModalHeader({
  title,
  eyebrow,
  onClose,
  disabled,
  id,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "18px 22px",
        borderBottom: "1px solid var(--ink-hair)",
        gap: 16,
      }}
    >
      <div>
        {eyebrow && (
          <div
            className="eyebrow"
            style={{
              color: "var(--bone-quiet)",
              marginBottom: 4,
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
            }}
          >
            {eyebrow}
          </div>
        )}
        <h3
          id={id}
          className="display"
          style={{
            fontSize: 15,
            fontWeight: 600,
            margin: 0,
            color: "var(--bone)",
          }}
        >
          {title}
        </h3>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-mini"
        onClick={onClose}
        disabled={disabled}
        aria-label="Close"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function ModalBody({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "16px 22px",
        overflowY: "auto",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "14px 22px",
        borderTop: "1px solid var(--ink-hair)",
        justifyContent: "flex-end",
      }}
    >
      {children}
    </div>
  );
}

function FormField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor={htmlFor}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--bone-quiet)",
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <div
          style={{
            fontSize: 10.5,
            color: "var(--bone-quiet)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
