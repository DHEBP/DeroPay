"use client";

import { motion } from "framer-motion";
import { AlertOctagon, Plus } from "lucide-react";

export function EmptyCard({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="surface"
      style={{
        padding: "48px 24px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 999,
          background: "var(--ink-elev-2)",
          border: "1px solid var(--ink-hair)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--bone-dim)",
        }}
        aria-hidden
      >
        <AlertOctagon size={20} strokeWidth={1.6} />
      </div>
      <div>
        <h4
          className="display"
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: "var(--bone)",
          }}
        >
          No disputes yet
        </h4>
        <p
          style={{
            margin: "4px 0 0",
            color: "var(--bone-dim)",
            fontSize: 12.5,
            maxWidth: "46ch",
          }}
        >
          When a customer reports a payment issue, log it here to track
          reconciliation, refunds, and resolution.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-mini"
        onClick={onCreate}
      >
        <Plus size={12} /> New dispute
      </button>
    </div>
  );
}

export function LoadingCard({ label }: { label: string }) {
  return (
    <div
      className="surface"
      style={{
        padding: "60px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "var(--bone-quiet)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        style={{
          display: "inline-block",
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: "1.5px solid var(--ink-hair)",
          borderTopColor: "var(--dero)",
        }}
        aria-hidden
      />
      {label}
    </div>
  );
}
