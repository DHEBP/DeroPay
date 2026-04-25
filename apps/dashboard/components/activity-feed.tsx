"use client";

/**
 * ActivityFeed — compatibility shim.
 *
 * The real implementation now lives in `./timeline.tsx` and is driven by the
 * unified event bus (dero-pay/events). This shim preserves the legacy call
 * signature — `<ActivityFeed invoices={...} />` — so `dashboard-home` keeps
 * working until peer B2 migrates it to `<Timeline events={...} />` sourced
 * from `/api/pay/events` directly.
 *
 * Delete this file once all callers have moved to Timeline.
 */

import { Timeline } from "./timeline";
import type { TimelineEvent } from "dero-pay/events";

type Invoice = {
  id: string;
  name: string;
  status: string;
  amount: string;
  amountReceived: string;
  createdAt: string;
};

export function ActivityFeed({
  invoices,
  limit = 6,
}: {
  invoices: Invoice[];
  limit?: number;
}) {
  const events: TimelineEvent[] = invoices.slice(0, limit).map((inv) => ({
    id: inv.id,
    ts: new Date(inv.createdAt).getTime(),
    tone:
      inv.status === "completed"
        ? "success"
        : inv.status === "expired"
          ? "warn"
          : "info",
    title: inv.name || "(unnamed)",
    subtitle: `${inv.amount} DERO`,
    entityType: "invoice",
    entityId: inv.id,
  }));
  return <Timeline events={events} limit={limit} />;
}
