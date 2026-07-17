"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FlaskConical, ShoppingBag, ShieldCheck, Sparkles } from "lucide-react";
import { formatDero } from "dero-pay";
import { EscrowInvoiceView, InvoiceView, useDeroPayContext } from "dero-pay/react";
import { useCart } from "@/components/cart-context";
import { StoreShell } from "@/components/store-shell";
import { useToast } from "@/components/toast";
import {
  clearActiveCheckoutSession,
  consumePendingCheckoutDraft,
  createCartCheckoutDraft,
  getCheckoutItemCount,
  type ActiveCheckoutSession,
  type CheckoutDraft,
  readActiveCheckoutSession,
  writeActiveCheckoutSession,
  writePendingCheckoutDraft,
} from "@/lib/checkout-session";

type CheckoutDisplayItem = {
  id: string;
  name: string;
  price: bigint;
  quantity: number;
  image?: string;
  category?: string;
  badge?: string;
};

function toDisplayItems(order: CheckoutDraft | null): CheckoutDisplayItem[] {
  if (!order) {
    return [];
  }

  return order.items.map((item) => ({
    id: item.id,
    name: item.name,
    price: BigInt(item.priceAtomic),
    quantity: item.quantity,
    image: item.image,
    category: item.category,
    badge: item.badge,
  }));
}

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<ActiveCheckoutSession | null>(null);
  const [pendingDraft, setPendingDraft] = useState<CheckoutDraft | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [useEscrow, setUseEscrow] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const router = useRouter();
  const {
    currentInvoice,
    walletConnectorType,
    walletCapabilities,
    walletStatus,
    error: walletError,
  } = useDeroPayContext();
  const { success, error, info } = useToast();
  const experimentalWasmEnabled =
    process.env.NEXT_PUBLIC_DEROPAY_EXPERIMENTAL_WASM === "true";
  const requestedWasm =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("wallet") === "wasm";
  const usingExperimentalWasm = walletConnectorType === "wasm-webwallet";
  const canWalletTransfer = walletCapabilities.includes("transfer");
  const wasmDiagnostics = useMemo(() => {
    if (!experimentalWasmEnabled) {
      return {
        mode: "disabled" as const,
        message: "WASM connector is disabled by environment policy.",
      };
    }

    if (!requestedWasm) {
      return {
        mode: "idle" as const,
        message: "WASM mode is available. Add ?wallet=wasm to test it.",
      };
    }

    try {
      const probe = probeDemoWasmBridge();
      if (!probe) {
        return {
          mode: "missing" as const,
          message: "No WASM bridge symbols were found in this browser context.",
        };
      }
      return {
        mode: "ok" as const,
        source: probe.source,
        methods: probe.availableMethods,
        message: "WASM bridge detected and ABI probe passed.",
      };
    } catch (probeError) {
      const walletConnectorError = probeError as { code?: string; message?: string };
      return {
        mode: "error" as const,
        code: walletConnectorError.code ?? "TRANSPORT_FAILURE",
        message: walletConnectorError.message ?? "WASM probe failed.",
      };
    }
  }, [experimentalWasmEnabled, requestedWasm]);

  useEffect(() => {
    if (requestedWasm || wasmDiagnostics.mode === "error") {
      setShowDiagnostics(true);
    }
  }, [requestedWasm, wasmDiagnostics.mode]);

  // ?escrow=claim → force escrow ON in "quoted" mode so the buyer flow renders
  // the Gate-2 EscrowClaimStep (claim → deploying → awaiting_deposit → deposit).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const flag = new URLSearchParams(window.location.search).get("escrow");
    if (flag === "claim") {
      setUseEscrow(true);
    }
  }, []);

  const cartDraft = useMemo(
    () => (items.length > 0 ? createCartCheckoutDraft(items) : null),
    [items]
  );

  const stagedOrder = pendingDraft ?? cartDraft;
  const stagedItems = useMemo(() => toDisplayItems(stagedOrder), [stagedOrder]);
  const liveSessionOrder = checkoutSession?.order ?? null;
  const sessionItems = useMemo(() => toDisplayItems(liveSessionOrder), [liveSessionOrder]);
  const activeInvoice =
    currentInvoice && currentInvoice.id === invoiceId ? currentInvoice : null;
  // Live-invoice headline: a "quoted" escrow is awaiting the buyer's CLAIM, not a
  // wallet payment, so don't mislabel it "Awaiting wallet payment".
  const liveHeadline = !useEscrow
    ? "Awaiting wallet payment"
    : activeInvoice?.escrow?.escrowStatus === "quoted"
      ? "Claim your escrow"
      : activeInvoice?.escrow?.escrowStatus === "awaiting_deposit"
        ? "Deposit into escrow"
        : "Escrow checkout";
  const stagedTotal = stagedOrder ? BigInt(stagedOrder.totalAtomic) : 0n;
  const sessionAmount = activeInvoice
    ? activeInvoice.amount
    : liveSessionOrder
      ? BigInt(liveSessionOrder.totalAtomic)
      : 0n;

  useEffect(() => {
    const incomingDraft = consumePendingCheckoutDraft();
    if (incomingDraft) {
      clearActiveCheckoutSession();
      setPendingDraft(incomingDraft);
      setCheckoutSession(null);
      setInvoiceId(null);
      setUseEscrow(false);
      setIsSessionReady(true);
      return;
    }

    if (items.length === 0) {
      const storedSession = readActiveCheckoutSession();
      if (storedSession) {
        setCheckoutSession(storedSession);
        setInvoiceId(storedSession.invoiceId);
        setUseEscrow(storedSession.useEscrow);
      }
    }

    setIsSessionReady(true);
  }, [items.length]);

  if (!isSessionReady) {
    return (
      <StoreShell>
        <section className="px-6 pb-18 pt-12 md:px-10 md:pb-24 md:pt-16">
          <div className="glass-panel-strong mx-auto max-w-3xl rounded-[2rem] p-8 text-center md:p-12">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-[var(--text-muted)]" />
            <p className="section-kicker mt-6">Checkout</p>
            <h1 className="mt-3 font-display text-3xl font-semibold text-white md:text-5xl">
              Restoring your session.
            </h1>
          </div>
        </section>
      </StoreShell>
    );
  }

  if (!stagedOrder && !invoiceId) {
    return (
      <StoreShell>
        <section className="px-6 pb-18 pt-12 md:px-10 md:pb-24 md:pt-16">
          <div className="glass-panel-strong mx-auto max-w-3xl rounded-[2rem] p-8 text-center md:p-12">
            <ShoppingBag className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
            <p className="section-kicker mt-6">Checkout</p>
            <h1 className="mt-3 font-display text-3xl font-semibold text-white md:text-5xl">
              Your cart is empty.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[var(--text-secondary)]">
              Add something from the collection first, then come back to generate an invoice and test the payment flow.
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-8 inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#071008] transition-colors hover:bg-[var(--accent-strong)]"
            >
              Go back to store
            </button>
          </div>
        </section>
      </StoreShell>
    );
  }

  const handleCreateInvoice = async () => {
    if (!stagedOrder) {
      error("Nothing to invoice", "Add something to checkout first.");
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/pay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: stagedOrder.items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
          })),
          ...(useEscrow
            ? {
                escrow: {
                  sellerAddress:
                    "dero1qyr8yjnu6cl2c5yqkls0hmxe6rry77kn24nmc5fje6hm9jltyvdd5qq4hn5pn",
                  arbitratorAddress:
                    "dero1qy2nxgts7wdn28ckc4l2tewphjcppqjfj69ddkxjn0ay8hlsjx73jqgpyhv40",
                  feeBasisPoints: 250,
                  blockExpiration: 1000,
                  // Two-phase model: every escrow invoice starts "quoted" — the
                  // buyer must CLAIM (bind their address + deploy) before deposit.
                  // So escrow mode always lands on EscrowClaimStep, no URL flag
                  // needed (the ?escrow=claim flag just auto-enables escrow).
                  stage: "quoted",
                },
              }
            : {}),
        }),
      });

      const data = await response.json();
      if (data.id) {
        const nextSession: ActiveCheckoutSession = {
          invoiceId: data.id,
          useEscrow,
          order: stagedOrder,
        };

        setInvoiceId(data.id);
        setCheckoutSession(nextSession);
        setPendingDraft(null);
        writePendingCheckoutDraft(null);
        writeActiveCheckoutSession(nextSession);
        clearCart();
        info("Invoice created", "Awaiting your DERO payment.");
      } else {
        error("Invoice failed", data.error || "Could not create invoice.");
      }
    } catch (err) {
      error("Network error", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsCreating(false);
    }
  };

  const simulatePayment = async () => {
    if (!invoiceId) {
      info("Not ready", "Invoice is still loading — try again in a moment.");
      return;
    }

    setIsSimulating(true);

    try {
      const res = await fetch("/api/pay/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });

      if (res.ok) {
        success("Payment simulated!", "The invoice will update within a few seconds.");
      } else {
        error("Simulation failed", `Server responded: ${res.status}`);
      }
    } catch (err) {
      error("Simulation error", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSimulating(false);
    }
  };

  const resetCheckoutSession = () => {
    clearActiveCheckoutSession();
    writePendingCheckoutDraft(null);
    setCheckoutSession(null);
    setPendingDraft(null);
    setInvoiceId(null);
    setUseEscrow(false);
    router.push("/");
  };

  return (
    <StoreShell>
      <section className="px-6 pb-20 pt-12 md:px-10 md:pb-28 md:pt-16">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-8 max-w-3xl space-y-3">
            <p className="section-kicker">Checkout</p>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.05em] text-white md:text-6xl text-balance">
              Generate the invoice and close the loop.
            </h1>
            <p className="text-sm leading-7 text-[var(--text-secondary)] md:text-base">
              This stays a demo flow: same invoice endpoint, same status polling, same simulate-payment control. The difference is the frame around it.
            </p>
          </div>

          {!invoiceId ? (
            <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="glass-panel soft-outline rounded-[2rem] p-6 md:p-7">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="section-kicker mb-2">Order summary</p>
                    <h2 className="font-display text-3xl font-semibold text-white">
                      Selected pieces
                    </h2>
                  </div>
                  <div className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    {stagedItems.length} line item{stagedItems.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="space-y-4">
                  {stagedItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-4 rounded-[1.5rem] border border-white/[0.08] bg-black/[0.18] p-4 md:grid-cols-[96px_1fr_auto] md:items-center"
                    >
                      <div className="relative overflow-hidden rounded-[1.1rem] border border-white/[0.08] bg-black/25">
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt={item.name}
                            width={400}
                            height={400}
                            className="aspect-square w-full object-cover"
                          />
                        ) : (
                          <div className="aspect-square bg-white/[0.04]" />
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.category ? (
                            <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                              {item.category}
                            </span>
                          ) : null}
                          {item.badge ? (
                            <span className="rounded-full bg-[var(--accent-dim)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                              {item.badge}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="font-display text-2xl font-semibold text-white">
                          {item.name}
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)]">
                          Qty {item.quantity}
                        </p>
                      </div>

                      <div className="text-left md:text-right">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          Line total
                        </p>
                        <p className="font-display text-2xl font-semibold text-white">
                          {formatDero(item.price * BigInt(item.quantity))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-[1.6rem] border border-white/[0.08] bg-black/[0.24] p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Total due
                    </span>
                    <span className="font-display text-3xl font-semibold tabular-nums text-white">
                      {formatDero(stagedTotal)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="glass-panel-strong soft-outline rounded-[2rem] p-6 md:p-7">
                  <p className="section-kicker mb-4">Payment method</p>
                  <h2 className="font-display text-3xl font-semibold text-white">
                    DERO invoice checkout
                  </h2>

                  <div className="mt-6 rounded-[1.5rem] border border-[var(--border-strong)] bg-[var(--accent-dim)] p-5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-black/[0.18] text-[var(--accent-strong)]">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-semibold text-white">
                          Private, direct, and wallet-native
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                          Create a DeroPay invoice, pay with your DERO wallet, and optionally route the order through the escrow demo.
                        </p>
                      </div>
                    </div>
                  </div>

                  {experimentalWasmEnabled ? (
                    <div className="mt-5 rounded-[1.3rem] border border-white/[0.08] bg-black/[0.22] p-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Advanced connector mode
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                        Add <code className="font-mono">?wallet=wasm</code> to this URL to
                        force the experimental WASM connector path. XSWD remains the default.
                      </p>
                    </div>
                  ) : null}

                  <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-[1.3rem] border border-white/[0.08] bg-white/[0.04] p-4">
                    <input
                      type="checkbox"
                      checked={useEscrow}
                      onChange={(event) => setUseEscrow(event.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-transparent text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Use DeroPay Escrow Smart Contract
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                        Keeps the same demo behavior, but generates the invoice in escrow mode for the buyer flow.
                      </p>
                    </div>
                  </label>

                  <button
                    onClick={handleCreateInvoice}
                    disabled={isCreating}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#071008] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating invoice…
                      </>
                    ) : (
                      "Generate invoice"
                    )}
                  </button>
                </div>

                <div className="glass-panel rounded-[2rem] p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06] text-[var(--warm)]">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-semibold text-white">
                        Simulation-friendly flow
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        Once the invoice is created, you can use the built-in simulate control to push it through the demo status pipeline.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-8 xl:grid-cols-[0.72fr_0.28fr]">
              <div className="glass-panel-strong soft-outline rounded-[2rem] p-5 md:p-7">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="section-kicker mb-2">Live invoice</p>
                    <h2 className="font-display text-3xl font-semibold text-white">
                      {liveHeadline}
                    </h2>
                  </div>
                  {activeInvoice ? (
                    <span
                      aria-live="polite"
                      className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]"
                    >
                      {activeInvoice.status}
                    </span>
                  ) : null}
                </div>

                {useEscrow ? (
                  <EscrowInvoiceView
                    invoiceId={invoiceId}
                    role="buyer"
                    claimEndpoint="/api/pay/escrow/claim"
                  />
                ) : (
                  <InvoiceView invoiceId={invoiceId} />
                )}

                {activeInvoice && activeInvoice.status !== "completed" ? (
                  <div className="mt-6 rounded-[1.6rem] border border-white/[0.08] bg-black/[0.22] p-5 text-center">
                    <p className="mb-3 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      <FlaskConical className="h-4 w-4" />
                      Testing the demo?
                    </p>
                    <button
                      onClick={simulatePayment}
                      disabled={isSimulating}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--accent-dim)] px-5 py-3 text-sm font-semibold text-white hover:bg-[rgba(49,223,144,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSimulating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        "Simulate payment"
                      )}
                    </button>
                  </div>
                ) : null}
              </div>

              <aside className="glass-panel h-fit rounded-[2rem] p-6 xl:sticky xl:top-28">
                <p className="section-kicker mb-4">Session details</p>
                <div className="space-y-4 text-sm text-[var(--text-secondary)]">
                  <div className="rounded-[1.3rem] border border-white/[0.08] bg-black/[0.22] p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Invoice id
                    </p>
                    <p className="mt-2 break-all font-mono text-xs text-white">
                      {invoiceId}
                    </p>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/[0.08] bg-black/[0.22] p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Mode
                    </p>
                    <p className="mt-2 text-white">
                      {useEscrow ? "Escrow demo" : "Standard invoice"}
                    </p>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/[0.08] bg-black/[0.22] p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Wallet connector
                    </p>
                    <p className="mt-2 text-white">
                      {walletConnectorType ?? "Not connected"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {walletStatus === "connected"
                        ? canWalletTransfer
                          ? "Connector can submit invoice transfers."
                          : "Read/sign connector only. Invoice transfer is disabled."
                        : "Connect wallet to inspect runtime capabilities."}
                    </p>
                  </div>
                  {usingExperimentalWasm ? (
                    <div className="rounded-[1.3rem] border border-[var(--border-strong)] bg-[var(--accent-dim)] p-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Experimental warning
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                        WASM webwallet is an advanced connector path in DeroPay and not the
                        default production recommendation.
                      </p>
                    </div>
                  ) : null}
                  <div className="rounded-[1.3rem] border border-white/[0.08] bg-black/[0.22] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        WASM diagnostics
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowDiagnostics((current) => !current)}
                        className="rounded-full border border-white/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white hover:border-[var(--border-strong)] hover:bg-[var(--accent-dim)]"
                      >
                        {showDiagnostics ? "Hide" : "Show"}
                      </button>
                    </div>
                    {showDiagnostics ? (
                      <div className="mt-2 space-y-2 text-xs text-[var(--text-secondary)]">
                        <p>
                          Env enabled:{" "}
                          <span className="text-white">
                            {experimentalWasmEnabled ? "yes" : "no"}
                          </span>
                        </p>
                        <p>
                          URL requests WASM:{" "}
                          <span className="text-white">{requestedWasm ? "yes" : "no"}</span>
                        </p>
                        <p>
                          Probe status:{" "}
                          <span className="text-white">{wasmDiagnostics.mode}</span>
                        </p>
                        {"source" in wasmDiagnostics && wasmDiagnostics.source ? (
                          <p>
                            Bridge source:{" "}
                            <span className="text-white">{wasmDiagnostics.source}</span>
                          </p>
                        ) : null}
                        {"methods" in wasmDiagnostics && wasmDiagnostics.methods ? (
                          <p>
                            Methods:{" "}
                            <span className="text-white">
                              {wasmDiagnostics.methods.join(", ")}
                            </span>
                          </p>
                        ) : null}
                        {"code" in wasmDiagnostics && wasmDiagnostics.code ? (
                          <p>
                            Error code: <span className="text-white">{wasmDiagnostics.code}</span>
                          </p>
                        ) : null}
                        <p>{wasmDiagnostics.message}</p>
                        {walletError ? (
                          <p>
                            Last wallet error: <span className="text-white">{walletError}</span>
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">
                        Hidden by default. Expand when testing WASM connector wiring.
                      </p>
                    )}
                  </div>
                  <div className="rounded-[1.3rem] border border-white/[0.08] bg-black/[0.22] p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Amount
                    </p>
                    <p className="mt-2 font-display text-2xl font-semibold text-white">
                      {formatDero(sessionAmount)}
                    </p>
                  </div>
                  {liveSessionOrder ? (
                    <div className="rounded-[1.3rem] border border-white/[0.08] bg-black/[0.22] p-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Order snapshot
                      </p>
                      <p className="mt-2 text-white">
                        {getCheckoutItemCount(liveSessionOrder.items)} item
                        {getCheckoutItemCount(liveSessionOrder.items) === 1 ? "" : "s"} across{" "}
                        {sessionItems.length} line item{sessionItems.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={resetCheckoutSession}
                  className="mt-6 w-full rounded-full border border-white/[0.08] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white hover:border-[var(--border-strong)] hover:bg-[var(--accent-dim)]"
                >
                  Start a new checkout
                </button>
              </aside>
            </div>
          )}
        </div>
      </section>
    </StoreShell>
  );
}

type DemoWasmProbe = {
  source: "DERO_JS_WEBWALLET" | "DERO_JS_WALLET" | "DERO_JS" | "DERO_JS_GLOBALS";
  availableMethods: string[];
};

function probeDemoWasmBridge(): DemoWasmProbe | null {
  const maybeWindow = window as typeof window & Record<string, unknown>;

  const objectCandidates: Array<{
    source: DemoWasmProbe["source"];
    value: unknown;
  }> = [
    { source: "DERO_JS_WEBWALLET", value: maybeWindow.DERO_JS_WEBWALLET },
    { source: "DERO_JS_WALLET", value: maybeWindow.DERO_JS_WALLET },
    { source: "DERO_JS", value: maybeWindow.DERO_JS },
  ];

  for (const candidate of objectCandidates) {
    if (candidate.value === undefined) continue;
    if (!candidate.value || typeof candidate.value !== "object") {
      throw {
        code: "TRANSPORT_FAILURE",
        message: `${candidate.source} exists but is not an object bridge`,
      };
    }

    const obj = candidate.value as Record<string, unknown>;
    const getAddress = obj.getAddress ?? obj.GetAddress;
    if (getAddress === undefined) {
      throw {
        code: "TRANSPORT_FAILURE",
        message: `${candidate.source} is missing getAddress/GetAddress`,
      };
    }
    if (typeof getAddress !== "function") {
      throw {
        code: "TRANSPORT_FAILURE",
        message: `${candidate.source}.getAddress exists but is not callable`,
      };
    }

    const methods = ["getAddress", "getBalance", "makeIntegratedAddress", "splitIntegratedAddress"]
      .filter((method) => typeof obj[method] === "function" || typeof obj[toPascal(method)] === "function");

    return {
      source: candidate.source,
      availableMethods: methods,
    };
  }

  const globalAddress = maybeWindow.DERO_JS_GetAddress;
  if (globalAddress !== undefined) {
    if (typeof globalAddress !== "function") {
      throw {
        code: "TRANSPORT_FAILURE",
        message: "DERO_JS_GetAddress exists but is not callable",
      };
    }

    const methodSymbols = [
      "DERO_JS_GetAddress",
      "DERO_JS_GetBalance",
      "DERO_JS_MakeIntegratedAddress",
      "DERO_JS_SplitIntegratedAddress",
      "DERO_JS_SignData",
      "DERO_JS_CheckSignature",
    ];

    return {
      source: "DERO_JS_GLOBALS",
      availableMethods: methodSymbols.filter(
        (symbol) => typeof maybeWindow[symbol] === "function"
      ),
    };
  }

  return null;
}

function toPascal(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
