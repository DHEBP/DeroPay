import { describe, expect, it } from "vitest";
import { PrepaidLedger } from "../src/prepaid/ledger.js";
import { createMeteredProxy, type MeteredRouteAdapter } from "../src/prepaid/proxy.js";
import { MemoryInvoiceStore } from "../src/store/memory.js";

function adapter(measure = 60n): MeteredRouteAdapter {
  return {
    id: "chat",
    matches: ({ method, pathname }) => method === "POST" && pathname === "/api/v1/chat/completions",
    quote: () => ({ reserveAtomic: 100n }),
    upstreamUrl: () => "https://models.example/v1/chat",
    upstreamHeaders: { Authorization: "Bearer server-secret" },
    measure: () => measure,
  };
}

describe("metered prepaid proxy", () => {
  it("reserves, strips client secrets, captures actual usage, and rejects replay", async () => {
    const store = new MemoryInvoiceStore();
    const ledger = new PrepaidLedger({ store });
    await ledger.credit({ accountId: "dero1alice", amountAtomic: 200n, reference: "topup:1" });
    let upstreamHeaders = new Headers();
    const proxy = createMeteredProxy({
      ledger,
      authenticate: () => "dero1alice",
      adapters: [adapter()],
      allowedUpstreamOrigins: ["https://models.example"],
      fetch: async (_input, init) => {
        upstreamHeaders = new Headers(init?.headers);
        return Response.json({ usage: { prompt_tokens: 1, completion_tokens: 1 } });
      },
    });
    const request = () =>
      new Request("http://gateway/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer wallet-session",
          "X-DeroPay-Receipt": "must-not-forward",
          "Idempotency-Key": "request-1",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
    const response = await proxy(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Balance-Remaining")).toBe("140");
    expect(upstreamHeaders.get("Authorization")).toBe("Bearer server-secret");
    expect(upstreamHeaders.has("X-DeroPay-Receipt")).toBe(false);
    expect((await proxy(request())).status).toBe(409);
  });

  it("returns 402 without calling upstream and releases holds on provider errors", async () => {
    const store = new MemoryInvoiceStore();
    const ledger = new PrepaidLedger({ store });
    let calls = 0;
    const proxy = createMeteredProxy({
      ledger,
      authenticate: () => "dero1alice",
      adapters: [adapter()],
      allowedUpstreamOrigins: ["https://models.example"],
      fetch: async () => {
        calls++;
        return new Response("bad", { status: 503 });
      },
    });
    const make = (key: string) =>
      new Request("http://gateway/api/v1/chat/completions", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: "{}",
      });
    expect((await proxy(make("poor"))).status).toBe(402);
    expect(calls).toBe(0);
    await ledger.credit({ accountId: "dero1alice", amountAtomic: 100n, reference: "topup:1" });
    expect((await proxy(make("provider-error"))).status).toBe(503);
    expect((await ledger.getBalance("dero1alice"))).toMatchObject({
      availableAtomic: 100n,
      reservedAtomic: 0n,
    });

    const brokenHeaders = createMeteredProxy({
      ledger,
      authenticate: () => "dero1alice",
      adapters: [{ ...adapter(), upstreamHeaders: () => { throw new Error("missing key"); } }],
      allowedUpstreamOrigins: ["https://models.example"],
      fetch: async () => Response.json({}),
    });
    expect((await brokenHeaders(make("broken-headers"))).status).toBe(500);
    expect((await ledger.getBalance("dero1alice"))).toMatchObject({
      availableAtomic: 100n,
      reservedAtomic: 0n,
    });
  });

  it("captures measured streams and the full reserve when a client cancels", async () => {
    const store = new MemoryInvoiceStore();
    const ledger = new PrepaidLedger({ store });
    await ledger.credit({ accountId: "dero1alice", amountAtomic: 250n, reference: "topup:stream" });
    const streamingAdapter: MeteredRouteAdapter = {
      ...adapter(),
      measure: undefined,
      createStreamMeter: () => {
        let bytes = 0n;
        return {
          write(chunk) {
            bytes += BigInt(chunk.byteLength);
          },
          finish: () => bytes,
        };
      },
    };
    const proxy = createMeteredProxy({
      ledger,
      authenticate: () => "dero1alice",
      adapters: [streamingAdapter],
      allowedUpstreamOrigins: ["https://models.example"],
      fetch: async () =>
        new Response("data: one\n\ndata: two\n\n", {
          headers: { "Content-Type": "text/event-stream" },
        }),
    });
    const request = (key: string) =>
      new Request("http://gateway/api/v1/chat/completions", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: "{}",
      });
    const completed = await proxy(request("stream-complete"));
    expect((await completed.text()).length).toBe(22);
    expect((await ledger.getBalance("dero1alice")).availableAtomic).toBe(228n);

    const cancelled = await proxy(request("stream-cancel"));
    await cancelled.body!.cancel("client disconnected");
    expect((await ledger.getBalance("dero1alice"))).toMatchObject({
      availableAtomic: 128n,
      reservedAtomic: 0n,
    });
  });

  it("rejects bad requests before upstream and releases every failed reservation", async () => {
    const store = new MemoryInvoiceStore();
    const ledger = new PrepaidLedger({ store });
    await ledger.credit({ accountId: "dero1alice", amountAtomic: 300n, reference: "topup:guards" });
    let calls = 0;
    const makeProxy = (
      candidate: MeteredRouteAdapter,
      fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = async () =>
        Response.json({}),
    ) =>
      createMeteredProxy({
        ledger,
        authenticate: (request) => request.headers.get("X-Account"),
        adapters: [candidate],
        allowedUpstreamOrigins: ["https://models.example"],
        maxRequestBytes: 8,
        maxAtomicPerRequest: 100n,
        fetch: async (input, init) => {
          calls++;
          return fetchImpl(input, init);
        },
      });
    const request = (key: string, body = "{}", account = "dero1alice") =>
      new Request("http://gateway/api/v1/chat/completions", {
        method: "POST",
        headers: { "Idempotency-Key": key, "X-Account": account },
        body,
      });

    const normal = makeProxy(adapter());
    expect((await normal(new Request("http://gateway/api/v1/chat/completions", { method: "POST" }))).status).toBe(401);
    expect((await normal(new Request("http://gateway/api/v1/unknown", { headers: { "X-Account": "dero1alice" } }))).status).toBe(404);
    expect((await normal(request("large", "123456789"))).status).toBe(413);
    expect(
      (
        await normal(
          new Request("http://gateway/api/v1/chat/completions", {
            method: "POST",
            headers: { "X-Account": "dero1alice" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(400);

    const pricingFailure = makeProxy({ ...adapter(), quote: () => { throw new Error("unknown model"); } });
    expect((await pricingFailure(request("pricing"))).status).toBe(400);
    const invalidPrice = makeProxy({ ...adapter(), quote: () => ({ reserveAtomic: 101n }) });
    expect((await invalidPrice(request("invalid-price"))).status).toBe(500);
    const disallowed = makeProxy({ ...adapter(), upstreamUrl: () => "https://attacker.example/steal" });
    expect((await disallowed(request("origin"))).status).toBe(500);
    const unavailable = makeProxy(adapter(), async () => { throw new Error("offline"); });
    expect((await unavailable(request("offline"))).status).toBe(502);

    expect(calls).toBe(1);
    expect(await ledger.getBalance("dero1alice")).toMatchObject({
      availableAtomic: 300n,
      reservedAtomic: 0n,
    });
  });

  it("forwards free routes safely and caps unknown or under-reserved usage", async () => {
    const store = new MemoryInvoiceStore();
    const ledger = new PrepaidLedger({ store });
    await ledger.credit({ accountId: "dero1alice", amountAtomic: 200n, reference: "topup:metering" });
    let upstreamHeaders = new Headers();
    const events: string[] = [];
    const free: MeteredRouteAdapter = {
      id: "models",
      matches: ({ method, pathname }) => method === "GET" && pathname === "/api/v1/models",
      quote: () => ({ reserveAtomic: 0n }),
      upstreamUrl: () => "https://models.example/api/v1/models",
    };
    const proxy = createMeteredProxy({
      ledger,
      authenticate: () => "dero1alice",
      adapters: [free, adapter(150n)],
      allowedUpstreamOrigins: ["https://models.example"],
      onEvent: (event) => events.push(event.type),
      fetch: async (_input, init) => {
        upstreamHeaders = new Headers(init?.headers);
        return Response.json({ ok: true }, { headers: { "Set-Cookie": "provider=secret" } });
      },
    });
    const freeResponse = await proxy(
      new Request("http://gateway/api/v1/models", {
        headers: {
          Authorization: "Bearer wallet-session",
          Cookie: "wallet=cookie",
          "X-Payment": "payment-secret",
        },
      }),
    );
    expect(freeResponse.status).toBe(200);
    expect(freeResponse.headers.has("Set-Cookie")).toBe(false);
    expect(upstreamHeaders.has("Authorization")).toBe(false);
    expect(upstreamHeaders.has("Cookie")).toBe(false);
    expect(upstreamHeaders.has("X-Payment")).toBe(false);
    expect((await ledger.listTransactions("dero1alice")).total).toBe(1);

    const charged = await proxy(
      new Request("http://gateway/api/v1/chat/completions", {
        method: "POST",
        headers: { "Idempotency-Key": "under-reserved" },
        body: "{}",
      }),
    );
    expect(charged.status).toBe(200);
    expect(await ledger.getBalance("dero1alice")).toMatchObject({
      availableAtomic: 100n,
      reservedAtomic: 0n,
    });
    expect(events).toContain("prepaid.proxy_under_reserved");

    const unknownUsage = createMeteredProxy({
      ledger,
      authenticate: () => "dero1alice",
      adapters: [{ ...adapter(), measure: () => null }],
      allowedUpstreamOrigins: ["https://models.example"],
      fetch: async () => Response.json({ ok: true }),
    });
    expect(
      (
        await unknownUsage(
          new Request("http://gateway/api/v1/chat/completions", {
            method: "POST",
            headers: { "Idempotency-Key": "unknown-usage" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(200);
    expect((await ledger.getBalance("dero1alice")).availableAtomic).toBe(0n);
  });

  it("isolates identical wallet keys and prevents concurrent overspending", async () => {
    const store = new MemoryInvoiceStore();
    const ledger = new PrepaidLedger({ store });
    await ledger.credit({ accountId: "dero1alice", amountAtomic: 200n, reference: "topup:alice" });
    await ledger.credit({ accountId: "dero1bob", amountAtomic: 200n, reference: "topup:bob" });
    let calls = 0;
    const isolated = createMeteredProxy({
      ledger,
      authenticate: (request) => request.headers.get("X-Account"),
      adapters: [adapter()],
      allowedUpstreamOrigins: ["https://models.example"],
      fetch: async () => {
        calls++;
        return Response.json({ ok: true });
      },
    });
    const request = (account: string, key: string) =>
      new Request("http://gateway/api/v1/chat/completions", {
        method: "POST",
        headers: { "X-Account": account, "Idempotency-Key": key },
        body: "{}",
      });
    const [alice, bob] = await Promise.all([
      isolated(request("dero1alice", "same-key")),
      isolated(request("dero1bob", "same-key")),
    ]);
    expect([alice.status, bob.status]).toEqual([200, 200]);
    expect((await ledger.getBalance("dero1alice")).availableAtomic).toBe(140n);
    expect((await ledger.getBalance("dero1bob")).availableAtomic).toBe(140n);
    expect(calls).toBe(2);

    await ledger.credit({ accountId: "dero1carol", amountAtomic: 100n, reference: "topup:carol" });
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const concurrent = createMeteredProxy({
      ledger,
      authenticate: () => "dero1carol",
      adapters: [adapter()],
      allowedUpstreamOrigins: ["https://models.example"],
      fetch: async () => {
        started();
        await gate;
        return Response.json({ ok: true });
      },
    });
    const first = concurrent(request("dero1carol", "carol:first"));
    await waiting;
    expect((await concurrent(request("dero1carol", "carol:second"))).status).toBe(402);
    release();
    expect((await first).status).toBe(200);
    expect(await ledger.getBalance("dero1carol")).toMatchObject({
      availableAtomic: 40n,
      reservedAtomic: 0n,
    });
  });
});
