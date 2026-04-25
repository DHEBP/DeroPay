"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBag,
  Puzzle,
  Terminal,
  Download,
  ArrowUpRight,
  Copy,
  Check,
  Book,
  Store,
  Boxes,
  Globe,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/toast";

/** Small copy-to-clipboard button — standalone, no external deps. */
function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handle = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({
        title: "Copy failed",
        description: "Clipboard access was blocked. Copy manually.",
        tone: "warn",
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      className="btn btn-ghost btn-mini"
      aria-label={label ? `Copy ${label}` : "Copy"}
      style={{ fontSize: 11, gap: 4 }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** A code block with an optional header + copy button. */
function CodeBlock({
  code,
  caption,
  copy = true,
}: {
  code: string;
  caption?: string;
  copy?: boolean;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      {(caption || copy) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
            gap: 8,
          }}
        >
          {caption ? (
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--bone-mute)",
              }}
            >
              {caption}
            </span>
          ) : (
            <span />
          )}
          {copy && <CopyButton value={code} label={caption} />}
        </div>
      )}
      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          background: "var(--ink-deep)",
          border: "1px solid var(--ink-hair)",
          borderRadius: "var(--radius-sm)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--bone-dim)",
          lineHeight: 1.7,
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {code}
      </pre>
    </div>
  );
}

/** A richer integration card (not a FeaturePreviewGrid entry). */
function IntegrationCard({
  Icon,
  title,
  badge,
  description,
  children,
  index,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  badge: string;
  description: string;
  children: React.ReactNode;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="surface"
      style={{
        padding: "22px 22px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 34,
              height: 34,
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
            <Icon size={15} strokeWidth={1.8} />
          </div>
          <h3
            className="display"
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "-0.012em",
              color: "var(--bone)",
              margin: 0,
            }}
          >
            {title}
          </h3>
        </div>
        <span
          style={{
            padding: "3px 9px",
            borderRadius: 999,
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--dero)",
            background: "var(--dero-wash)",
            border: "1px solid var(--dero-hair)",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {badge}
        </span>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--bone-dim)",
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        {description}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </motion.div>
  );
}

const WOOCOMMERCE_ZIP_PATH = "/downloads/deropay-for-woocommerce.zip";
const WOOCOMMERCE_BUILD_CMD = "bun run build:woocommerce";
const MEDUSA_INSTALL_CMD = "npm install @deropay/medusa-payment";
const SHOPIFY_CLONE_CMD = `git clone https://github.com/deropay/DeroPay-main.git
cd DeroPay-main/plugins/shopify
bun install`;
const MAGENTO_COMPOSER_CMD = "composer require deropay/magento2";
const MAGENTO_DEPLOY_CMD =
  "bin/magento setup:upgrade && bin/magento setup:static-content:deploy";
const BIGCOMMERCE_DEPLOY_CMD = `cd plugins/bigcommerce
bun install
bun run build`;
const CURL_SNIPPET = `curl -X POST https://your-deropay.example/api/pay/create \\
  -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Order #4821",
    "amount": "12.4",
    "currency": "DERO",
    "expiresIn": 3600
  }'`;

export function IntegrationsPage() {
  return (
    <DashboardShell>
      <PageHeader
        title="Integrations"
        subtitle="Drop DeroPay into your existing commerce stack — WooCommerce, Medusa, or roll your own against the REST gateway."
        action={
          <a
            href="/docs/guides/prerequisites"
            style={{
              fontSize: 13.5,
              color: "var(--bone-dim)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Book size={13} /> Setup guides <ArrowUpRight size={13} />
          </a>
        }
      />

      {/* Available integrations — richer cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <IntegrationCard
          index={0}
          Icon={ShoppingBag}
          title="WooCommerce"
          badge="Available"
          description="Drop-in payment gateway for any WooCommerce storefront. Upload the ZIP under Plugins → Add New → Upload, then configure under WooCommerce → Settings → Payments → DeroPay."
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <a
              href={WOOCOMMERCE_ZIP_PATH}
              download
              className="btn btn-primary btn-mini"
              style={{ fontSize: 11, gap: 4 }}
            >
              <Download size={12} /> Download ZIP
            </a>
            <a
              href="/docs/guides/woocommerce"
              style={{
                fontSize: 12.5,
                color: "var(--dero)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              Setup guide <ArrowUpRight size={12} />
            </a>
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--bone-mute)",
              lineHeight: 1.5,
              marginTop: 2,
            }}
          >
            Self-hosting from source? Build the bundle yourself:
          </div>
          <CodeBlock code={WOOCOMMERCE_BUILD_CMD} caption="build" />
        </IntegrationCard>

        <IntegrationCard
          index={1}
          Icon={Puzzle}
          title="Medusa"
          badge="Available"
          description="Node-native payment provider for Medusa.js v2 backends. Registers DeroPay with invoice creation, status polling, and webhook-driven order completion."
        >
          <CodeBlock code={MEDUSA_INSTALL_CMD} caption="install" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
            <a
              href="/docs/guides/medusa-plugin"
              style={{
                fontSize: 12.5,
                color: "var(--dero)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              Setup guide <ArrowUpRight size={12} />
            </a>
          </div>
        </IntegrationCard>

        <IntegrationCard
          index={2}
          Icon={Store}
          title="Shopify"
          badge="Available"
          description="Download the Shopify app source: plugins/shopify/ in the repo — deploy to your infra and submit to the Shopify App Store. Backend is a Hono server; checkout UI ships as a Shopify Checkout UI extension."
        >
          <CodeBlock code={SHOPIFY_CLONE_CMD} caption="clone source" />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <a
              href="/docs/guides/shopify"
              style={{
                fontSize: 12.5,
                color: "var(--dero)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              Setup guide <ArrowUpRight size={12} />
            </a>
            <a
              href="https://partners.shopify.com/"
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 12.5,
                color: "var(--dero)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              Shopify Partners <ArrowUpRight size={12} />
            </a>
          </div>
        </IntegrationCard>

        <IntegrationCard
          index={3}
          Icon={Boxes}
          title="Magento 2"
          badge="Available"
          description="Composer-installable module for Magento 2.4.x (CE or EE). Registers DeroPay as a payment method with QR + integrated-address checkout UI and HMAC-verified webhook receiver."
        >
          <CodeBlock code={MAGENTO_COMPOSER_CMD} caption="install" />
          <CodeBlock code={MAGENTO_DEPLOY_CMD} caption="deploy" />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <a
              href="/docs/guides/magento"
              style={{
                fontSize: 12.5,
                color: "var(--dero)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              Setup guide <ArrowUpRight size={12} />
            </a>
          </div>
        </IntegrationCard>

        <IntegrationCard
          index={4}
          Icon={Globe}
          title="BigCommerce"
          badge="Available"
          description="Deploy the plugins/bigcommerce/ server, then register as a custom payment provider via the BigCommerce Partners dashboard. Single-Click Payment Provider (SPP) integration with gateway-driven authorization."
        >
          <CodeBlock code={BIGCOMMERCE_DEPLOY_CMD} caption="build & deploy" />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <a
              href="/docs/guides/bigcommerce"
              style={{
                fontSize: 12.5,
                color: "var(--dero)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              Setup guide <ArrowUpRight size={12} />
            </a>
            <a
              href="https://devtools.bigcommerce.com/"
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 12.5,
                color: "var(--dero)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              BigCommerce Partners <ArrowUpRight size={12} />
            </a>
          </div>
        </IntegrationCard>

        <IntegrationCard
          index={5}
          Icon={Terminal}
          title="Custom / REST"
          badge="Available"
          description="Don't see your stack? Integrate directly against the DeroPay REST gateway. Invoices, webhooks, and the full event log are all one POST away."
        >
          <CodeBlock code={CURL_SNIPPET} caption="POST /api/pay/create" />
          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              alignItems: "center",
              marginTop: 6,
            }}
          >
            <a
              href="/docs/dero-pay/nextjs"
              style={{
                fontSize: 12.5,
                color: "var(--dero)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              Next.js guide <ArrowUpRight size={12} />
            </a>
            <a
              href="/docs/dero-pay/api-reference"
              style={{
                fontSize: 12.5,
                color: "var(--dero)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              API reference <ArrowUpRight size={12} />
            </a>
          </div>
        </IntegrationCard>
      </div>

      <div
        style={{
          padding: "18px 22px",
          background: "var(--ink-elev)",
          border: "1px solid var(--ink-hair)",
          borderRadius: "var(--radius)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--bone)",
              marginBottom: 4,
            }}
          >
            Need a different platform?
          </div>
          <div style={{ fontSize: 12.5, color: "var(--bone-dim)", lineHeight: 1.5 }}>
            Prestashop, OpenCart, and a Zapier connector are on the radar. Ping{" "}
            <a
              href="mailto:integrations@deropay.com"
              style={{ color: "var(--dero)", textDecoration: "none" }}
            >
              integrations@deropay.com
            </a>{" "}
            if you need one prioritized — or build against the REST gateway today.
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
