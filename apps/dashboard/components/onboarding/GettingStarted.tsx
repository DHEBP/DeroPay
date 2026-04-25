"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ArrowRight, Circle } from "lucide-react";
import { useLiveFetch } from "@/lib/useLiveFetch";

type Step = {
  key: string;
  done: boolean;
  title: string;
  description: string;
  cta: { label: string; href: string };
};

type KeyList = { keys: Array<unknown> };
type WebhookList = { webhooks: Array<unknown> };

type Props = {
  walletConnected: boolean;
  hasInvoices: boolean;
};

/**
 * First-run checklist. Renders in place of the KPI row on the dashboard
 * home when the merchant has no activity yet. Auto-checks each step from
 * live data; does not render when everything is already done.
 */
export function GettingStarted({ walletConnected, hasInvoices }: Props) {
  const { data: keyData } = useLiveFetch<KeyList>(
    "dev-keys",
    async () => {
      const r = await fetch("/api/pay/developers/keys");
      if (!r.ok) throw new Error("keys http " + r.status);
      return (await r.json()) as KeyList;
    },
  );
  const { data: hookData } = useLiveFetch<WebhookList>(
    "dev-webhooks",
    async () => {
      const r = await fetch("/api/pay/developers/webhooks");
      if (!r.ok) throw new Error("webhooks http " + r.status);
      return (await r.json()) as WebhookList;
    },
  );

  const hasKey = (keyData?.keys?.length ?? 0) > 0;
  const hasWebhook = (hookData?.webhooks?.length ?? 0) > 0;

  const steps: Step[] = [
    {
      key: "wallet",
      done: walletConnected,
      title: "Connect your wallet",
      description: "Run walletd + derod and point the dashboard at the RPC endpoint.",
      cta: { label: "Wallet settings", href: "/settings" },
    },
    {
      key: "invoice",
      done: hasInvoices,
      title: "Issue your first invoice",
      description: "Create an invoice to see it settle on-chain and populate your ledger.",
      cta: { label: "New invoice", href: "/invoices?new=1" },
    },
    {
      key: "key",
      done: hasKey,
      title: "Create an API key",
      description: "Needed by your storefront / SDK to issue invoices programmatically.",
      cta: { label: "Open Developers", href: "/developers" },
    },
    {
      key: "webhook",
      done: hasWebhook,
      title: "Register a webhook",
      description: "Receive real-time invoice.paid and payout events on your backend.",
      cta: { label: "Add webhook", href: "/developers" },
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const progressPct = Math.round((doneCount / steps.length) * 100);

  return (
    <motion.section
      className="surface"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Getting started"
      style={{
        padding: "22px 26px 24px",
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div
            className="eyebrow-mono"
            style={{ marginBottom: 6 }}
          >
            Getting started
          </div>
          <h2
            className="display"
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.018em",
              color: "var(--bone)",
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            {doneCount === 0
              ? "Let's wire up your treasury"
              : `${doneCount} of ${steps.length} set up — nearly there`}
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "var(--bone-dim)",
              maxWidth: "54ch",
              lineHeight: 1.55,
            }}
          >
            Complete each step to start accepting DERO. Your dashboard will
            switch to its full analytics view once you&apos;ve issued your
            first invoice.
          </p>
        </div>
        <div
          aria-hidden
          style={{
            minWidth: 140,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--bone-mute)",
            letterSpacing: "0.04em",
          }}
        >
          <span>{progressPct}% complete</span>
          <div
            style={{
              height: 4,
              background: "var(--ink-hair)",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{ height: "100%", background: "var(--dero)" }}
            />
          </div>
        </div>
      </header>

      <ol
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {steps.map((step) => (
          <li key={step.key}>
            <StepCard step={step} />
          </li>
        ))}
      </ol>
    </motion.section>
  );
}

function StepCard({ step }: { step: Step }) {
  return (
    <div
      aria-current={step.done ? undefined : "step"}
      style={{
        position: "relative",
        padding: "14px 16px 16px",
        borderRadius: "var(--radius)",
        border: `1px solid ${step.done ? "var(--dero-hair)" : "var(--ink-hair)"}`,
        background: step.done ? "var(--dero-wash)" : "var(--ink-elev-2)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 130,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {step.done ? (
          <Check size={15} color="var(--dero)" strokeWidth={2.4} />
        ) : (
          <Circle size={15} color="var(--bone-mute)" strokeWidth={1.5} />
        )}
        <span
          className="eyebrow-mono"
          style={{
            color: step.done ? "var(--dero)" : "var(--bone-mute)",
            fontSize: 10.5,
          }}
        >
          {step.done ? "Done" : "To do"}
        </span>
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--bone)",
          lineHeight: 1.35,
        }}
      >
        {step.title}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--bone-dim)",
          lineHeight: 1.5,
          flex: 1,
        }}
      >
        {step.description}
      </div>
      {!step.done && (
        <Link
          href={step.cta.href}
          className="btn-link"
          style={{
            textDecoration: "none",
            marginTop: 4,
          }}
        >
          {step.cta.label} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}
