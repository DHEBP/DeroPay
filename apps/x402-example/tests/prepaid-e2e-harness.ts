import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import { createServer as createNetServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionManager } from "dero-auth/server";
import { PrepaidLedger } from "dero-pay/prepaid";
import { SqliteInvoiceStore } from "dero-pay/server";

export const TEST_ADDRESSES = {
  alice: "dero1qyhdlj6vz8ryudhcwlrmauhd9y25kwkw0artpmlp976c3dchsc3mqqgl0hr24",
  bob: "dero1qyq2s2hnc9qk50uh0kl3cm8ae20cdf6jtgjzulhfwn4x0gcrs5u4sqgm0hr7n",
  carol: "dero1qyg2ewekufpc80m9wcmsa8n5xtzqw4c6duxd2hun5ux6glsek2stwqqp7jd8j",
} as const;

const testDirectory = dirname(fileURLToPath(import.meta.url));

export type ProviderRequest = {
  method: string;
  pathname: string;
  headers: Headers;
  body: string;
};

export type FakeProvider = {
  origin: string;
  requests: ProviderRequest[];
  slowStarted: Promise<void>;
  releaseSlow(): void;
  stop(): Promise<void>;
};

export type RunningApp = {
  baseUrl: string;
  logs(): string;
  containsRawLogValue(value: string): boolean;
  stop(): Promise<void>;
};

function deferred() {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export async function waitFor<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  let last!: T;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      last = await read();
      if (accept(last)) return last;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `${options.label ?? "condition"} timed out after ${timeoutMs}ms` +
      (lastError instanceof Error ? `: ${lastError.message}` : `; last=${String(last)}`),
  );
}

export async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port");
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return address.port;
}

export async function seedBalances(
  dbPath: string,
  balances: Record<string, bigint>,
): Promise<void> {
  const store = new SqliteInvoiceStore({ path: dbPath });
  const ledger = new PrepaidLedger({ store });
  try {
    for (const [accountId, amountAtomic] of Object.entries(balances)) {
      if (amountAtomic > 0n) {
        await ledger.credit({
          accountId,
          amountAtomic,
          reference: `test-seed:${accountId}`,
          metadata: { source: "prepaid-e2e" },
        });
      }
    }
  } finally {
    await store.close();
  }
}

export async function createAuthToken(
  secret: string,
  address: string,
  expirySeconds = 3_600,
): Promise<string> {
  return (await createSessionManager({ secret, expirySeconds }).createSession(
    address,
    address.startsWith("dero1"),
  )).token;
}

export async function startFakeProvider(): Promise<FakeProvider> {
  const requests: ProviderRequest[] = [];
  const slowStarted = deferred();
  const slowRelease = deferred();
  const server = createHttpServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString("utf8");
      const pathname = new URL(request.url ?? "/", "http://provider.test").pathname;
      requests.push({
        method: request.method ?? "GET",
        pathname,
        headers: new Headers(
          Object.entries(request.headers).flatMap(([name, value]) =>
            value === undefined
              ? []
              : [[name, Array.isArray(value) ? value.join(", ") : value] as [string, string]],
          ),
        ),
        body,
      });
      let scenario = "";
      try {
        scenario = JSON.parse(body)?.scenario ?? "";
      } catch {
        // Non-JSON payloads are valid for operation routes.
      }
      if (scenario === "slow") {
        slowStarted.resolve();
        await slowRelease.promise;
      }
      if (scenario === "provider-error") {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "provider failed" }));
        return;
      }
      if (pathname === "/api/v1/models") {
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Set-Cookie": "provider-session=must-not-leak",
        });
        response.end(JSON.stringify({ data: [{ id: "default" }] }));
        return;
      }
      if (scenario === "stream-cancel") {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.write("data: {\"delta\":\"first\"}\n\n");
        await once(response, "close");
        return;
      }
      if (scenario === "stream" || scenario === "stream-missing-usage") {
        const usage = scenario === "stream"
          ? 'data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n'
          : 'data: {"delta":"done"}\n\n';
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.end(`${usage}data: [DONE]\n\n`);
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": "provider-session=must-not-leak",
      });
      response.end(
        JSON.stringify(
          scenario === "missing-usage"
            ? { id: "missing-usage" }
            : pathname.includes("/image/")
              ? { id: "image-1" }
              : { id: "chat-1", usage: { prompt_tokens: 10, completion_tokens: 5 } },
        ),
      );
    } catch (error) {
      if (!response.headersSent) response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "provider error" }));
    }
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fake provider did not bind");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    slowStarted: slowStarted.promise,
    releaseSlow: slowRelease.resolve,
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    },
  };
}

function sanitize(value: string, secrets: string[]): string {
  return secrets.reduce(
    (output, secret) => (secret ? output.replaceAll(secret, "[REDACTED]") : output),
    value,
  );
}

export async function startNextApp(options: {
  dbPath: string;
  upstreamBaseUrl: string;
  authSecret: string;
  receiptSecret: string;
  rateCardPath?: string;
  walletRpcUrl?: string;
  daemonRpcUrl?: string;
  extraEnv?: Record<string, string>;
  redact?: string[];
}): Promise<RunningApp> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const appRoot = resolve(testDirectory, "..");
  const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
  const processHandle = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
      cwd: appRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: baseUrl,
        DERO_AUTH_JWT_SECRET: options.authSecret,
        DEROPAY_RECEIPT_SECRET: options.receiptSecret,
        DEROPAY_DB_PATH: options.dbPath,
        DEROPAY_CHAIN_ID: "dero-testnet",
        DEROPAY_WALLET_RPC_URL:
          options.walletRpcUrl ?? "http://127.0.0.1:1/json_rpc",
        DEROPAY_DAEMON_RPC_URL:
          options.daemonRpcUrl ?? "http://127.0.0.1:1/json_rpc",
        DEROPAY_UPSTREAM_BASE_URL: options.upstreamBaseUrl,
        DEROPAY_UPSTREAM_API_KEY: "provider-test-key",
        DEROPAY_UPSTREAM_AUTH_HEADER: "",
        DEROPAY_UPSTREAM_AUTH_VALUE: "",
        DEROPAY_RATE_CARD_PATH:
          options.rateCardPath ?? resolve(appRoot, "rate-card.example.json"),
        DEROPAY_MAX_PROXY_BYTES: "512",
        DEROPAY_MAX_PROXY_ATOMIC: "100000",
        PREPAID_REQUIRED_CONFIRMATIONS: "3",
        PREPAID_MIN_TOP_UP_ATOMIC: "50000",
        PREPAID_SUGGESTED_TOP_UP_ATOMIC: "500000",
        PREPAID_MAX_TOP_UP_ATOMIC: "100000000000",
        PREPAID_MIN_CONSUME_ATOMIC: "1",
        ...options.extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  let output = "";
  const append = (chunk: string) => {
    output = (output + chunk).slice(-16_384);
  };
  processHandle.stdout.on("data", (chunk) => append(String(chunk)));
  processHandle.stderr.on("data", (chunk) => append(String(chunk)));
  const redactions = [
    options.authSecret,
    options.receiptSecret,
    "provider-test-key",
    ...(options.redact ?? []),
  ];
  const running: RunningApp = {
    baseUrl,
    logs: () => sanitize(output, redactions),
    containsRawLogValue: (value) => Boolean(value) && output.includes(value),
    async stop() {
      if (processHandle.exitCode === null) processHandle.kill();
      if (processHandle.exitCode === null) {
        await Promise.race([once(processHandle, "exit"), sleep(5_000)]);
      }
    },
  };
  try {
    await waitFor(
      async () => {
        if (processHandle.exitCode !== null) {
          throw new Error(`Next exited with ${processHandle.exitCode}: ${running.logs()}`);
        }
        return fetch(baseUrl, { redirect: "manual" });
      },
      (response) => response.status >= 200 && response.status < 500,
      { timeoutMs: 60_000, intervalMs: 250, label: "Next server readiness" },
    );
    return running;
  } catch (error) {
    await running.stop();
    throw error;
  }
}

export function authorized(token: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}
