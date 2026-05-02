"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Section, SectionHeader } from "@/components/ui/section";
import { Copy, Check } from "lucide-react";

const tabs = [
  {
    id: "auth",
    label: "Authentication",
    filename: "login.tsx",
    code: `import { SignInWithDero } from "dero-auth/react";

export default function LoginPage() {
  return (
    <SignInWithDero
      onSuccess={(session) => {
        console.log("Authenticated:", session.address);
        redirect("/dashboard");
      }}
    />
  );
}`,
  },
  {
    id: "pay",
    label: "Payments",
    filename: "checkout.ts",
    code: `import { InvoiceEngine } from "dero-pay/server";
import { deroToAtomic } from "dero-pay";

const engine = new InvoiceEngine({
  walletRpcUrl: "http://127.0.0.1:10103/json_rpc",
});

const invoice = await engine.createInvoice({
  name: "Premium Plan",
  amount: deroToAtomic("25.0"),
  ttl: 900, // 15 minutes
});

console.log(invoice.integratedAddress);`,
  },
];

export const CodeShowcase = () => {
  const [activeTab, setActiveTab] = useState("auth");
  const [copied, setCopied] = useState(false);
  const active = tabs.find((t) => t.id === activeTab)!;

  const copyCode = () => {
    navigator.clipboard.writeText(active.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Section className="border-t border-[var(--color-border-soft)] bg-[var(--color-background)]">
      <SectionHeader
        eyebrow="Developers"
        title="Ship faster"
        description="Drop-in components and framework integrations. From sign-in to checkout in a few lines of code."
      />

      <div className="mx-auto max-w-4xl">
        <div className="glass-panel soft-outline overflow-hidden rounded-[1.5rem]">
          <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] bg-[var(--color-surface-hover)]/40 px-6 py-4">
            <div className="flex gap-2" aria-hidden="true">
              <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <div className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>

            <div role="tablist" className="flex gap-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`text-sm font-bold transition-colors ${
                    activeTab === tab.id
                      ? "text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={copyCode}
              aria-label={copied ? "Copied" : "Copy code"}
              className="text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              {copied ? (
                <Check size={16} className="text-[var(--color-accent)]" />
              ) : (
                <Copy size={16} />
              )}
            </button>
          </div>

          <div className="p-8">
            <AnimatePresence mode="wait">
              <motion.pre
                key={active.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="overflow-x-auto font-mono text-sm leading-relaxed text-[var(--color-text-secondary)]"
              >
                <code>{active.code}</code>
              </motion.pre>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Section>
  );
};
