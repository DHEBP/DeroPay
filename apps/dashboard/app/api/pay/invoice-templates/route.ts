/**
 * /api/pay/invoice-templates — collection route.
 *
 *   GET  /api/pay/invoice-templates?includeArchived=1
 *        → 200 { templates: InvoiceTemplate[] }
 *
 *   POST /api/pay/invoice-templates
 *     body: { name, description?, amount?, expirySeconds?,
 *             metadataDefaults?, requiredFields? }
 *        → 201 { template: InvoiceTemplate }
 *
 * Uses mock store for now (test/demo mode). Live mode returns 503 until
 * InvoiceTemplate CRUD is added to the dero-pay SDK.
 */

import { NextResponse } from "next/server";
import { isTestMode } from "@/lib/test-mode-server";
import {
  createMockInvoiceTemplate,
  listMockInvoiceTemplates,
  type InvoiceTemplate,
} from "@/lib/mock-invoice-templates";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("includeArchived") === "1";

  if (await isTestMode()) {
    return NextResponse.json({
      templates: listMockInvoiceTemplates({ includeArchived }),
    });
  }

  // Live mode: store not implemented yet
  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "Invoice templates are available in test/demo mode. Live mode requires dero-pay SDK support.",
    },
    { status: 503 }
  );
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "invalid_name", message: "name must be a non-empty string" },
      { status: 400 }
    );
  }

  const description =
    typeof body.description === "string" ? body.description : undefined;

  let amount: string | null | undefined;
  if (body.amount === null) {
    amount = null;
  } else if (body.amount !== undefined && body.amount !== "") {
    try {
      const v = BigInt(body.amount as string | number);
      if (v <= 0n) throw new Error("amount must be positive");
      amount = v.toString();
    } catch {
      return NextResponse.json(
        {
          error: "invalid_amount",
          message: "amount must be a positive integer string",
        },
        { status: 400 }
      );
    }
  }

  let expirySeconds: number | null | undefined;
  if (body.expirySeconds === null) {
    expirySeconds = null;
  } else if (body.expirySeconds !== undefined && body.expirySeconds !== "") {
    const n = Number(body.expirySeconds);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json(
        {
          error: "invalid_expiry_seconds",
          message: "expirySeconds must be a positive integer",
        },
        { status: 400 }
      );
    }
    expirySeconds = n;
  }

  const metadataDefaults =
    body.metadataDefaults && typeof body.metadataDefaults === "object"
      ? (body.metadataDefaults as Record<string, unknown>)
      : undefined;

  let requiredFields: string[] | undefined;
  if (body.requiredFields !== undefined) {
    if (!Array.isArray(body.requiredFields)) {
      return NextResponse.json(
        {
          error: "invalid_required_fields",
          message: "requiredFields must be a string[]",
        },
        { status: 400 }
      );
    }
    requiredFields = (body.requiredFields as unknown[]).filter(
      (v): v is string => typeof v === "string"
    );
  }

  const args = {
    name: name.trim(),
    description,
    amount,
    expirySeconds,
    metadataDefaults,
    requiredFields,
  };

  if (await isTestMode()) {
    const template = createMockInvoiceTemplate(args);
    return NextResponse.json({ template }, { status: 201 });
  }

  // Live mode: store not implemented yet
  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "Invoice templates are available in test/demo mode. Live mode requires dero-pay SDK support.",
    },
    { status: 503 }
  );
}
