import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  TEST_ADDRESSES,
  authorized,
  createAuthToken,
  seedBalances,
  startNextApp,
} from "./prepaid-e2e-harness";

test("optional live Venice request is metered through the prepaid gateway", async (context) => {
  const apiKey = process.env.VENICE_API_KEY;
  const model = process.env.VENICE_MODEL;
  if (!apiKey || !model) {
    context.skip();
    return;
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "deropay-prepaid-venice-"));
  const database = join(temporaryDirectory, "deropay.db");
  const authSecret = randomBytes(32).toString("hex");
  const receiptSecret = randomBytes(32).toString("hex");
  await seedBalances(database, { [TEST_ADDRESSES.alice]: 100_000n });
  const token = await createAuthToken(authSecret, TEST_ADDRESSES.alice);
  const app = await startNextApp({
    dbPath: database,
    upstreamBaseUrl: process.env.VENICE_BASE_URL ?? "https://api.venice.ai",
    authSecret,
    receiptSecret,
    extraEnv: { DEROPAY_UPSTREAM_API_KEY: apiKey },
    redact: [apiKey, token, TEST_ADDRESSES.alice],
  });

  try {
    const response = await fetch(`${app.baseUrl}/api/v1/chat/completions`, authorized(token, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "venice-live-smoke" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with the single word OK." }],
        max_tokens: 8,
        stream: false,
      }),
    }));
    const body = await response.text();
    expect(response.status, body.slice(0, 500)).toBe(200);
    expect(body.length).toBeGreaterThan(0);

    const balanceResponse = await fetch(
      `${app.baseUrl}/api/v1/x402/balance/${TEST_ADDRESSES.alice}`,
      authorized(token),
    );
    const balance = await balanceResponse.json() as {
      balanceAtomic: string;
      reservedAtomic: string;
    };
    const charge = 100_000n - BigInt(balance.balanceAtomic);
    expect(balance.reservedAtomic).toBe("0");
    expect(charge).toBeGreaterThan(0n);
    expect(charge).toBeLessThanOrEqual(50_000n);
    expect(app.containsRawLogValue(apiKey)).toBe(false);
  } finally {
    await app.stop();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}, 120_000);
