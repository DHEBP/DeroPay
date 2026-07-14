"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Fingerprint,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { DeroIcon } from "@/components/dero-icon";
import type { DemoKey } from "@/lib/store-catalog";

const MANUAL_RESUME_DELAY_MS = 7000;
const CONFIRMATION_TARGET = 8;

/**
 * A real DERO integrated address (`deri…`) used as the value for the demo's
 * payment-step QR. Real data here keeps the QR visually identical to the
 * QRs the dashboard renders via `qrcode.react`, so the demo's payment
 * theatre matches the production language. The address itself is mock —
 * no wallet is observing it.
 */
const DEMO_QR_ADDRESS =
  "deri1qy0ehnqcg0rr4qlsgkfgpv3cx6fmk9pq0a95rfhssmacxvhfvz2yqg2wpnee0gf5qmet0e8w4gp3sxm6t7ycx5qd6w5kfzlsq9ycx0z3qsadmn5k";

type DemoStep = {
  id: string;
  label: string;
  title: string;
  description: string;
  note: string;
  duration: number;
};

type DemoDefinition = {
  key: DemoKey;
  label: string;
  title: string;
  summary: string;
  badge: string;
  icon: LucideIcon;
  steps: DemoStep[];
  ctaHref: string;
  ctaLabel: string;
};

const DEMOS: DemoDefinition[] = [
  {
    key: "payment",
    label: "Payments",
    title: "Walk the invoice flow",
    summary:
      "Watch invoice creation, QR presentation, payment detection, and confirmation depth play out like a real buyer session.",
    badge: "Cart -> invoice -> paid",
    icon: CreditCard,
    ctaHref: "/checkout",
    ctaLabel: "Try checkout",
    steps: [
      {
        id: "invoice",
        label: "Invoice",
        title: "Create a DeroPay invoice",
        description:
          "The merchant session turns cart state into an invoice with amount, timeout, and order metadata.",
        note:
          "In the demo store this starts when the buyer enters checkout and generates the invoice.",
        duration: 2200,
      },
      {
        id: "scan",
        label: "QR",
        title: "Show a wallet-ready payment request",
        description:
          "The buyer sees a scannable QR and integrated address payload instead of vague manual payment instructions.",
        note:
          "This is the part the customer actually interacts with, so it needs to feel polished.",
        duration: 2800,
      },
      {
        id: "detected",
        label: "Detected",
        title: "Detect the incoming payment",
        description:
          "As soon as funds arrive, the UI can flip from waiting to payment-detected before final confirmation depth is reached.",
        note:
          "The demo store already simulates this state transition through the mock pay API.",
        duration: 2200,
      },
      {
        id: "confirming",
        label: "Confirm",
        title: "Track confirmation depth",
        description:
          "The invoice stays live while the merchant waits for the settlement policy to be satisfied.",
        note:
          "The panel uses an illustrative confirmation meter to sell the idea, not chain-specific policy.",
        duration: 3200,
      },
      {
        id: "confirmed",
        label: "Complete",
        title: "Mark the order paid",
        description:
          "Once the session is final, the order is ready for fulfillment, access unlock, or downstream webhook handling.",
        note:
          "The key point is the handoff from a wallet payment to a normal commerce state.",
        duration: 3500,
      },
    ],
  },
  {
    key: "auth",
    label: "Wallet Sign-In",
    title: "Show wallet identity in context",
    summary:
      "Watch Sign in with DERO move from wallet connection to a verified session without passwords.",
    badge: "Wallet -> challenge -> session",
    icon: ShieldCheck,
    ctaHref: "/",
    ctaLabel: "Use header sign-in",
    steps: [
      {
        id: "idle",
        label: "Prompt",
        title: "Offer wallet-native sign-in",
        description:
          "The store exposes a familiar call to action, but the credential is the wallet rather than an email/password form.",
        note:
          "This belongs in the store chrome, not on an isolated documentation page.",
        duration: 1800,
      },
      {
        id: "connect",
        label: "Connect",
        title: "Connect to the wallet transport",
        description:
          "The client opens the wallet bridge and requests a session without asking the user to create a new account.",
        note:
          "In the demo app, the DeroAuth provider already manages this XSWD connection layer.",
        duration: 2200,
      },
      {
        id: "challenge",
        label: "Challenge",
        title: "Present a sign-in challenge",
        description:
          "The wallet receives a structured sign-in request with domain, nonce, and issued-at metadata.",
        note:
          "This makes the authentication story feel concrete and inspectable.",
        duration: 3000,
      },
      {
        id: "signing",
        label: "Verify",
        title: "Verify the wallet signature",
        description:
          "The server checks the Schnorr signature against the claimed DERO address and turns it into an application session.",
        note:
          "This is where the idea moves from wallet UX to a real store session.",
        duration: 2000,
      },
      {
        id: "verified",
        label: "Session",
        title: "Issue the authenticated session",
        description:
          "The buyer is now recognized by wallet identity and can unlock gated actions or account state.",
        note:
          "Digital access, subscription products, and member perks are where this becomes easy to sell.",
        duration: 3500,
      },
    ],
  },
  {
    key: "escrow",
    label: "Escrow",
    title: "Explain trust-protected commerce",
    summary:
      "Watch funding, lockup, and release animate so higher-trust transactions feel tangible instead of abstract.",
    badge: "Fund -> lock -> release",
    icon: Lock,
    ctaHref: "/checkout",
    ctaLabel: "Try escrow checkout",
    steps: [
      {
        id: "deploy",
        label: "Deploy",
        title: "Create the escrow contract",
        description:
          "The transaction starts with a dedicated escrow agreement and clear terms around expiry, fees, and payout rules.",
        note:
          "This is the right story for higher-trust service purchases, not just for merch.",
        duration: 2200,
      },
      {
        id: "fund",
        label: "Fund",
        title: "Fund the contract",
        description:
          "The buyer sends funds into the escrow state instead of paying the seller directly on the first step.",
        note:
          "The store can explain this visually without overwhelming the buyer with contract jargon.",
        duration: 2800,
      },
      {
        id: "locked",
        label: "Locked",
        title: "Hold funds in the protected state",
        description:
          "At this point the money is locked, the agreement exists on-chain, and both parties can reason about the next step.",
        note:
          "This is where escrow starts to feel safer than a normal invoice for service work.",
        duration: 2200,
      },
      {
        id: "release",
        label: "Release",
        title: "Resolve delivery and payout",
        description:
          "Once the buyer confirms delivery or the contract resolves, funds are split according to the agreed rules.",
        note:
          "A service purchase is the clearest place to show seller payout plus fee extraction.",
        duration: 2800,
      },
      {
        id: "settled",
        label: "Settled",
        title: "Close the protected transaction",
        description:
          "The flow ends in a normal commerce outcome, but with stronger trust guarantees along the way.",
        note:
          "The demo store should make this feel like a product feature, not an abstract protocol diagram.",
        duration: 3500,
      },
    ],
  },
];

function getDemoDefinition(key: DemoKey) {
  return DEMOS.find((demo) => demo.key === key) ?? DEMOS[0]!;
}

function StepPills({
  steps,
  stepIndex,
  onSelect,
}: {
  steps: DemoStep[];
  stepIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((step, index) => {
        const active = index === stepIndex;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelect(index)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "border border-[var(--border-strong)] bg-[var(--accent-dim)] text-[var(--accent-strong)]"
                : "border border-white/[0.08] bg-white/[0.04] text-[var(--text-muted)] hover:text-white"
            }`}
          >
            {step.label}
          </button>
        );
      })}
    </div>
  );
}

function TimelineMeter({
  steps,
  stepIndex,
  autoplayPaused,
}: {
  steps: DemoStep[];
  stepIndex: number;
  autoplayPaused: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <div className="flex min-w-[220px] flex-1 gap-2">
        {steps.map((step, index) => {
          const complete = index < stepIndex;
          const active = index === stepIndex;
          return (
            <div
              key={step.id}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                complete
                  ? "bg-[var(--accent-strong)]"
                  : active
                    ? "bg-[var(--accent)]"
                    : "bg-white/[0.08]"
              }`}
            />
          );
        })}
      </div>
      <span className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {autoplayPaused ? "Inspecting" : "Auto-play"}
      </span>
    </div>
  );
}

function PaymentVisual({ stepId, compact }: { stepId: string; compact: boolean }) {
  const [confirmations, setConfirmations] = useState(() =>
    stepId === "confirmed" ? CONFIRMATION_TARGET : 0
  );
  const circumference = 2 * Math.PI * 40;

  useEffect(() => {
    if (stepId !== "confirming") {
      return;
    }

    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setConfirmations(Math.min(current, CONFIRMATION_TARGET));
      if (current >= CONFIRMATION_TARGET) {
        clearInterval(interval);
      }
    }, 350);

    return () => clearInterval(interval);
  }, [stepId]);

  if (stepId === "invoice") {
    return (
      <div className="rounded-[1.5rem] border border-white/[0.08] bg-black/[0.24] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Demo Store Order
            </p>
            <h4 className="mt-2 font-display text-2xl font-semibold text-white">
              Premium merch bundle
            </h4>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Cart state becomes an invoice with amount, payment timeout, and order metadata.
            </p>
          </div>
          <motion.div
            animate={{
              y: [0, -2, 0],
              boxShadow: [
                "0 0 0 rgba(49,223,144,0)",
                "0 0 28px rgba(49,223,144,0.16)",
                "0 0 0 rgba(49,223,144,0)",
              ],
            }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="rounded-[1.2rem] bg-[var(--accent-dim)] px-3 py-2 text-right"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Amount
            </p>
            <p className="font-display text-2xl font-semibold text-white">4.55 DERO</p>
          </motion.div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          <span className="rounded-full border border-white/[0.08] px-3 py-1">Expires 14:59</span>
          <span className="rounded-full border border-white/[0.08] px-3 py-1">
            Status pending
          </span>
        </div>
      </div>
    );
  }

  if (stepId === "scan") {
    // Pixel sizes tuned to the existing layout footprint (h-32/h-40 from the
    // original synthesized grid). Animated scan-line travel is sized to
    // those values so the line never escapes the frame.
    const qrPixelSize = compact ? 128 : 160;
    const scanTravel = compact ? 96 : 126;

    return (
      <div className="flex flex-col items-center gap-5">
        <div className="relative rounded-[1.4rem] bg-white p-3 shadow-[0_0_40px_-10px_rgba(49,223,144,0.32)]">
          <div className="relative overflow-hidden rounded-[0.9rem] bg-white">
            <QRCodeSVG
              value={DEMO_QR_ADDRESS}
              size={qrPixelSize}
              bgColor="#ffffff"
              fgColor="#0a0c0a"
              level="M"
              marginSize={2}
              role="img"
              aria-label="Demo DERO payment QR"
            />
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-2 top-2 h-6 rounded-full bg-[linear-gradient(180deg,rgba(49,223,144,0),rgba(49,223,144,0.34),rgba(49,223,144,0))] mix-blend-multiply"
              animate={{ y: [0, scanTravel, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <motion.div
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="rounded-[0.8rem] bg-white p-1.5"
            >
              <DeroIcon size={22} className="text-[#0d120f]" />
            </motion.div>
          </div>
        </div>
        <div className="max-w-sm text-center">
          <p className="font-display text-xl font-semibold text-white">Scan or copy to pay</p>
          <p className="mt-2 font-mono text-xs tabular-nums text-[var(--text-muted)]">
            {`${DEMO_QR_ADDRESS.slice(0, 12)}\u2026${DEMO_QR_ADDRESS.slice(-8)}`}
          </p>
        </div>
      </div>
    );
  }

  if (stepId === "detected") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[1.5rem] border border-[var(--border-strong)] bg-[var(--accent-dim)] p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/[0.18]">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-strong)]" />
        </div>
        <div>
          <p className="font-display text-2xl font-semibold text-white">Payment detected</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            The invoice has seen funds land and is moving into its confirmation phase.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((dot) => (
            <motion.span
              key={dot}
              className="h-2.5 w-2.5 rounded-full bg-[var(--accent-strong)]"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
              transition={{ duration: 1.1, delay: dot * 0.16, repeat: Infinity }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (stepId === "confirming") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-24 w-24">
          <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="8"
            />
            <motion.circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke="var(--accent)"
              strokeLinecap="round"
              strokeWidth="8"
              strokeDasharray={circumference}
              animate={{
                strokeDashoffset:
                  circumference * (1 - confirmations / CONFIRMATION_TARGET),
              }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-xl font-bold text-white">
              {confirmations}/{CONFIRMATION_TARGET}
            </span>
          </div>
        </div>
        <div className="text-center">
          <p className="font-display text-xl font-semibold text-white">Waiting on finality</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Confirmation depth is climbing toward the merchant&apos;s accepted threshold.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-[1.5rem] border border-[var(--border-strong)] bg-[var(--accent-dim)] p-6 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", bounce: 0.45 }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-black/[0.18]"
      >
        <CheckCircle2 className="h-7 w-7 text-[var(--accent-strong)]" />
      </motion.div>
      <div>
        <p className="font-display text-2xl font-semibold text-white">Order marked paid</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          The store can now ship, unlock access, or hand off to downstream order logic.
        </p>
      </div>
      <div className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
        4.55 DERO · {CONFIRMATION_TARGET}/{CONFIRMATION_TARGET} confirmations
      </div>
      {!compact ? (
        <div className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          webhook POST {"->"} 200 OK
        </div>
      ) : null}
    </div>
  );
}

function AuthVisual({ stepId }: { stepId: string }) {
  if (stepId === "idle") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <motion.div
          animate={{
            y: [0, -2, 0],
            boxShadow: [
              "0 0 0 rgba(49,223,144,0)",
              "0 0 26px rgba(49,223,144,0.14)",
              "0 0 0 rgba(49,223,144,0)",
            ],
          }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          className="rounded-full"
        >
          <button
            type="button"
            className="inline-flex items-center gap-3 rounded-full border border-[var(--border-strong)] bg-[var(--accent-dim)] px-5 py-3 text-sm font-semibold text-white"
          >
            <DeroIcon size={18} className="text-[var(--accent-strong)]" />
            Sign in with DERO
          </button>
        </motion.div>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          No password field. No email gate. Just a wallet-native account entry point in the store chrome.
        </p>
      </div>
    );
  }

  if (stepId === "connect") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--accent-dim)]">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-strong)]" />
        </div>
        <div>
          <p className="font-display text-xl font-semibold text-white">Connecting to the wallet</p>
          <p className="mt-2 font-mono text-xs text-[var(--text-muted)]">
            XSWD {"->"} ws://127.0.0.1:44326/xswd
          </p>
        </div>
      </div>
    );
  }

  if (stepId === "challenge") {
    return (
      <div className="rounded-[1.5rem] border border-white/[0.08] bg-black/[0.24] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Wallet challenge
        </p>
        <pre className="mt-4 overflow-hidden font-mono text-[11px] leading-6 text-[var(--text-secondary)]">
          <span className="text-[var(--accent-strong)]">demo.deropay.com</span>
          {" wants you to sign in\nwith your DERO wallet:\n"}
          <span className="font-semibold text-white">dero1qy...k8f3x9</span>
          {"\n\nURI: https://demo.deropay.com\nNonce: a7k2m4n6\nIssued At: 2026-04-23T15:00:00Z"}
        </pre>
        <motion.div
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]"
        >
          <Fingerprint className="h-3.5 w-3.5" />
          Awaiting signature
        </motion.div>
      </div>
    );
  }

  if (stepId === "signing") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--accent-dim)]">
          <Fingerprint className="h-6 w-6 text-[var(--accent-strong)]" />
        </div>
        <div>
          <p className="font-display text-xl font-semibold text-white">Verifying the signature</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            The wallet challenge becomes a valid store session once the signature matches the claimed address.
          </p>
        </div>
        <div className="w-full max-w-sm space-y-2 rounded-[1.25rem] border border-white/[0.08] bg-black/[0.22] p-4">
          {[72, 88, 54].map((width, index) => (
            <div key={width} className="h-2 rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-[var(--accent)]"
                animate={{ scaleX: [0.2, 1, 0.35] }}
                transition={{
                  duration: 1.15,
                  delay: index * 0.15,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ width: `${width}%`, transformOrigin: "left" }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-[1.5rem] border border-[var(--border-strong)] bg-[var(--accent-dim)] p-6 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", bounce: 0.5 }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-black/[0.18]"
      >
        <CheckCircle2 className="h-7 w-7 text-[var(--accent-strong)]" />
      </motion.div>
      <div>
        <p className="font-display text-2xl font-semibold text-white">Session authenticated</p>
        <p className="mt-2 font-mono text-xs text-[var(--text-muted)]">
          JWT issued · wallet identity attached
        </p>
      </div>
    </div>
  );
}

function EscrowActors({ activeStep }: { activeStep: string }) {
  const active = (value: string[]) => value.includes(activeStep);

  const actors = [
    { label: "Buyer", steps: ["fund", "release"], icon: Users },
    { label: "Contract", steps: ["deploy", "locked"], icon: Lock },
    { label: "Seller", steps: ["settled"], icon: ShieldCheck },
  ];

  return (
    <div className="flex items-center justify-between gap-3">
      {actors.map((actor) => {
        const Icon = actor.icon;
        const isActive = active(actor.steps);
        return (
          <motion.div
            key={actor.label}
            animate={{ scale: isActive ? 1.08 : 1, opacity: isActive ? 1 : 0.5 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-col items-center gap-2"
          >
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-full border ${
                isActive
                  ? "border-[var(--border-strong)] bg-[var(--accent-dim)] text-[var(--accent-strong)]"
                  : "border-white/[0.08] bg-black/[0.22] text-[var(--text-muted)]"
              }`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {actor.label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

function EscrowVisual({ stepId }: { stepId: string }) {
  if (stepId === "deploy") {
    return (
      <div className="space-y-5">
        <EscrowActors activeStep={stepId} />
        <div className="flex flex-col items-center gap-4 rounded-[1.5rem] border border-white/[0.08] bg-black/[0.24] p-5 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--accent-dim)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-strong)]" />
          </div>
          <div>
            <p className="font-display text-2xl font-semibold text-white">Deploying escrow contract</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Service terms, fee rules, and expiry are locked into a dedicated contract before funds move.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {["Amount 100 DERO", "Fee 2.5%", "Expiry 720 blocks"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (stepId === "fund") {
    return (
      <div className="space-y-5">
        <EscrowActors activeStep={stepId} />
        <div className="flex flex-col items-center gap-4 rounded-[1.5rem] border border-[var(--border-strong)] bg-[var(--accent-dim)] p-6 text-center">
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <ArrowDown className="h-6 w-6 text-[var(--accent-strong)]" />
          </motion.div>
          <div className="rounded-[1.2rem] border border-white/[0.08] bg-black/[0.18] px-5 py-4">
            <p className="font-mono text-2xl font-bold text-[var(--accent-strong)]">100.0 DERO</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Buyer funding contract
            </p>
          </div>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            Funds are sent into the protected state instead of directly to the seller.
          </p>
        </div>
      </div>
    );
  }

  if (stepId === "locked") {
    return (
      <div className="space-y-5">
        <EscrowActors activeStep={stepId} />
        <div className="rounded-[1.5rem] border border-[var(--border-strong)] bg-[var(--accent-dim)] p-5">
          <div className="flex flex-col items-center gap-4 text-center">
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(49,223,144,0)",
                  "0 0 26px 6px rgba(49,223,144,0.18)",
                  "0 0 0 0 rgba(49,223,144,0)",
                ],
              }}
              transition={{ duration: 2.2, repeat: Infinity }}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-strong)] bg-black/[0.18]"
            >
              <Lock className="h-5 w-5 text-[var(--accent-strong)]" />
            </motion.div>
            <div>
              <p className="font-display text-2xl font-semibold text-white">Funds locked</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                The contract now holds the funds until delivery resolves or the agreement is disputed or refunded.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {["ConfirmDelivery", "Dispute", "Refund"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/[0.08] bg-black/[0.22] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stepId === "release") {
    return (
      <div className="space-y-5">
        <EscrowActors activeStep={stepId} />
        <div className="rounded-[1.5rem] border border-white/[0.08] bg-black/[0.24] p-5">
          <div className="flex items-center justify-center gap-2 text-[var(--accent-strong)]">
            <ShieldAlert className="h-5 w-5" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              Buyer confirms delivery
            </p>
          </div>
          <div className="mt-4 space-y-3">
            <motion.div
              initial={{ x: -12, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.22 }}
              className="flex items-center justify-between rounded-[1.1rem] border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-[var(--text-secondary)]"
            >
              <span>Seller receives</span>
              <span className="font-mono text-white">97.5 DERO</span>
            </motion.div>
            <motion.div
              initial={{ x: 12, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.22, delay: 0.08 }}
              className="flex items-center justify-between rounded-[1.1rem] border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-[var(--text-secondary)]"
            >
              <span>Platform fee</span>
              <span className="font-mono text-white">2.5 DERO</span>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <EscrowActors activeStep={stepId} />
      <div className="flex flex-col items-center gap-4 rounded-[1.5rem] border border-[var(--border-strong)] bg-[var(--accent-dim)] p-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-black/[0.18]"
        >
          <CheckCircle2 className="h-7 w-7 text-[var(--accent-strong)]" />
        </motion.div>
        <div>
          <p className="font-display text-2xl font-semibold text-white">Escrow settled</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            The protected transaction ends in a normal commerce outcome, but with trust layered into the flow.
          </p>
        </div>
        <div className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          escrow.released webhook {"->"} 200 OK
        </div>
      </div>
    </div>
  );
}

function DemoVisual({
  demoKey,
  stepId,
  compact,
}: {
  demoKey: DemoKey;
  stepId: string;
  compact: boolean;
}) {
  if (demoKey === "payment") {
    return <PaymentVisual stepId={stepId} compact={compact} />;
  }

  if (demoKey === "auth") {
    return <AuthVisual stepId={stepId} />;
  }

  return <EscrowVisual stepId={stepId} />;
}

function RailAction({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:border-[var(--border-strong)] hover:bg-[var(--accent-dim)]"
    >
      {icon}
      {label}
    </Link>
  );
}

export function DemoExperience({
  demoKey,
  compact = false,
  context,
}: {
  demoKey: DemoKey;
  compact?: boolean;
  context?: string;
}) {
  const demo = getDemoDefinition(demoKey);
  const [stepIndex, setStepIndex] = useState(0);
  const [autoplayPaused, setAutoplayPaused] = useState(false);
  const [pauseNonce, setPauseNonce] = useState(0);
  const step = demo.steps[stepIndex]!;

  useEffect(() => {
    if (autoplayPaused) {
      return;
    }

    const timeout = setTimeout(() => {
      setStepIndex((current) => (current + 1) % demo.steps.length);
    }, step.duration);

    return () => clearTimeout(timeout);
  }, [autoplayPaused, demo.steps.length, step.duration, stepIndex]);

  useEffect(() => {
    if (!autoplayPaused) {
      return;
    }

    const timeout = setTimeout(() => {
      setAutoplayPaused(false);
    }, MANUAL_RESUME_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [autoplayPaused, pauseNonce]);

  const inspectStep = (index: number) => {
    setStepIndex(index);
    setAutoplayPaused(true);
    setPauseNonce((current) => current + 1);
  };

  return (
    <div
      className={`glass-panel-strong soft-outline rounded-[2rem] ${
        compact ? "p-5" : "min-h-[620px] p-6 md:p-7"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="section-kicker">{demo.label}</span>
            <span className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--warm)]">
              {demo.badge}
            </span>
          </div>
          <div>
            <h3
              className={`${
                compact ? "text-2xl" : "text-3xl"
              } font-display font-semibold tracking-[-0.04em] text-white`}
            >
              {demo.title}
            </h3>
            <p
              className={`mt-2 max-w-2xl ${
                compact ? "text-sm leading-6" : "text-sm leading-7 md:text-base"
              } text-[var(--text-secondary)]`}
            >
              {demo.summary}
            </p>
          </div>
        </div>

        {!compact ? (
          <RailAction
            href={demo.ctaHref}
            label={demo.ctaLabel}
            icon={<ArrowRight className="h-4 w-4" />}
          />
        ) : null}
      </div>

      {context ? (
        <div className="mt-5 rounded-[1.35rem] border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
          {context}
        </div>
      ) : null}

      <div className="mt-5">
        <StepPills steps={demo.steps} stepIndex={stepIndex} onSelect={inspectStep} />
        <TimelineMeter
          steps={demo.steps}
          stepIndex={stepIndex}
          autoplayPaused={autoplayPaused}
        />
      </div>

      <div className={`mt-5 grid items-stretch gap-5 ${compact ? "" : "xl:grid-cols-2"}`}>
        <div
          className={`flex items-center justify-center rounded-[1.75rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 ${
            compact ? "" : "min-h-[300px]"
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${demo.key}-${step.id}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <DemoVisual demoKey={demo.key} stepId={step.id} compact={compact} />
            </motion.div>
          </AnimatePresence>
        </div>

        <div
          className={`flex flex-col justify-between rounded-[1.75rem] border border-white/[0.08] bg-black/[0.24] p-5 ${
            compact ? "" : "min-h-[300px]"
          }`}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Step {stepIndex + 1} of {demo.steps.length}
            </p>
            <h4 className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-white">
              {step.title}
            </h4>
            <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
              {step.description}
            </p>
            <p className="mt-4 rounded-[1.25rem] border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
              {step.note}
            </p>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => inspectStep(Math.max(stepIndex - 1, 0))}
                disabled={stepIndex === 0}
                className="rounded-full border border-white/[0.08] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => inspectStep(Math.min(stepIndex + 1, demo.steps.length - 1))}
                disabled={stepIndex === demo.steps.length - 1}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#071008] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next step
                <ChevronRight className="h-4 w-4" />
              </button>
              {autoplayPaused ? (
                <button
                  type="button"
                  onClick={() => setAutoplayPaused(false)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:border-[var(--border-strong)] hover:bg-[var(--accent-dim)]"
                >
                  Resume auto-play
                </button>
              ) : null}
            </div>

            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {autoplayPaused
                ? "Auto-play pauses while you inspect the steps."
                : "The demo advances on its own and loops continuously."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoShowcaseRail() {
  const [activeKey, setActiveKey] = useState<DemoKey>("payment");
  const activeDemo = getDemoDefinition(activeKey);

  return (
    <section id="demo-experience" className="px-6 pb-16 md:px-10 md:pb-20">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-8 max-w-2xl space-y-3">
          <p className="section-kicker">How it works</p>
          <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-white md:text-5xl text-balance">
            Watch the mechanics without leaving the store.
          </h2>
          <p className="text-sm leading-7 text-[var(--text-secondary)] md:text-base text-pretty">
            Each panel below animates the flow for payment, wallet sign-in, or escrow. Let
            it play, or click any step to inspect it.
          </p>
        </div>

        <div className="w-full">
          <div className="mb-5 grid gap-3 md:grid-cols-3">
            {DEMOS.map((demo) => {
              const Icon = demo.icon;
              const active = demo.key === activeKey;
              return (
                <button
                  key={demo.key}
                  type="button"
                  onClick={() => setActiveKey(demo.key)}
                  aria-pressed={active}
                  className={`group flex items-center gap-4 rounded-[1.35rem] border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-bg)] ${
                    active
                      ? "border-[var(--border-strong)] bg-[var(--accent-dim)] shadow-[0_18px_36px_rgba(0,0,0,0.18)]"
                      : "border-white/[0.08] bg-white/[0.04] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                      active
                        ? "bg-black/[0.18] text-[var(--accent-strong)]"
                        : "bg-black/[0.22] text-[var(--text-secondary)] group-hover:text-white"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-display text-lg font-semibold text-white">
                        {demo.label}
                      </p>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 ${
                          active ? "text-[var(--accent-strong)]" : "text-[var(--text-muted)]"
                        }`}
                      />
                    </div>
                    <p className="truncate text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      {demo.badge}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <DemoExperience key={activeDemo.key} demoKey={activeDemo.key} />

          <div className="mt-4 flex flex-col gap-3 rounded-[1.35rem] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)] md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <Sparkles
                className="mt-1 h-4 w-4 shrink-0 text-[var(--warm)]"
                aria-hidden="true"
              />
              <p>
                Every flow runs client-side against the production SDK. No real DERO moves.
              </p>
            </div>
            <Link
              href="https://deropay.derod.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-[var(--accent-strong)] transition-colors hover:text-white"
            >
              View SDK docs
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
