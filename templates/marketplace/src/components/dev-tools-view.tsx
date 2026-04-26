"use client";

import Link from "next/link";
import { Clock3, Radio, ShieldCheck, Truck, WalletCards } from "lucide-react";
import { useState } from "react";
import { useMarketplace } from "@/context/marketplace-context";
import { formatDero, shortId } from "@/lib/format";
import { OrderStatusPill, PaymentStatusPill } from "./status-pill";

export function DevToolsView() {
  const {
    orders,
    paymentIntents,
    webhookEvents,
    simulatePaymentDetected,
    simulatePaymentConfirming,
    simulatePaymentCompleted,
    simulatePartialPayment,
    simulateInvoiceExpired,
    pollInvoiceStatus,
    resolveDispute,
    sellerAdvanceOrder,
    serverError,
  } = useMarketplace();
  const [busyAction, setBusyAction] = useState("");

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyAction(key);
    try {
      await action();
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="grid gap-5 pt-5">
      <section className="panel grid gap-3 p-4">
        <h1 className="text-3xl font-black">Dev tools</h1>
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          Prototype controls for webhooks, invoice polling, fulfillment simulation, and raw event inspection.
        </p>
        {serverError ? (
          <div className="rounded-lg border border-[rgba(161,98,7,0.28)] bg-[#fff7ed] p-3 text-sm text-[var(--amber)]">
            {serverError}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4">
        {orders.map((order) => {
          const invoice = paymentIntents.find((entry) => entry.id === order.paymentIntentId);
          const events = invoice
            ? webhookEvents.filter((entry) => entry.invoiceId === invoice.invoiceId)
            : [];
          const disableActions = Boolean(busyAction);
          return (
            <article
              key={order.id}
              className="panel grid gap-4 p-4 lg:grid-cols-[1fr_360px]"
              data-order-id={order.id}
            >
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/orders/${order.id}`} className="text-xl font-black hover:text-[var(--dero-strong)]">
                    {shortId(order.id)}
                  </Link>
                  <OrderStatusPill status={order.status} />
                  {invoice ? <PaymentStatusPill status={invoice.status} /> : null}
                </div>
                <div className="text-sm text-[var(--muted)]">
                  {formatDero(order.totalAtomic)} - {order.paymentRail.replaceAll("_", " ")}
                </div>
                {invoice ? (
                  <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-xs text-[var(--muted)]">
                    <p className="break-all">Invoice: {invoice.invoiceId}</p>
                    <p className="break-all">Payment ID: {invoice.paymentId}</p>
                    <p>Status: {invoice.status} / escrow {invoice.escrowState}</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {events.slice(0, 6).map((event) => (
                    <span key={event.id} className="badge">
                      <Radio size={12} />
                      {event.type}
                    </span>
                  ))}
                </div>
              </div>

              <aside className="grid content-start gap-2">
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={disableActions}
                  onClick={() =>
                    runAction(`${order.id}:detected`, () => simulatePaymentDetected(order.id))
                  }
                >
                  <WalletCards size={17} />
                  {busyAction === `${order.id}:detected` ? "Detecting..." : "Detect payment"}
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={disableActions}
                  onClick={() =>
                    runAction(`${order.id}:confirming`, () => simulatePaymentConfirming(order.id))
                  }
                >
                  <Radio size={17} />
                  {busyAction === `${order.id}:confirming` ? "Confirming..." : "Confirm payment"}
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={disableActions}
                  onClick={() =>
                    runAction(`${order.id}:completed`, () => simulatePaymentCompleted(order.id))
                  }
                >
                  <ShieldCheck size={17} />
                  {busyAction === `${order.id}:completed` ? "Completing..." : "Complete invoice"}
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={disableActions}
                  onClick={() =>
                    runAction(`${order.id}:partial`, () => simulatePartialPayment(order.id))
                  }
                >
                  <WalletCards size={17} />
                  {busyAction === `${order.id}:partial` ? "Recording..." : "Partial payment"}
                </button>
                <button
                  className="btn-secondary text-[var(--amber)]"
                  type="button"
                  disabled={disableActions}
                  onClick={() =>
                    runAction(`${order.id}:expired`, () => simulateInvoiceExpired(order.id))
                  }
                >
                  <Clock3 size={17} />
                  {busyAction === `${order.id}:expired` ? "Expiring..." : "Expire invoice"}
                </button>
                {invoice ? (
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={disableActions}
                    onClick={() =>
                      runAction(`${order.id}:poll`, () => pollInvoiceStatus(invoice.invoiceId))
                    }
                  >
                    <Radio size={17} />
                    {busyAction === `${order.id}:poll` ? "Polling..." : "Poll invoice"}
                  </button>
                ) : null}
                {["funded", "processing", "shipped"].includes(order.status) ? (
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={disableActions}
                    onClick={() =>
                      runAction(`${order.id}:advance`, () => sellerAdvanceOrder(order.id))
                    }
                  >
                    <Truck size={17} />
                    {busyAction === `${order.id}:advance` ? "Advancing..." : "Advance fulfillment"}
                  </button>
                ) : null}
                {order.status === "disputed" ? (
                  <>
                    <button
                      className="btn-secondary text-[var(--amber)]"
                      type="button"
                      disabled={disableActions}
                      onClick={() =>
                        runAction(`${order.id}:refund`, () => resolveDispute(order.id, "refund"))
                      }
                    >
                      <ShieldCheck size={17} />
                      Resolve refund
                    </button>
                    <button
                      className="btn-secondary"
                      type="button"
                      disabled={disableActions}
                      onClick={() =>
                        runAction(`${order.id}:release`, () => resolveDispute(order.id, "release"))
                      }
                    >
                      <ShieldCheck size={17} />
                      Resolve release
                    </button>
                  </>
                ) : null}
              </aside>
            </article>
          );
        })}
        {orders.length === 0 ? (
          <div className="panel-flat p-4 text-sm text-[var(--muted)]">No server orders yet.</div>
        ) : null}
      </section>
    </div>
  );
}
