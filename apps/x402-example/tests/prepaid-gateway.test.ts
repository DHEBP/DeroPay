import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "bun:test";
import {
  buildRateCardAdapters,
  validateRateCard,
  type RateCard,
} from "../src/lib/inference-gateway";
import { challengeHandler } from "../src/lib/auth";

const card = validateRateCard(
  JSON.parse(readFileSync(resolve("rate-card.example.json"), "utf8")),
);

test("rate card covers the complete configured modality surface", () => {
  const paths = new Set(card.routes.map((route) => `${route.method} ${route.path}`));
  for (const route of [
    "GET /api/v1/models",
    "POST /api/v1/chat/completions",
    "POST /api/v1/responses",
    "POST /api/v1/embeddings",
    "POST /api/v1/image/generate",
    "POST /api/v1/images/generations",
    "POST /api/v1/image/upscale",
    "POST /api/v1/image/edit",
    "POST /api/v1/image/multi-edit",
    "POST /api/v1/image/background-remove",
    "POST /api/v1/audio/speech",
    "POST /api/v1/audio/transcriptions",
    "POST /api/v1/audio/complete",
    "POST /api/v1/audio/queue",
    "POST /api/v1/audio/retrieve",
    "POST /api/v1/video/complete",
    "POST /api/v1/video/queue",
    "POST /api/v1/video/retrieve",
    "POST /api/v1/video/transcriptions",
  ]) {
    expect(paths.has(route)).toBe(true);
  }
});

test("token, stream, operation, and free adapters produce bounded charges", async () => {
  const adapters = buildRateCardAdapters(card, {
    upstreamBaseUrl: "https://models.example",
    upstreamHeaders: { Authorization: "Bearer secret" },
  });
  const request = new Request("http://gateway/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "anything", stream: false }),
  });
  const body = new Uint8Array(await request.clone().arrayBuffer());
  const context = {
    request,
    accountId: "dero1alice",
    method: "POST",
    pathname: "/api/v1/chat/completions",
    body,
  };
  const chat = adapters.find((adapter) => adapter.id === "chat-completions")!;
  expect((await chat.quote(context)).reserveAtomic).toBe(50_000n);
  expect(
    await chat.measure!(context, Response.json({ usage: { prompt_tokens: 10, completion_tokens: 5 } })),
  ).toBe(2n);
  const meter = chat.createStreamMeter!(context, new Response());
  meter.write(
    new TextEncoder().encode(
      'data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\ndata: [DONE]\n\n',
    ),
  );
  expect(await meter.finish()).toBe(2n);

  const image = adapters.find((adapter) => adapter.id === "image-generate")!;
  const imageContext = { ...context, pathname: "/api/v1/image/generate" };
  expect(await image.measure!(imageContext, Response.json({ ok: true }))).toBe(50_000n);
  const models = adapters.find((adapter) => adapter.id === "models")!;
  expect((await models.quote({ ...context, method: "GET", pathname: "/api/v1/models" })).reserveAtomic).toBe(0n);
});

test("rate card validation rejects an operation priced above its reservation", () => {
  const invalid: RateCard = {
    version: 1,
    routes: [
      {
        id: "bad",
        method: "POST",
        path: "/api/v1/image/generate",
        kind: "operation",
        reserveAtomic: "1",
        models: { "*": { chargeAtomic: "2" } },
      },
    ],
  };
  expect(() => validateRateCard(invalid)).toThrow();
});

test("production auth rejects the public development secret", () => {
  // process.env.NODE_ENV is typed read-only; go through the untyped env
  // record to flip it for this test, same as the getter above already reads.
  const env = process.env as Record<string, string | undefined>;
  const nodeEnv = env.NODE_ENV;
  const jwtSecret = env.DERO_AUTH_JWT_SECRET;
  env.NODE_ENV = "production";
  delete env.DERO_AUTH_JWT_SECRET;
  try {
    expect(() => challengeHandler(new Request("http://localhost/api/auth/challenge"))).toThrow(
      "DERO_AUTH_JWT_SECRET must be a non-default secret",
    );
  } finally {
    env.NODE_ENV = nodeEnv;
    if (jwtSecret === undefined) delete env.DERO_AUTH_JWT_SECRET;
    else env.DERO_AUTH_JWT_SECRET = jwtSecret;
  }
});
