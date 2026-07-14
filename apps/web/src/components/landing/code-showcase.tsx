"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Section, SectionHeader } from "@/components/ui/section";
import { Copy, Check } from "lucide-react";

const K = ({ children }: { children: ReactNode }) => (
  <span className="k">{children}</span>
);
const S = ({ children }: { children: ReactNode }) => (
  <span className="s">{children}</span>
);
const C = ({ children }: { children: ReactNode }) => (
  <span className="c">{children}</span>
);
const N = ({ children }: { children: ReactNode }) => (
  <span className="n">{children}</span>
);
const F = ({ children }: { children: ReactNode }) => (
  <span className="f">{children}</span>
);

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
    highlighted: (
      <>
        <K>import</K>{" { SignInWithDero } "}
        <K>from</K> <S>&quot;dero-auth/react&quot;</S>;{"\n\n"}
        <K>export default function</K> <F>LoginPage</F>() {"{"}
        {"\n  "}
        <K>return</K> ({"\n    "}
        &lt;<F>SignInWithDero</F>
        {"\n      onSuccess={(session) => {"}
        {"\n        console."}
        <F>log</F>(<S>&quot;Authenticated:&quot;</S>, session.address);
        {"\n        "}
        <F>redirect</F>(<S>&quot;/dashboard&quot;</S>);{"\n      }}"}
        {"\n    /&gt;"}
        {"\n  );"}
        {"\n}"}
      </>
    ),
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
  amount: deroToAtomic("25.0"),   // 25.00000 DERO
  ttl: 900,                    // 15 minutes
});

console.log(invoice.integratedAddress);`,
    highlighted: (
      <>
        <K>import</K>{" { InvoiceEngine } "}
        <K>from</K> <S>&quot;dero-pay/server&quot;</S>;{"\n"}
        <K>import</K>{" { deroToAtomic } "}
        <K>from</K> <S>&quot;dero-pay&quot;</S>;{"\n\n"}
        <K>const</K> engine = <K>new</K> <F>InvoiceEngine</F>({"{"}
        {"\n  walletRpcUrl: "}
        <S>&quot;http://127.0.0.1:10103/json_rpc&quot;</S>,{"\n}"});
        {"\n\n"}
        <K>const</K> invoice = <K>await</K> engine.<F>createInvoice</F>({"{"}
        {"\n  name: "}
        <S>&quot;Premium Plan&quot;</S>,{"\n  amount: "}
        <F>deroToAtomic</F>(<S>&quot;25.0&quot;</S>),{"   "}
        <C>{"// 25.00000 DERO"}</C>
        {"\n  ttl: "}
        <N>900</N>,{"                    "}
        <C>{"// 15 minutes"}</C>
        {"\n}"});{"\n\n"}
        console.<F>log</F>(invoice.integratedAddress);
      </>
    ),
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
        <div className="code cs">
          <div className="bar flex items-center justify-between">
            <div className="flex gap-2" aria-hidden="true">
              <i style={{ background: "#ff5f57" }} />
              <i style={{ background: "#febc2e" }} />
              <i style={{ background: "#28c840" }} />
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

          <AnimatePresence mode="wait">
            <motion.pre
              key={active.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="cs-pre"
            >
              <code>{active.highlighted}</code>
            </motion.pre>
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        .cs .bar {
          justify-content: space-between;
        }
        .cs-pre {
          min-height: 280px;
        }
      `}</style>
    </Section>
  );
};
