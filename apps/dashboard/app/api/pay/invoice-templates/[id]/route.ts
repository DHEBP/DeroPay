/**
 * /api/pay/invoice-templates/[id] — detail route.
 *
 *   GET    → 200 { template }    → 404 if unknown
 *   PATCH  → 200 { template }    (body: partial InvoiceTemplateInput)
 *   DELETE → 204                 → 409 if in use by any invoice or link
 */

import { NextResponse } from "next/server";
import { isTestMode } from "@/lib/test-mode-server";
import {
  deleteMockInvoiceTemplate,
  getMockInvoiceTemplate,
  updateMockInvoiceTemplate,
} from "@/lib/mock-invoice-templates";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  if (await isTestMode()) {
    const template = getMockInvoiceTemplate(id);
    if (!template) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ template });
  }

  return NextResponse.json(
    { error: "not_implemented", message: "Live mode not yet supported" },
    { status: 503 }
  );
}

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: {
    name?: string;
    description?: string | null;
    amount?: string | null;
    expirySeconds?: number | null;
    metadataDefaults?: Record<string, unknown>;
    requiredFields?: string[];
  } = {};

  if (typeof body.name === "string") patch.name = body.name.trim();

  if ("description" in body) {
    patch.description =
      body.description === null
        ? null
        : typeof body.description === "string"
          ? body.description
          : undefined;
  }

  if ("amount" in body) {
    if (body.amount === null || body.amount === "") {
      patch.amount = null;
    } else {
      try {
        const v = BigInt(body.amount as string | number);
        if (v <= 0n) throw new Error();
        patch.amount = v.toString();
      } catch {
        return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
      }
    }
  }

  if ("expirySeconds" in body) {
    if (body.expirySeconds === null || body.expirySeconds === "") {
      patch.expirySeconds = null;
    } else {
      const n = Number(body.expirySeconds);
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json(
          { error: "invalid_expiry_seconds" },
          { status: 400 }
        );
      }
      patch.expirySeconds = n;
    }
  }

  if (
    body.metadataDefaults !== undefined &&
    body.metadataDefaults !== null &&
    typeof body.metadataDefaults === "object"
  ) {
    patch.metadataDefaults = body.metadataDefaults as Record<string, unknown>;
  }

  if (body.requiredFields !== undefined) {
    if (!Array.isArray(body.requiredFields)) {
      return NextResponse.json(
        { error: "invalid_required_fields" },
        { status: 400 }
      );
    }
    patch.requiredFields = (body.requiredFields as unknown[]).filter(
      (v): v is string => typeof v === "string"
    );
  }

  if (await isTestMode()) {
    try {
      const template = updateMockInvoiceTemplate(id, patch);
      return NextResponse.json({ template });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: "not_found", message: msg },
        { status: 404 }
      );
    }
  }

  return NextResponse.json(
    { error: "not_implemented", message: "Live mode not yet supported" },
    { status: 503 }
  );
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  if (await isTestMode()) {
    try {
      deleteMockInvoiceTemplate(id);
      return new NextResponse(null, { status: 204 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: "not_found", message: msg },
        { status: 404 }
      );
    }
  }

  return NextResponse.json(
    { error: "not_implemented", message: "Live mode not yet supported" },
    { status: 503 }
  );
}
