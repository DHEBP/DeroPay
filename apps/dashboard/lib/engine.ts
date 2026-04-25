import { NextResponse } from "next/server";
import { isTestMode } from "./test-mode-server";

/**
 * Runtime-switchable payment engine.
 *
 * Two lazy handler bundles — one mock, one real — are constructed the first
 * time they're needed and then cached for the lifetime of the server process.
 * Each exported route-handler wrapper picks which bundle to call based on
 * the `deropay_mode` cookie (see `lib/test-mode.ts`).
 *
 * We cache both bundles rather than tearing down the real store when the
 * merchant flips to test mode — flipping should be instantaneous, and a live
 * SqliteInvoiceStore with an open engine is expensive to reconstruct.
 */

type Handlers = {
  createInvoiceHandler: (req: Request) => Promise<Response> | Response;
  statusHandler: (req: Request) => Promise<Response> | Response;
  listInvoicesHandler: (req: Request) => Promise<Response> | Response;
  statsHandler: (req: Request) => Promise<Response> | Response;
  healthHandler: (req: Request) => Promise<Response> | Response;
  escrowActionHandler: (req: Request) => Promise<Response> | Response;
  listEscrowsHandler: (req: Request) => Promise<Response> | Response;
  webhookHandler: (req: Request) => Promise<Response> | Response;
  listWebhookDeliveriesHandler: (req: Request) => Promise<Response> | Response;
  getWebhookDeliveryHandler: (
    req: Request,
    params: { id: string }
  ) => Promise<Response> | Response;
  resendWebhookDeliveryHandler: (
    req: Request,
    params: { id: string }
  ) => Promise<Response> | Response;
  listWebhookSecretsHandler: (req: Request) => Promise<Response> | Response;
  rotateWebhookSecretHandler: (req: Request) => Promise<Response> | Response;
  revokeWebhookSecretHandler: (
    req: Request,
    params: { id: string }
  ) => Promise<Response> | Response;
  // Phase 3 #37 — sweeps
  listSweepsHandler: (req: Request) => Promise<Response> | Response;
  createSweepHandler: (req: Request) => Promise<Response> | Response;
  getSweepHandler: (
    req: Request,
    params: { id: string }
  ) => Promise<Response> | Response;
  patchSweepHandler: (
    req: Request,
    params: { id: string }
  ) => Promise<Response> | Response;
  listSweepSchedulesHandler: (req: Request) => Promise<Response> | Response;
  createSweepScheduleHandler: (req: Request) => Promise<Response> | Response;
  getSweepScheduleHandler: (
    req: Request,
    params: { id: string }
  ) => Promise<Response> | Response;
  patchSweepScheduleHandler: (
    req: Request,
    params: { id: string }
  ) => Promise<Response> | Response;
  deleteSweepScheduleHandler: (
    req: Request,
    params: { id: string }
  ) => Promise<Response> | Response;
  getEngine: () => unknown;
};

let mockHandlersPromise: Promise<Handlers> | null = null;
let realHandlersPromise: Promise<Handlers> | null = null;

function getMockHandlers(): Promise<Handlers> {
  return (async () => {
    const {
      getMockStats,
      getMockStatsRange,
      getMockHealth,
      getMockInvoices,
      getMockInvoice,
      createMockInvoice,
      getMockEscrows,
      getMockSweeps,
      getMockSweep,
      createMockSweep,
      getMockSweepSchedules,
      getMockSweepSchedule,
      createMockSweepSchedule,
      updateMockSweepSchedule,
      deleteMockSweepSchedule,
    } = await import("./mock-data");
    const { parseRange } = await import("./range");

    const handlers: Handlers = {
      createInvoiceHandler: async (req: Request) => {
        const body = (await req.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const inv = createMockInvoice({
          name: typeof body.name === "string" ? body.name : undefined,
          description:
            typeof body.description === "string" ? body.description : undefined,
          amount: typeof body.amount === "string" ? body.amount : undefined,
          // Phase 3 #33 — preserve the template id so the drawer can
          // backlink to the template that stamped out the invoice.
          templateId:
            typeof body.templateId === "string" ? body.templateId : null,
        });
        return NextResponse.json(inv);
      },
      statusHandler: async (req: Request) => {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("invoiceId");
        if (!id)
          return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
        const inv = getMockInvoice(id);
        if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(inv);
      },
      listInvoicesHandler: async () => NextResponse.json(getMockInvoices()),
      statsHandler: async (req: Request) => {
        const { searchParams } = new URL(req.url);
        const rangeRaw = searchParams.get("range");
        const compare = searchParams.get("compare") === "1";
        if (rangeRaw) {
          return NextResponse.json(getMockStatsRange(parseRange(rangeRaw), compare));
        }
        return NextResponse.json(getMockStats());
      },
      healthHandler: async () => NextResponse.json(getMockHealth()),
      escrowActionHandler: async () => NextResponse.json({ ok: true }),
      listEscrowsHandler: async () => NextResponse.json(getMockEscrows()),
      webhookHandler: async () => NextResponse.json({ ok: true }),
      // Webhook console endpoints: demo-mode returns empty lists so the UI
      // renders its canonical empty-states without reaching into fixtures.
      listWebhookDeliveriesHandler: async () =>
        NextResponse.json({ deliveries: [] }),
      getWebhookDeliveryHandler: async () =>
        NextResponse.json({ error: "demo_mode" }, { status: 404 }),
      resendWebhookDeliveryHandler: async () =>
        NextResponse.json(
          { error: "Resend is disabled in demo mode" },
          { status: 503 }
        ),
      listWebhookSecretsHandler: async () =>
        NextResponse.json({ secrets: [] }),
      rotateWebhookSecretHandler: async () =>
        NextResponse.json(
          { error: "Rotation is disabled in demo mode" },
          { status: 503 }
        ),
      revokeWebhookSecretHandler: async () =>
        NextResponse.json(
          { error: "Revocation is disabled in demo mode" },
          { status: 503 }
        ),
      // Phase 3 #37 — sweep handlers (demo fixtures)
      listSweepsHandler: async () =>
        NextResponse.json({ sweeps: getMockSweeps() }),
      createSweepHandler: async (req: Request) => {
        const body = (await req.json().catch(() => ({}))) as {
          toWallet?: string;
          amount?: string;
          memo?: string;
        };
        if (!body.toWallet || !body.amount) {
          return NextResponse.json(
            { error: "toWallet and amount are required" },
            { status: 400 }
          );
        }
        const sweep = createMockSweep({
          toWallet: body.toWallet,
          amount: body.amount,
          memo: body.memo,
        });
        return NextResponse.json({ sweep });
      },
      getSweepHandler: async (_req, params) => {
        const sweep = getMockSweep(params.id);
        if (!sweep)
          return NextResponse.json({ error: "not_found" }, { status: 404 });
        return NextResponse.json({ sweep });
      },
      patchSweepHandler: async () =>
        NextResponse.json(
          { error: "Patch is disabled in demo mode" },
          { status: 503 }
        ),
      listSweepSchedulesHandler: async (req: Request) => {
        const url = new URL(req.url);
        const enabledRaw = url.searchParams.get("enabled");
        const enabled =
          enabledRaw === "true"
            ? true
            : enabledRaw === "false"
              ? false
              : undefined;
        return NextResponse.json({
          schedules: getMockSweepSchedules(enabled),
        });
      },
      createSweepScheduleHandler: async (req: Request) => {
        const body = (await req.json().catch(() => ({}))) as {
          name?: string;
          toWallet?: string;
          frequency?: "daily" | "weekly";
          timeUtc?: string;
          dailyLimit?: string | null;
          minBalanceReserve?: string;
          enabled?: boolean;
        };
        if (!body.name || !body.toWallet || !body.frequency || !body.timeUtc) {
          return NextResponse.json(
            { error: "name, toWallet, frequency, timeUtc are required" },
            { status: 400 }
          );
        }
        const schedule = createMockSweepSchedule({
          name: body.name,
          toWallet: body.toWallet,
          frequency: body.frequency,
          timeUtc: body.timeUtc,
          dailyLimit: body.dailyLimit ?? null,
          minBalanceReserve: body.minBalanceReserve ?? "0",
          enabled: body.enabled,
        });
        return NextResponse.json({ schedule });
      },
      getSweepScheduleHandler: async (_req, params) => {
        const schedule = getMockSweepSchedule(params.id);
        if (!schedule)
          return NextResponse.json({ error: "not_found" }, { status: 404 });
        return NextResponse.json({ schedule });
      },
      patchSweepScheduleHandler: async (req: Request, params) => {
        const body = (await req.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const schedule = updateMockSweepSchedule(
          params.id,
          body as Parameters<typeof updateMockSweepSchedule>[1]
        );
        if (!schedule)
          return NextResponse.json({ error: "not_found" }, { status: 404 });
        return NextResponse.json({ schedule });
      },
      deleteSweepScheduleHandler: async (_req, params) => {
        const ok = deleteMockSweepSchedule(params.id);
        if (!ok)
          return NextResponse.json({ error: "not_found" }, { status: 404 });
        return NextResponse.json({ ok: true });
      },
      getEngine: () => null,
    };
    return handlers;
  })();
}

function getRealHandlers(): Promise<Handlers> {
  return (async () => {
    const { createPaymentHandlers } = await import("dero-pay/next");
    const { SqliteInvoiceStore } = await import("dero-pay/server");
    const path = await import("path");

    const dbPath = path.resolve(process.cwd(), "../../shared-deropay.db");
    const store = new SqliteInvoiceStore({ path: dbPath });

    const base = createPaymentHandlers({
      store,
      walletRpcUrl: process.env.WALLET_RPC_URL ?? "http://127.0.0.1:10103/json_rpc",
      daemonRpcUrl: process.env.DAEMON_RPC_URL ?? "http://127.0.0.1:10102/json_rpc",
      rpcAuth: process.env.RPC_USERNAME
        ? { username: process.env.RPC_USERNAME, password: process.env.RPC_PASSWORD ?? "" }
        : undefined,
      webhookUrl: process.env.WEBHOOK_URL,
      webhookSecret: process.env.WEBHOOK_SECRET,
      defaultTtlSeconds: process.env.DEFAULT_TTL_SECONDS
        ? parseInt(process.env.DEFAULT_TTL_SECONDS, 10)
        : 900,
      defaultRequiredConfirmations: process.env.DEFAULT_CONFIRMATIONS
        ? parseInt(process.env.DEFAULT_CONFIRMATIONS, 10)
        : 3,
      pollIntervalMs: process.env.POLL_INTERVAL_MS
        ? parseInt(process.env.POLL_INTERVAL_MS, 10)
        : 5000,
    });

    // Features the live `dero-pay` package hasn't shipped yet (webhook
    // deliveries, webhook secrets rotation, sweeps, sweep schedules,
    // automation engine) return 503 from the real-mode handlers. The
    // dashboard pages that surface these features already degrade
    // gracefully. When the real API lands in `dero-pay`, wire the
    // `base.*Handler` calls back in below.
    const notImplemented = async () =>
      new Response(
        JSON.stringify({ error: "not_implemented_in_live_mode" }),
        { status: 503, headers: { "content-type": "application/json" } }
      );

    const handlers: Handlers = {
      createInvoiceHandler: base.createInvoiceHandler,
      statusHandler: base.statusHandler,
      listInvoicesHandler: base.listInvoicesHandler,
      statsHandler: base.statsHandler,
      healthHandler: base.healthHandler,
      escrowActionHandler: base.escrowActionHandler,
      listEscrowsHandler: base.listEscrowsHandler,
      webhookHandler: base.webhookHandler,
      listWebhookDeliveriesHandler: notImplemented,
      getWebhookDeliveryHandler: notImplemented,
      resendWebhookDeliveryHandler: notImplemented,
      listWebhookSecretsHandler: notImplemented,
      rotateWebhookSecretHandler: notImplemented,
      revokeWebhookSecretHandler: notImplemented,
      listSweepsHandler: notImplemented,
      createSweepHandler: notImplemented,
      getSweepHandler: notImplemented,
      patchSweepHandler: notImplemented,
      listSweepSchedulesHandler: notImplemented,
      createSweepScheduleHandler: notImplemented,
      getSweepScheduleHandler: notImplemented,
      patchSweepScheduleHandler: notImplemented,
      deleteSweepScheduleHandler: notImplemented,
      getEngine: base.getEngine,
    };
    return handlers;
  })();
}

async function getHandlers(): Promise<Handlers> {
  if (await isTestMode()) {
    if (!mockHandlersPromise) mockHandlersPromise = getMockHandlers();
    return mockHandlersPromise;
  }
  if (!realHandlersPromise) realHandlersPromise = getRealHandlers();
  return realHandlersPromise;
}

export const createInvoiceHandler = async (req: Request): Promise<Response> => {
  const h = await getHandlers();
  return h.createInvoiceHandler(req);
};
export const statusHandler = async (req: Request): Promise<Response> => {
  const h = await getHandlers();
  return h.statusHandler(req);
};
export const listInvoicesHandler = async (req: Request): Promise<Response> => {
  const h = await getHandlers();
  return h.listInvoicesHandler(req);
};
export const statsHandler = async (req: Request): Promise<Response> => {
  const h = await getHandlers();
  return h.statsHandler(req);
};
export const healthHandler = async (req: Request): Promise<Response> => {
  const h = await getHandlers();
  return h.healthHandler(req);
};
export const escrowActionHandler = async (req: Request): Promise<Response> => {
  const h = await getHandlers();
  return h.escrowActionHandler(req);
};
export const listEscrowsHandler = async (req: Request): Promise<Response> => {
  const h = await getHandlers();
  return h.listEscrowsHandler(req);
};
export const webhookHandler = async (req: Request): Promise<Response> => {
  const h = await getHandlers();
  return h.webhookHandler(req);
};
export const listWebhookDeliveriesHandler = async (
  req: Request
): Promise<Response> => {
  const h = await getHandlers();
  return h.listWebhookDeliveriesHandler(req);
};
export const getWebhookDeliveryHandler = async (
  req: Request,
  params: { id: string }
): Promise<Response> => {
  const h = await getHandlers();
  return h.getWebhookDeliveryHandler(req, params);
};
export const resendWebhookDeliveryHandler = async (
  req: Request,
  params: { id: string }
): Promise<Response> => {
  const h = await getHandlers();
  return h.resendWebhookDeliveryHandler(req, params);
};
export const listWebhookSecretsHandler = async (
  req: Request
): Promise<Response> => {
  const h = await getHandlers();
  return h.listWebhookSecretsHandler(req);
};
export const rotateWebhookSecretHandler = async (
  req: Request
): Promise<Response> => {
  const h = await getHandlers();
  return h.rotateWebhookSecretHandler(req);
};
export const revokeWebhookSecretHandler = async (
  req: Request,
  params: { id: string }
): Promise<Response> => {
  const h = await getHandlers();
  return h.revokeWebhookSecretHandler(req, params);
};
export const getEngine = async (): Promise<unknown> => {
  const h = await getHandlers();
  return h.getEngine();
};

// ---------------------------------------------------------------------------
// Phase 3 #37 — sweep handler wrappers
// ---------------------------------------------------------------------------

export const listSweepsHandler = async (req: Request): Promise<Response> => {
  const h = await getHandlers();
  return h.listSweepsHandler(req);
};
export const createSweepHandler = async (req: Request): Promise<Response> => {
  const h = await getHandlers();
  return h.createSweepHandler(req);
};
export const getSweepHandler = async (
  req: Request,
  params: { id: string }
): Promise<Response> => {
  const h = await getHandlers();
  return h.getSweepHandler(req, params);
};
export const patchSweepHandler = async (
  req: Request,
  params: { id: string }
): Promise<Response> => {
  const h = await getHandlers();
  return h.patchSweepHandler(req, params);
};
export const listSweepSchedulesHandler = async (
  req: Request
): Promise<Response> => {
  const h = await getHandlers();
  return h.listSweepSchedulesHandler(req);
};
export const createSweepScheduleHandler = async (
  req: Request
): Promise<Response> => {
  const h = await getHandlers();
  return h.createSweepScheduleHandler(req);
};
export const getSweepScheduleHandler = async (
  req: Request,
  params: { id: string }
): Promise<Response> => {
  const h = await getHandlers();
  return h.getSweepScheduleHandler(req, params);
};
export const patchSweepScheduleHandler = async (
  req: Request,
  params: { id: string }
): Promise<Response> => {
  const h = await getHandlers();
  return h.patchSweepScheduleHandler(req, params);
};
export const deleteSweepScheduleHandler = async (
  req: Request,
  params: { id: string }
): Promise<Response> => {
  const h = await getHandlers();
  return h.deleteSweepScheduleHandler(req, params);
};

/**
 * Ensure the payment engine + SQLite store have been constructed. Any
 * consumer that needs access to the event bus (notably the SSE route at
 * /api/pay/events) should await this before calling into `dero-pay/events`,
 * because `publish`/`listEvents` only persist once `SqliteInvoiceStore`'s
 * constructor has run `setEventStore(this)`.
 *
 * In real mode, we prime the real-handlers bundle so the store is live.
 * In test mode we return a resolved promise immediately — there is no
 * real store, and the SSE route's `listEvents` call will harmlessly
 * return `[]` until the merchant flips to live and the store comes up.
 *
 * Safe to call repeatedly — the underlying promise is cached.
 */
export async function ensureStoreReady(): Promise<void> {
  if (await isTestMode()) return;
  if (!realHandlersPromise) realHandlersPromise = getRealHandlers();
  await realHandlersPromise;
}
