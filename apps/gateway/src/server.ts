import { Hono } from "hono";
import { cors } from "hono/cors";
import { InvoiceEngine } from "dero-pay/server";
import type { CreateInvoiceParams, Invoice, InvoiceStatus } from "dero-pay";
import { loadConfig } from "./config.js";
import { getDeroPrice, fiatToDeroAtomic } from "./price-feed.js";

const config = loadConfig();

// ---------------------------------------------------------------------------
// Engine singleton
// ---------------------------------------------------------------------------

let engine: InvoiceEngine | null = null;
let engineStarting: Promise<void> | null = null;

async function getEngine(): Promise<InvoiceEngine> {
  if (!engine) {
    const rpcAuth =
      config.rpcUsername && config.rpcPassword
        ? { username: config.rpcUsername, password: config.rpcPassword }
        : undefined;

    engine = new InvoiceEngine({
      walletRpcUrl: config.walletRpcUrl,
      daemonRpcUrl: config.daemonRpcUrl,
      rpcAuth,
      webhookUrl: config.webhookUrl,
      webhookSecret: config.webhookSecret,
      webhookMaxRetries: config.webhookMaxRetries,
      defaultTtlSeconds: config.defaultTtlSeconds,
      defaultRequiredConfirmations: config.defaultRequiredConfirmations,
      pollIntervalMs: config.pollIntervalMs,
      enableEscrow: config.enableEscrow,
      escrowFeeBasisPoints: config.escrowFeeBasisPoints,
      escrowBlockExpiration: config.escrowBlockExpiration,
    });
  }

  if (!engine.running) {
    if (!engineStarting) {
      engineStarting = engine.start().then(() => {
        engineStarting = null;
      });
    }
    await engineStarting;
  }

  return engine;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeInvoice(invoice: Invoice): Record<string, unknown> {
  return {
    ...invoice,
    amount: invoice.amount.toString(),
    amountReceived: invoice.amountReceived.toString(),
    paymentId: invoice.paymentId.toString(),
    payments: invoice.payments.map((p) => ({
      ...p,
      amount: p.amount.toString(),
      destinationPort: p.destinationPort.toString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export const app = new Hono();

app.use("*", cors({ origin: config.corsOrigin }));

// API key auth for protected routes
app.use("/invoices/*", apiKeyAuth);
app.use("/invoices", apiKeyAuth);
app.use("/stats", apiKeyAuth);
app.use("/escrow/*", apiKeyAuth);
app.use("/escrows", apiKeyAuth);

async function apiKeyAuth(c: any, next: any) {
  if (config.apiKeys.length === 0) {
    return next();
  }

  const key = c.req.header("X-DeroPay-ApiKey");
  if (!key || !config.apiKeys.includes(key)) {
    return c.json(
      { error: "Invalid or missing API key. Include X-DeroPay-ApiKey header." },
      401
    );
  }
  return next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check — always public
app.get("/health", async (c) => {
  try {
    const eng = await getEngine();
    const balance = await eng.getBalance();
    const address = eng.getBaseAddress();

    return c.json({
      status: "ok",
      engine: eng.running ? "running" : "stopped",
      wallet: {
        address,
        balance: balance.balance.toString(),
        unlockedBalance: balance.unlockedBalance.toString(),
      },
    });
  } catch (err) {
    return c.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      503
    );
  }
});

// Current DERO price — public, no auth
app.get("/price", async (c) => {
  try {
    const price = await getDeroPrice();
    return c.json(price);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Price feed unavailable" },
      503
    );
  }
});

// Convert fiat to DERO — public, no auth
app.get("/convert", async (c) => {
  try {
    const amountStr = c.req.query("amount");
    const currency = c.req.query("currency") ?? "usd";

    if (!amountStr) return c.json({ error: "Missing amount query parameter" }, 400);

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return c.json({ error: "Invalid amount" }, 400);
    }

    const result = await fiatToDeroAtomic(amount, currency);
    return c.json(result);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Conversion failed" },
      500
    );
  }
});

// Create invoice
app.post("/invoices", async (c) => {
  try {
    const eng = await getEngine();
    const body = await c.req.json();

    if (!body.name) return c.json({ error: "Missing name" }, 400);

    // Support both direct atomic amounts and fiat conversion
    let atomicAmount: bigint;

    if (body.amount) {
      atomicAmount = BigInt(body.amount);
    } else if (body.fiatAmount && body.currency) {
      const converted = await fiatToDeroAtomic(
        parseFloat(body.fiatAmount),
        body.currency
      );
      atomicAmount = BigInt(converted.atomicUnits);
    } else {
      return c.json(
        { error: "Provide either amount (atomic units) or fiatAmount + currency" },
        400
      );
    }

    const params: CreateInvoiceParams = {
      name: body.name,
      description: body.description,
      amount: atomicAmount,
      ttlSeconds: body.ttlSeconds,
      requiredConfirmations: body.requiredConfirmations,
      metadata: body.metadata,
    };

    if (body.escrow) {
      if (!body.escrow.sellerAddress) {
        return c.json({ error: "Escrow requires sellerAddress" }, 400);
      }
      params.escrow = {
        sellerAddress: body.escrow.sellerAddress,
        arbitratorAddress: body.escrow.arbitratorAddress,
        feeBasisPoints: body.escrow.feeBasisPoints,
        blockExpiration: body.escrow.blockExpiration,
      };
    }

    const invoice = await eng.createInvoice(params);
    return c.json(serializeInvoice(invoice), 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Get invoice by ID
app.get("/invoices/:id", async (c) => {
  try {
    const eng = await getEngine();
    const invoice = await eng.getInvoice(c.req.param("id"));

    if (!invoice) return c.json({ error: "Invoice not found" }, 404);

    return c.json(serializeInvoice(invoice));
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// List invoices
app.get("/invoices", async (c) => {
  try {
    const eng = await getEngine();
    const status = c.req.query("status") as InvoiceStatus | undefined;
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    const invoices = await eng.listInvoices({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return c.json(invoices.map(serializeInvoice));
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Invoice stats
app.get("/stats", async (c) => {
  try {
    const eng = await getEngine();
    const stats = await eng.getStats();

    return c.json({
      ...stats,
      totalAmountReceived: stats.totalAmountReceived.toString(),
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Invoice status by query param (for simple polling from checkout widgets)
app.get("/status", async (c) => {
  try {
    const eng = await getEngine();
    const invoiceId = c.req.query("invoiceId");

    if (!invoiceId) {
      return c.json({ error: "Missing invoiceId query parameter" }, 400);
    }

    const invoice = await eng.getInvoice(invoiceId);
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);

    return c.json(serializeInvoice(invoice));
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Escrow action
app.post("/escrow/:invoiceId/:action", async (c) => {
  try {
    const eng = await getEngine();
    const { invoiceId, action } = c.req.param();

    const validActions = [
      "confirmDelivery",
      "refundBuyer",
      "dispute",
      "claimAfterExpiry",
      "arbitrateRelease",
      "arbitrateRefund",
    ];

    if (!validActions.includes(action)) {
      return c.json(
        { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
        400
      );
    }

    const txid = await eng.escrowAction(
      invoiceId,
      action as Parameters<typeof eng.escrowAction>[1]
    );

    return c.json({ txid });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// List escrow invoices
app.get("/escrows", async (c) => {
  try {
    const eng = await getEngine();
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    const allInvoices = await eng.listInvoices({
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    const escrowInvoices = allInvoices.filter((inv) => inv.escrow !== null);
    return c.json(escrowInvoices.map(serializeInvoice));
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// Webhook verification endpoint (for external services to verify signatures)
app.post("/webhooks/verify", async (c) => {
  try {
    const { verifyWebhookSignature } = await import("dero-pay/server");

    if (!config.webhookSecret) {
      return c.json({ error: "Webhook secret not configured" }, 500);
    }

    const signature = c.req.header("X-DeroPay-Signature");
    if (!signature) return c.json({ error: "Missing signature" }, 401);

    const body = await c.req.text();

    if (!verifyWebhookSignature(body, signature, config.webhookSecret)) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    return c.json({ verified: true });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});
