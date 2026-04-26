import type { MarketplaceSnapshot, Order } from "./types";

export type MarketplaceMetric = {
  label: string;
  value: string;
  target: string;
  status: "pass" | "watch";
};

function rate(numerator: number, denominator: number): number {
  if (denominator === 0) return 100;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function releaseMinutes(order: Order): number | null {
  if (!["released", "refunded"].includes(order.status)) return null;
  return minutesBetween(order.createdAt, order.updatedAt);
}

export function computeMarketplaceMetrics(snapshot: MarketplaceSnapshot): MarketplaceMetric[] {
  const invoices = snapshot.paymentIntents;
  const completedInvoices = invoices.filter((invoice) => invoice.status === "completed").length;
  const exceptionInvoices = invoices.filter((invoice) =>
    ["partial", "expired"].includes(invoice.status)
  ).length;
  const disputeCount = snapshot.disputes.length;
  const releaseTimes = snapshot.orders
    .map(releaseMinutes)
    .filter((value): value is number => value !== null);
  const medianRelease = median(releaseTimes);
  const sellerResponseCount = snapshot.disputes.filter((dispute) =>
    ["seller_responded", "resolved_refund", "resolved_release"].includes(dispute.status)
  ).length;

  return [
    {
      label: "Invoice completion",
      value: `${rate(completedInvoices, invoices.length)}%`,
      target: "Target >= 95%",
      status: rate(completedInvoices, invoices.length) >= 95 ? "pass" : "watch",
    },
    {
      label: "Partial or expired",
      value: `${rate(exceptionInvoices, invoices.length)}%`,
      target: "Target <= 5%",
      status: rate(exceptionInvoices, invoices.length) <= 5 ? "pass" : "watch",
    },
    {
      label: "Dispute rate",
      value: `${rate(disputeCount, snapshot.orders.length)}%`,
      target: "Target <= 3%",
      status: rate(disputeCount, snapshot.orders.length) <= 3 ? "pass" : "watch",
    },
    {
      label: "Seller response",
      value: `${rate(sellerResponseCount, disputeCount)}%`,
      target: "Target >= 95%",
      status: rate(sellerResponseCount, disputeCount) >= 95 ? "pass" : "watch",
    },
    {
      label: "Median release time",
      value: medianRelease === null ? "No releases yet" : `${medianRelease} min`,
      target: "Track p50 and p95",
      status: "pass",
    },
  ];
}
