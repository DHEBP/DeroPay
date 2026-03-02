import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebhookDispatcher, createWebhookEvent } from "../src/webhook/dispatcher.js";
import { makeInvoice, makePayment } from "./helpers.js";

function mockFetchResponse(status: number) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
  } as Response);
}

describe("WebhookDispatcher", () => {
  let dispatcher: WebhookDispatcher;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.fn().mockImplementation(() => mockFetchResponse(200));
    vi.stubGlobal("fetch", fetchSpy);

    dispatcher = new WebhookDispatcher({
      url: "https://example.com/webhook",
      secret: "test-secret-123",
      maxRetries: 3,
      retryDelayMs: 100,
      timeoutMs: 5_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("dispatch()", () => {
    it("sends POST with correct headers", async () => {
      const event = createWebhookEvent("invoice.completed", makeInvoice({ status: "completed" }));
      const result = await dispatcher.dispatch(event);

      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledOnce();

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://example.com/webhook");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers["X-DeroPay-Signature"]).toMatch(/^sha256=[0-9a-f]+$/);
      expect(options.headers["X-DeroPay-Event"]).toBe("invoice.completed");
      expect(options.headers["X-DeroPay-Delivery"]).toBe(event.id);
      expect(options.headers["User-Agent"]).toBe("DeroPay-Webhook/1.0");
    });

    it("returns true on 2xx response", async () => {
      const event = createWebhookEvent("invoice.created", makeInvoice());
      const result = await dispatcher.dispatch(event);
      expect(result).toBe(true);
    });

    it("logs successful delivery", async () => {
      const event = createWebhookEvent("invoice.created", makeInvoice());
      await dispatcher.dispatch(event);

      const log = dispatcher.getDeliveryLog();
      expect(log).toHaveLength(1);
      expect(log[0].success).toBe(true);
      expect(log[0].statusCode).toBe(200);
      expect(log[0].attempt).toBe(1);
      expect(log[0].eventId).toBe(event.id);
      expect(log[0].url).toBe("https://example.com/webhook");
    });

    it("serializes bigint values as strings in the payload", async () => {
      const event = createWebhookEvent("invoice.created", makeInvoice({ amount: 500_000n }));
      await dispatcher.dispatch(event);

      const body = fetchSpy.mock.calls[0][1].body;
      const parsed = JSON.parse(body);
      expect(parsed.invoice.amount).toBe("500000");
    });
  });

  describe("retry on failure", () => {
    it("retries and succeeds on second attempt", async () => {
      fetchSpy
        .mockImplementationOnce(() => mockFetchResponse(500))
        .mockImplementationOnce(() => mockFetchResponse(200));

      const event = createWebhookEvent("invoice.created", makeInvoice());

      const resultPromise = dispatcher.dispatch(event);

      // First attempt fails, advance past retry delay (100ms * 2^0 = 100ms)
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const log = dispatcher.getDeliveryLog();
      expect(log).toHaveLength(2);
      expect(log[0].success).toBe(false);
      expect(log[0].attempt).toBe(1);
      expect(log[1].success).toBe(true);
      expect(log[1].attempt).toBe(2);
    });

    it("returns false after max retries exhausted", async () => {
      fetchSpy.mockImplementation(() => mockFetchResponse(500));

      const event = createWebhookEvent("invoice.created", makeInvoice());

      const resultPromise = dispatcher.dispatch(event);
      // Advance past all retry delays: 100ms, 200ms, (no wait after last)
      await vi.advanceTimersByTimeAsync(500);

      const result = await resultPromise;
      expect(result).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      const log = dispatcher.getDeliveryLog();
      expect(log).toHaveLength(3);
      expect(log.every((d) => !d.success)).toBe(true);
    });

    it("handles network errors (fetch throws)", async () => {
      fetchSpy.mockRejectedValue(new Error("Network error"));

      const event = createWebhookEvent("invoice.created", makeInvoice());
      const resultPromise = dispatcher.dispatch(event);
      await vi.advanceTimersByTimeAsync(500);

      const result = await resultPromise;
      expect(result).toBe(false);

      const log = dispatcher.getDeliveryLog();
      expect(log[0].statusCode).toBe(0);
      expect(log[0].error).toBe("Network error");
    });
  });

  describe("send()", () => {
    it("creates event and dispatches it", async () => {
      const invoice = makeInvoice({ status: "completed" });
      const payment = makePayment({ status: "confirmed" });

      const result = await dispatcher.send("payment.confirmed", invoice, payment);
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledOnce();

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.type).toBe("payment.confirmed");
      expect(body.payment).toBeDefined();
      expect(body.payment.txid).toBe("tx-abc123");
    });

    it("works without a payment", async () => {
      const result = await dispatcher.send("invoice.created", makeInvoice());
      expect(result).toBe(true);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.type).toBe("invoice.created");
      expect(body.payment).toBeUndefined();
    });
  });

  describe("delivery log", () => {
    it("accumulates entries across multiple dispatches", async () => {
      await dispatcher.send("invoice.created", makeInvoice());
      await dispatcher.send("invoice.completed", makeInvoice({ status: "completed" }));

      const log = dispatcher.getDeliveryLog();
      expect(log).toHaveLength(2);
    });

    it("returns a copy of the log", async () => {
      await dispatcher.send("invoice.created", makeInvoice());

      const a = dispatcher.getDeliveryLog();
      const b = dispatcher.getDeliveryLog();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it("clearDeliveryLog empties the log", async () => {
      await dispatcher.send("invoice.created", makeInvoice());
      expect(dispatcher.getDeliveryLog()).toHaveLength(1);

      dispatcher.clearDeliveryLog();
      expect(dispatcher.getDeliveryLog()).toHaveLength(0);
    });
  });
});
