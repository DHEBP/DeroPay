/**
 * /api/pay/invoices/[id] — per-invoice operations.
 *
 *   PATCH /api/pay/invoices/:id
 *     body: { status: InvoiceStatus }            — status transition
 *        OR { archived: boolean }                — toggle archive flag
 *     → 200 { id, status? , archived? }
 *     → 400 invalid body
 *     → 404 invoice not found
 *     → 409 disallowed transition  (message: "transition X→Y not allowed")
 *        OR disallowed archive     (only completed/expired may be archived)
 *     → 503 in test/demo mode or when the store is unavailable
 *
 * Defense-in-depth: even though the UI hides disallowed transitions, we
 * revalidate against `ALLOWED_TRANSITIONS` here so the endpoint is safe
 * against crafted requests. The only terminal exposed to merchants is
 * `expired` — this route intentionally will not let arbitrary status
 * writes (e.g. flipping to `completed`) through.
 *
 * Archive: writing `archivedAt` does NOT change status. Archiving is
 * gated to terminal states (completed / expired) so a pending invoice
 * can't be "swept under the rug" without resolving its lifecycle.
 *
 * On success we publish `invoice.expired` / `invoice.archived` on the
 * event bus so timeline / notification fanout mirrors the engine's own
 * expiry path.
 */

import { NextResponse } from "next/server";
import type { InvoiceStatus } from "dero-pay";
import { ensureStoreReady, getEngine } from "@/lib/engine";
import { isTestMode } from "@/lib/test-mode-server";
import {
  ALLOWED_TRANSITIONS,
  isTransitionAllowed,
} from "@/lib/invoice-transitions";

type MinimalInvoice = {
  id: string;
  status: InvoiceStatus;
  expiresAt: string;
  archivedAt?: number | null;
};

type MinimalStore = {
  updateInvoice(
    id: string,
    updates: { status?: InvoiceStatus; archivedAt?: number | null },
  ): Promise<void>;
};

type MinimalEngine = {
  getInvoice(id: string): Promise<MinimalInvoice | null>;
  getStore(): MinimalStore;
};

/** Terminal statuses eligible for archive. See top-of-file comment. */
const ARCHIVABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  "completed",
  "expired",
]);

const VALID_STATUSES: ReadonlySet<InvoiceStatus> = new Set(
  Object.keys(ALLOWED_TRANSITIONS) as InvoiceStatus[],
);

function isInvoiceStatus(v: unknown): v is InvoiceStatus {
  return typeof v === "string" && VALID_STATUSES.has(v as InvoiceStatus);
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { error: "invalid_id", message: "Missing invoice id" },
      { status: 400 },
    );
  }

  if (await isTestMode()) {
    return NextResponse.json(
      {
        error: "demo_mode",
        message: "Status editing is disabled in test mode.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { status: nextStatus, archived: archivedRaw } = (body ?? {}) as {
    status?: unknown;
    archived?: unknown;
  };

  const hasStatus = nextStatus !== undefined;
  const hasArchive = archivedRaw !== undefined;

  if (!hasStatus && !hasArchive) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: "Provide either 'status' or 'archived' in the body.",
      },
      { status: 400 },
    );
  }

  if (hasStatus && hasArchive) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: "Pass 'status' or 'archived' — not both in one request.",
      },
      { status: 400 },
    );
  }

  if (hasStatus && !isInvoiceStatus(nextStatus)) {
    return NextResponse.json(
      {
        error: "invalid_status",
        message: `status must be one of: ${Array.from(VALID_STATUSES).join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (hasArchive && typeof archivedRaw !== "boolean") {
    return NextResponse.json(
      {
        error: "invalid_archived",
        message: "archived must be a boolean",
      },
      { status: 400 },
    );
  }

  await ensureStoreReady();

  const engine = (await getEngine()) as MinimalEngine | null | undefined;
  const store = engine?.getStore?.();
  if (!engine || !store) {
    return NextResponse.json(
      { error: "store_unavailable", message: "Store not initialized" },
      { status: 503 },
    );
  }

  const invoice = await engine.getInvoice(id);
  if (!invoice) {
    return NextResponse.json(
      { error: "not_found", message: `Invoice ${id} not found` },
      { status: 404 },
    );
  }

  const current = invoice.status;

  // -------------------------------------------------------------------------
  // Archive branch — gated to terminal statuses, writes `archivedAt`.
  // -------------------------------------------------------------------------
  if (hasArchive) {
    const archived = archivedRaw as boolean;

    if (archived && !ARCHIVABLE_STATUSES.has(current)) {
      return NextResponse.json(
        {
          error: "archive_not_allowed",
          message: `Only completed or expired invoices can be archived (status=${current}).`,
        },
        { status: 409 },
      );
    }

    const alreadyArchived = (invoice.archivedAt ?? null) !== null;
    if (archived === alreadyArchived) {
      // Idempotent no-op — matches the status branch behavior.
      return NextResponse.json({ id, archived: alreadyArchived });
    }

    const nextArchivedAt: number | null = archived ? Date.now() : null;
    try {
      await store.updateInvoice(id, { archivedAt: nextArchivedAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: "update_failed", message: msg },
        { status: 500 },
      );
    }

    try {
      const { publish } = await import("dero-pay/events");
      publish(archived ? "invoice.archived" : "invoice.unarchived", {
        entityType: "invoice",
        entityId: id,
        payload: {
          invoiceId: id,
          archived,
          archivedAt: nextArchivedAt,
          status: current,
          source: "manual",
        },
      });
    } catch {
      // Event-bus failures must not fail the write.
    }

    return NextResponse.json({ id, archived });
  }

  // -------------------------------------------------------------------------
  // Status-transition branch — the original flow.
  // -------------------------------------------------------------------------
  // Type-narrow: at this point hasStatus is true and the body validated
  // above, so nextStatus is a valid InvoiceStatus.
  const target = nextStatus as InvoiceStatus;

  // Idempotent no-op if the invoice is already in the target state —
  // callers can race with the engine's auto-expiry path and we don't want
  // to surface a 409 for "already expired".
  if (current === target) {
    return NextResponse.json({ id, status: current });
  }

  if (!isTransitionAllowed(current, target)) {
    return NextResponse.json(
      {
        error: "transition_not_allowed",
        message: `transition ${current}→${target} not allowed`,
      },
      { status: 409 },
    );
  }

  try {
    await store.updateInvoice(id, { status: target });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "update_failed", message: msg },
      { status: 500 },
    );
  }

  // Publish to the event bus so the dashboard timeline + notification
  // bell pick up the manual transition. The bus has a UNIQUE dedupe index
  // keyed on (entity_id, type, floor(ts/1000)) — if the engine's own
  // expiry timer fires in the same second, one of the two inserts is
  // absorbed at the DB layer.
  //
  // Today the only allowed target is `expired`, so this is the only event
  // we need to emit. If the allowed-transitions table grows later, extend
  // the mapping below (e.g. emit `invoice.cancelled` if we add a formal
  // cancel state).
  if (target === "expired") {
    try {
      const { publish } = await import("dero-pay/events");
      publish("invoice.expired", {
        entityType: "invoice",
        entityId: id,
        payload: {
          invoiceId: id,
          status: "expired",
          previousStatus: current,
          expiresAt: invoice.expiresAt,
          source: "manual",
        },
      });
    } catch {
      // Event bus failures must not fail the status update — the DB row
      // is already flipped and the merchant sees success in the UI.
    }
  }

  return NextResponse.json({ id, status: target });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    },
  });
}
