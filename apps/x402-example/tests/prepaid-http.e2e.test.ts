import { afterAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  TEST_ADDRESSES,
  authorized,
  createAuthToken,
  seedBalances,
  startFakeProvider,
  startNextApp,
  waitFor,
  type RunningApp,
} from "./prepaid-e2e-harness";

const tempDirectory = mkdtempSync(join(tmpdir(), "deropay-prepaid-http-"));
let runningApp: RunningApp | undefined;

afterAll(async () => {
  await runningApp?.stop();
  rmSync(tempDirectory, { recursive: true, force: true });
});

test("production HTTP gateway enforces auth, accounting, isolation, streaming, and restart", async () => {
  const database = join(tempDirectory, "deropay.db");
  const authSecret = randomBytes(32).toString("hex");
  const receiptSecret = randomBytes(32).toString("hex");
  await seedBalances(database, {
    [TEST_ADDRESSES.alice]: 200_000n,
    [TEST_ADDRESSES.bob]: 100_000n,
    [TEST_ADDRESSES.carol]: 50_000n,
  });
  const provider = await startFakeProvider();
  try {
    runningApp = await startNextApp({
      dbPath: database,
      upstreamBaseUrl: provider.origin,
      authSecret,
      receiptSecret,
      redact: Object.values(TEST_ADDRESSES),
    });
    const baseUrl = runningApp.baseUrl;
    const [aliceToken, bobToken, carolToken, wrongToken, expiredToken] = await Promise.all([
      createAuthToken(authSecret, TEST_ADDRESSES.alice),
      createAuthToken(authSecret, TEST_ADDRESSES.bob),
      createAuthToken(authSecret, TEST_ADDRESSES.carol),
      createAuthToken(randomBytes(32).toString("hex"), TEST_ADDRESSES.alice),
      createAuthToken(authSecret, TEST_ADDRESSES.alice, 0),
    ]);
    const balance = async (address: string, token: string) => {
      const response = await fetch(
        `${baseUrl}/api/v1/x402/balance/${encodeURIComponent(address)}`,
        authorized(token),
      );
      return { response, body: await response.json() as Record<string, unknown> };
    };
    const metered = (
      token: string,
      key: string,
      body: Record<string, unknown>,
      path = "/api/v1/chat/completions",
    ) =>
      fetch(`${baseUrl}${path}`, authorized(token, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
          Cookie: "wallet-cookie=must-not-forward",
          "X-DeroPay-Receipt": "must-not-forward",
        },
        body: JSON.stringify({ model: "default", ...body }),
      }));

    const noAuth = await fetch(`${baseUrl}/api/v1/x402/balance/${TEST_ADDRESSES.alice}`);
    expect(noAuth.status, `${await noAuth.clone().text()}\n${runningApp.logs()}`).toBe(401);
    expect((await balance(TEST_ADDRESSES.alice, `${aliceToken}tampered`)).response.status).toBe(401);
    expect((await balance(TEST_ADDRESSES.alice, wrongToken)).response.status).toBe(401);
    expect((await balance(TEST_ADDRESSES.alice, expiredToken)).response.status).toBe(401);
    expect((await balance(TEST_ADDRESSES.bob, aliceToken)).response.status).toBe(403);
    const opening = await balance(TEST_ADDRESSES.alice, aliceToken);
    expect(opening.response.status).toBe(200);
    expect(opening.response.headers.get("Cache-Control")).toBe("no-store");
    expect(opening.body.balanceAtomic).toBe("200000");

    const invalidChallenge = await fetch(`${baseUrl}/api/auth/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "not-a-dero-address" }),
    });
    expect(invalidChallenge.status).toBe(400);
    const challenges = await Promise.all([
      fetch(`${baseUrl}/api/auth/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: TEST_ADDRESSES.alice }),
      }).then((response) => response.json() as Promise<{ nonce: string }>),
      fetch(`${baseUrl}/api/auth/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: TEST_ADDRESSES.alice }),
      }).then((response) => response.json() as Promise<{ nonce: string }>),
    ]);
    expect(challenges[0].nonce).not.toBe(challenges[1].nonce);
    expect(
      (
        await fetch(`${baseUrl}/api/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(400);

    const beforeGuards = provider.requests.length;
    expect(
      (
        await fetch(`${baseUrl}/api/v1/not-supported`, authorized(aliceToken, {
          method: "POST",
          headers: { "Idempotency-Key": "unsupported" },
          body: "{}",
        }))
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${baseUrl}/api/v1/chat/completions`, authorized(aliceToken, {
          method: "POST",
          headers: { "Idempotency-Key": "too-large" },
          body: "x".repeat(513),
        }))
      ).status,
    ).toBe(413);
    expect(provider.requests).toHaveLength(beforeGuards);

    const models = await fetch(`${baseUrl}/api/v1/models`, authorized(aliceToken, {
      headers: {
        Cookie: "wallet-cookie=must-not-forward",
        "X-Payment": "must-not-forward",
      },
    }));
    expect(models.status).toBe(200);
    expect(models.headers.get("Set-Cookie")).toBeNull();
    expect((await balance(TEST_ADDRESSES.alice, aliceToken)).body.balanceAtomic).toBe("200000");

    const sharedKey = "same-key-across-wallets";
    const [aliceChat, bobChat] = await Promise.all([
      metered(aliceToken, sharedKey, {}),
      metered(bobToken, sharedKey, {}),
    ]);
    expect([aliceChat.status, bobChat.status]).toEqual([200, 200]);
    expect(aliceChat.headers.get("Set-Cookie")).toBeNull();
    expect((await balance(TEST_ADDRESSES.alice, aliceToken)).body.balanceAtomic).toBe("199998");
    expect((await balance(TEST_ADDRESSES.bob, bobToken)).body.balanceAtomic).toBe("99998");
    const paidRequests = provider.requests.filter((request) =>
      request.pathname === "/api/v1/chat/completions"
    );
    expect(paidRequests).toHaveLength(2);
    for (const request of paidRequests) {
      expect(request.headers.get("Authorization")).toBe("Bearer provider-test-key");
      expect(request.headers.has("Cookie")).toBe(false);
      expect(request.headers.has("Idempotency-Key")).toBe(false);
      expect(request.headers.has("X-DeroPay-Receipt")).toBe(false);
      expect(request.headers.has("X-Payment")).toBe(false);
    }
    const callsBeforeReplay = provider.requests.length;
    expect((await metered(aliceToken, sharedKey, {})).status).toBe(409);
    expect(provider.requests).toHaveLength(callsBeforeReplay);

    const beforeProviderError = (await balance(TEST_ADDRESSES.alice, aliceToken)).body.balanceAtomic;
    expect((await metered(aliceToken, "provider-error", { scenario: "provider-error" })).status).toBe(503);
    expect((await balance(TEST_ADDRESSES.alice, aliceToken)).body.balanceAtomic).toBe(beforeProviderError);

    expect((await metered(aliceToken, "missing-usage", { scenario: "missing-usage" })).status).toBe(200);
    expect((await balance(TEST_ADDRESSES.alice, aliceToken)).body.balanceAtomic).toBe("149998");
    expect(
      (
        await metered(
          bobToken,
          "image-operation",
          {},
          "/api/v1/image/generate",
        )
      ).status,
    ).toBe(200);
    expect((await balance(TEST_ADDRESSES.bob, bobToken)).body.balanceAtomic).toBe("49998");

    const stream = await metered(aliceToken, "stream-measured", { scenario: "stream", stream: true });
    expect(stream.status).toBe(200);
    await stream.text();
    expect((await balance(TEST_ADDRESSES.alice, aliceToken)).body.balanceAtomic).toBe("149996");
    const cancelled = await metered(aliceToken, "stream-cancel", {
      scenario: "stream-cancel",
      stream: true,
    });
    expect(cancelled.status).toBe(200);
    const reader = cancelled.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel("test client stopped reading");
    await waitFor(
      () => balance(TEST_ADDRESSES.alice, aliceToken).then(({ body }) => body.balanceAtomic),
      (value) => value === "99996",
      { label: "cancelled stream full-reserve capture" },
    );

    const slow = metered(carolToken, "slow-first", { scenario: "slow" });
    await provider.slowStarted;
    expect((await metered(carolToken, "slow-second", {})).status).toBe(402);
    provider.releaseSlow();
    expect((await slow).status).toBe(200);
    expect((await balance(TEST_ADDRESSES.carol, carolToken)).body.balanceAtomic).toBe("49998");

    const transactions = await fetch(
      `${baseUrl}/api/v1/x402/transactions/${TEST_ADDRESSES.alice}?limit=100&offset=0`,
      authorized(aliceToken),
    );
    const transactionBody = await transactions.json() as { items: Array<{ type: string }> };
    expect(transactionBody.items.filter((item) => item.type === "CHARGE")).toHaveLength(4);
    expect(
      (
        await fetch(
          `${baseUrl}/api/v1/x402/transactions/${TEST_ADDRESSES.alice}?limit=0&offset=0`,
          authorized(aliceToken),
        )
      ).status,
    ).toBe(400);

    const sensitiveValues = [
      authSecret,
      receiptSecret,
      "provider-test-key",
      aliceToken,
      bobToken,
      carolToken,
      ...Object.values(TEST_ADDRESSES),
    ];
    for (const secret of sensitiveValues) {
      expect(runningApp.containsRawLogValue(secret)).toBe(false);
    }
    await runningApp.stop();
    runningApp = await startNextApp({
      dbPath: database,
      upstreamBaseUrl: provider.origin,
      authSecret,
      receiptSecret,
      redact: Object.values(TEST_ADDRESSES),
    });
    const restartedBase = runningApp.baseUrl;
    const restartedBalance = await fetch(
      `${restartedBase}/api/v1/x402/balance/${TEST_ADDRESSES.alice}`,
      authorized(aliceToken),
    );
    expect((await restartedBalance.json() as { balanceAtomic: string }).balanceAtomic).toBe("99996");
    const callsBeforeRestartReplay = provider.requests.length;
    expect(
      (
        await fetch(`${restartedBase}/api/v1/chat/completions`, authorized(aliceToken, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": sharedKey },
          body: JSON.stringify({ model: "default" }),
        }))
      ).status,
    ).toBe(409);
    expect(provider.requests).toHaveLength(callsBeforeRestartReplay);

    for (const secret of sensitiveValues) {
      expect(runningApp.containsRawLogValue(secret)).toBe(false);
    }
  } finally {
    await runningApp?.stop();
    runningApp = undefined;
    await provider.stop();
  }
});
