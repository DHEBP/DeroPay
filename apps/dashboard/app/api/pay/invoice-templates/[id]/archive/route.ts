/**
 * /api/pay/invoice-templates/[id]/archive — archive toggle.
 *
 *   POST /api/pay/invoice-templates/<id>/archive
 *     body (optional): { unarchive?: boolean }
 *        → 200 { template }
 *
 * Default behaviour is to archive (set `archived_at = now()`). Pass
 * `{ unarchive: true }` to clear the flag.
 */

import { NextResponse } from "next/server";
import { isTestMode } from "@/lib/test-mode-server";
import {
  archiveMockInvoiceTemplate,
  getMockInvoiceTemplate,
  unarchiveMockInvoiceTemplate,
} from "@/lib/mock-invoice-templates";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;

  let unarchive = false;
  try {
    const text = await req.text();
    if (text.trim().length > 0) {
      const body = JSON.parse(text) as Record<string, unknown>;
      unarchive = body.unarchive === true;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (await isTestMode()) {
    try {
      const template = unarchive
        ? unarchiveMockInvoiceTemplate(id)
        : archiveMockInvoiceTemplate(id);
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
