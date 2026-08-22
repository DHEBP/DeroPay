import { describe, expect, it } from "vitest";
import {
  createPrepaidClient,
  PrepaidClientResponseError,
} from "../src/prepaid/client.js";

describe("prepaid client", () => {
  it("keeps wallet credentials on-origin and adds idempotency to writes", async () => {
    const calls: Array<{ url: string; init?: RequestInit; paid: boolean }> = [];
    const respond = (paid: boolean) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init, paid });
      return Response.json({ ok: true });
    };
    const client = createPrepaidClient({
      baseUrl: "https://gateway.example/base/",
      walletAddress: "dero1alice",
      getAuthToken: () => "wallet-session",
      fetch: respond(false),
      payingFetch: respond(true),
      createIdempotencyKey: () => "generated-key",
    });

    await client.getBalance();
    await client.getTransactions({ limit: 10, offset: 20 });
    await client.request("/api/v1/chat/completions", { method: "POST", body: "{}" });
    await client.topUp(50n, "topup-key");

    expect(calls.map(({ url, paid }) => ({ url, paid }))).toEqual([
      { url: "https://gateway.example/api/v1/x402/balance/dero1alice", paid: false },
      {
        url: "https://gateway.example/api/v1/x402/transactions/dero1alice?limit=10&offset=20",
        paid: false,
      },
      { url: "https://gateway.example/api/v1/chat/completions", paid: false },
      { url: "https://gateway.example/api/v1/x402/top-up", paid: true },
    ]);
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe(
      "Bearer wallet-session",
    );
    expect(new Headers(calls[0].init?.headers).has("Idempotency-Key")).toBe(false);
    expect(new Headers(calls[2].init?.headers).get("Idempotency-Key")).toBe("generated-key");
    expect(new Headers(calls[3].init?.headers).get("Idempotency-Key")).toBe("topup-key");

    await expect(client.request("https://attacker.example/steal")).rejects.toThrow(
      "Refusing to send DeroAuth credentials",
    );
  });

  it("rejects empty sessions, non-positive top-ups, and non-success responses", async () => {
    const emptySession = createPrepaidClient({
      baseUrl: "https://gateway.example",
      walletAddress: "dero1alice",
      getAuthToken: () => " ",
      fetch: async () => Response.json({}),
    });
    await expect(emptySession.getBalance()).rejects.toThrow("session token is empty");
    await expect(emptySession.topUp(0n)).rejects.toThrow("greater than zero");

    const denied = createPrepaidClient({
      baseUrl: "https://gateway.example",
      walletAddress: "dero1alice",
      getAuthToken: () => "token",
      fetch: async () => Response.json({ error: "denied" }, { status: 403 }),
    });
    await expect(denied.getBalance()).rejects.toBeInstanceOf(PrepaidClientResponseError);
  });
});
