import { NextResponse } from "next/server";

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

async function loadHandlers() {
  if (isDemo) {
    const {
      getMockStats,
      getMockHealth,
      getMockInvoices,
      getMockInvoice,
      createMockInvoice,
      getMockEscrows,
    } = await import("./mock-data");

    return {
      createInvoiceHandler: async (req: Request) => {
        const body = await req.json().catch(() => ({}));
        const inv = createMockInvoice(body);
        return NextResponse.json(inv);
      },
      statusHandler: async (req: Request) => {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("invoiceId");
        if (!id) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
        const inv = getMockInvoice(id);
        if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(inv);
      },
      listInvoicesHandler: async () => NextResponse.json(getMockInvoices()),
      statsHandler: async () => NextResponse.json(getMockStats()),
      healthHandler: async () => NextResponse.json(getMockHealth()),
      escrowActionHandler: async () => NextResponse.json({ ok: true }),
      listEscrowsHandler: async () => NextResponse.json(getMockEscrows()),
      webhookHandler: async () => NextResponse.json({ ok: true }),
      getEngine: () => null,
    };
  }

  const { createPaymentHandlers } = await import("dero-pay/next");
  const { SqliteInvoiceStore } = await import("dero-pay/server");
  const path = await import("path");

  const dbPath = path.resolve(process.cwd(), "../../shared-deropay.db");
  const store = new SqliteInvoiceStore({ path: dbPath });

  return createPaymentHandlers({
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
}

const handlersPromise = loadHandlers();

async function getHandler<K extends string>(name: K) {
  const h = await handlersPromise;
  return (h as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
}

export const createInvoiceHandler = async (req: Request) =>
  (await getHandler("createInvoiceHandler"))(req) as Response;
export const statusHandler = async (req: Request) =>
  (await getHandler("statusHandler"))(req) as Response;
export const listInvoicesHandler = async (req: Request) =>
  (await getHandler("listInvoicesHandler"))(req) as Response;
export const statsHandler = async (req: Request) =>
  (await getHandler("statsHandler"))(req) as Response;
export const healthHandler = async (req: Request) =>
  (await getHandler("healthHandler"))(req) as Response;
export const escrowActionHandler = async (req: Request) =>
  (await getHandler("escrowActionHandler"))(req) as Response;
export const listEscrowsHandler = async (req: Request) =>
  (await getHandler("listEscrowsHandler"))(req) as Response;
export const webhookHandler = async (req: Request) =>
  (await getHandler("webhookHandler"))(req) as Response;
export const getEngine = async () => (await getHandler("getEngine"))();
